// Cloudflare Worker - Jira 읽기 전용 프록시 + 팀 공용 데이터(KV) + 출근 슬랙 알림
//
// 바인딩 / 시크릿
//   PD_KV              KV namespace
//   SESSION_SECRET     세션 토큰 서명용 랜덤 문자열 (wrangler secret put SESSION_SECRET)
//   SLACK_WEBHOOK_URL  출근 알림 슬랙 웹훅
//
// 인증 흐름
//   1. 브라우저가 Google 로그인으로 받은 ID 토큰을 POST /jira-proxy/auth/login 으로 보낸다.
//   2. Worker가 Google 공개키로 서명·aud·만료·도메인을 검증하고, 자체 세션 토큰(HMAC 서명)을 발급한다.
//   3. 이후 모든 요청은 Authorization: Bearer <세션 토큰> 이 있어야 처리된다.
//   어드민 여부도 클라이언트가 보낸 값이 아니라 검증된 세션의 이메일로 판단한다.

const ALLOWED_ORIGINS = [
  'https://yep-musinsa.github.io',
  'http://localhost:5173',
];

const GOOGLE_CLIENT_ID = '1040868381866-f57f7porkkpsnnl0oeaq634djh9bi9qj.apps.googleusercontent.com';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ALLOWED_EMAIL_DOMAINS = ['musinsa.com', '29cm.co.kr'];
const SESSION_TTL_SEC = 14 * 24 * 3600; // 14일

// 프록시로 허용하는 Jira API — 읽기 전용 검색 하나만 연다.
const JIRA_ALLOWED_PATHS = ['/rest/api/3/search/jql'];

const ADMIN_EMAIL = 'ye.park@musinsa.com';
const ACCESS_LOG_KEY = 'access_log';
const MAX_LOG_ENTRIES = 500;

// ── 출근 현황 슬랙 알림용 상수 ──
// email은 출근 현황 수정 권한 확인(본인 행만 수정)에 쓰인다.
const ATT_MEMBERS = [
  { id: 'm1', name: '김선경', email: 'seonkyung.kim@musinsa.com' },
  { id: 'm2', name: '류진한', email: 'jinhan.ryu@musinsa.com' },
  { id: 'm3', name: '박영은', email: 'ye.park@musinsa.com' },
  { id: 'm4', name: '유호재', email: 'hojae.yoo@musinsa.com' },
  { id: 'm5', name: '이미희', email: 'mihee.lee@29cm.co.kr' },
  { id: 'm6', name: '이지향', email: 'scent.lee@musinsa.com' },
];
const WORK_MODES = ['office', 'wfh', 'off'];
const ATT_HOLIDAYS = {
  '2026-01-01': '신정', '2026-02-16': '설날 연휴', '2026-02-17': '설날', '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절', '2026-03-02': '대체공휴일', '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날', '2026-05-25': '대체공휴일', '2026-06-06': '현충일',
  '2026-08-15': '광복절', '2026-08-17': '대체공휴일', '2026-09-24': '추석 연휴', '2026-09-25': '추석',
  '2026-09-26': '추석 연휴', '2026-10-03': '개천절', '2026-10-05': '대체공휴일', '2026-10-09': '한글날', '2026-12-25': '성탄절',
};
const DOW_KR = ['일', '월', '화', '수', '목', '금', '토'];

// UTC 기준 Date → 한국시간(KST) 달력값을 담은 Date
function kstDate(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600 * 1000);
}
function ymd(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function md(d) {
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}
function addDaysUTC(d, n) {
  return new Date(d.getTime() + n * 86400000);
}

// 하루 오피스 출근율 (오피스 / (오피스+재택), 휴가·미입력 제외; 미입력은 오피스로 간주)
function dayRate(attendance, dateStr) {
  let office = 0, present = 0;
  for (const m of ATT_MEMBERS) {
    const st = attendance[m.id]?.[dateStr] ?? 'office';
    if (st === 'office') { office++; present++; }
    else if (st === 'wfh') { present++; }
  }
  return present > 0 ? Math.round((office / present) * 100) : null;
}

// 매일 09:00 — 오늘 근무 현황
function buildDailyMessage(attendance, todayKst) {
  const dateStr = ymd(todayKst);
  if (ATT_HOLIDAYS[dateStr]) return null; // 공휴일엔 발송 안 함
  const office = [], wfh = [], off = [];
  for (const m of ATT_MEMBERS) {
    const st = attendance[m.id]?.[dateStr] ?? 'office';
    if (st === 'office') office.push(m.name);
    else if (st === 'wfh') wfh.push(m.name);
    else if (st === 'off') off.push(m.name);
  }
  const pct = dayRate(attendance, dateStr);
  const warn = pct !== null && pct < 50;
  const lines = [`*오늘 근무 현황 - 오피스 출근율 ${pct === null ? '-' : pct + '%'}*${warn ? ' ⚠️ 50% 미만' : ''}`];
  if (office.length) lines.push(`🏢 오피스 - ${office.join(', ')}`);
  if (wfh.length) lines.push(`🏠 재택 - ${wfh.join(', ')}`);
  if (off.length) lines.push(`🌴 휴가 - ${off.join(', ')}`);
  return lines.join('\n');
}

// 금요일 17:00 — 다음 주 현황 (요일별 재택/휴가 명단)
function buildWeeklyMessage(attendance, todayKst) {
  const dow = todayKst.getUTCDay();
  const toMon = ((1 - dow + 7) % 7) || 7; // 다음 주 월요일
  const nextMon = addDaysUTC(todayKst, toMon);
  const days = Array.from({ length: 5 }, (_, i) => addDaysUTC(nextMon, i));
  const lowDays = [];
  const lines = [`*다음 주 출근 현황 (${md(days[0])}~${md(days[4])})*`];
  for (const d of days) {
    const ds = ymd(d);
    const label = `${md(d)}(${DOW_KR[d.getUTCDay()]})`;
    if (ATT_HOLIDAYS[ds]) { lines.push(`${label} · ${ATT_HOLIDAYS[ds]}`); continue; }
    const wfh = [], off = [];
    for (const m of ATT_MEMBERS) {
      const st = attendance[m.id]?.[ds] ?? 'office';
      if (st === 'wfh') wfh.push(m.name);
      else if (st === 'off') off.push(m.name);
    }
    const statusParts = [];
    if (wfh.length) statusParts.push(`재택 - ${wfh.join(', ')}`);
    if (off.length) statusParts.push(`휴가 - ${off.join(', ')}`);
    const pct = dayRate(attendance, ds);
    const warn = pct !== null && pct < 50;
    if (warn) lowDays.push(`${DOW_KR[d.getUTCDay()]}요일`);
    const body = statusParts.length ? ' · ' + statusParts.join(' / ') : '';
    lines.push(label + body + (warn ? ' ⚠️' : ''));
  }
  if (lowDays.length) lines.push(`\n⚠️ 오피스 출근율 50% 미만: *${lowDays.join(', ')}*`);
  return lines.join('\n');
}

async function sendSlack(webhookUrl, text) {
  if (!webhookUrl) return false;
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, username: 'CBP PD 출근봇앱', icon_emoji: ':office:' }),
  });
  return res.ok;
}

// ── 공통 응답 헬퍼 ──────────────────────────────────────────────
function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  const h = {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(request, data, status = 200) {
  return new Response(typeof data === 'string' ? data : JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  });
}

// ── base64url / HMAC ─────────────────────────────────────────────
const enc = new TextEncoder();

function b64urlEncode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64urlJson(str) {
  return JSON.parse(new TextDecoder().decode(b64urlDecode(str)));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

// ── Google ID 토큰 검증 ──────────────────────────────────────────
let jwksCache = { keys: null, exp: 0 };

async function getGoogleKeys() {
  if (jwksCache.keys && Date.now() < jwksCache.exp) return jwksCache.keys;
  const res = await fetch(GOOGLE_JWKS_URL);
  if (!res.ok) throw new Error('Google 공개키 조회 실패');
  const { keys } = await res.json();
  const maxAge = Number((res.headers.get('Cache-Control') || '').match(/max-age=(\d+)/)?.[1] ?? 3600);
  jwksCache = { keys, exp: Date.now() + maxAge * 1000 };
  return keys;
}

function emailAllowed(email) {
  const domain = String(email).toLowerCase().split('@')[1];
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

async function verifyGoogleIdToken(idToken) {
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw new Error('잘못된 토큰 형식');
  const header = b64urlJson(parts[0]);
  const payload = b64urlJson(parts[1]);
  if (header.alg !== 'RS256') throw new Error('지원하지 않는 서명 알고리즘');

  const keys = await getGoogleKeys();
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('서명 키를 찾을 수 없음');
  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, b64urlDecode(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`),
  );
  if (!ok) throw new Error('서명 검증 실패');

  const now = Math.floor(Date.now() / 1000);
  if (!GOOGLE_ISSUERS.includes(payload.iss)) throw new Error('발급자 불일치');
  if (payload.aud !== GOOGLE_CLIENT_ID) throw new Error('클라이언트 ID 불일치');
  if (typeof payload.exp !== 'number' || payload.exp < now - 60) throw new Error('만료된 토큰');
  if (payload.email_verified !== true && payload.email_verified !== 'true') throw new Error('이메일 미인증 계정');
  if (!emailAllowed(payload.email)) throw new Error('허용되지 않은 도메인');

  return { email: String(payload.email).toLowerCase(), name: payload.name ?? '', picture: payload.picture };
}

// ── 세션 토큰 (payload.signature, HMAC-SHA256) ──────────────────
async function issueSession(env, user) {
  const payload = { email: user.email, name: user.name, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC };
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env.SESSION_SECRET), enc.encode(body));
  return { token: `${body}.${b64urlEncode(new Uint8Array(sig))}`, exp: payload.exp };
}

async function readSession(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+([\w-]+)\.([\w-]+)$/);
  if (!m || !env.SESSION_SECRET) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(env.SESSION_SECRET), b64urlDecode(m[2]), enc.encode(m[1]));
    if (!ok) return null;
    const payload = b64urlJson(m[1]);
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!emailAllowed(payload.email)) return null;
    return { email: payload.email, name: payload.name, isAdmin: payload.email === ADMIN_EMAIL };
  } catch {
    return null;
  }
}

// ── 라우터 ───────────────────────────────────────────────────────
async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // ── 로그인: Google ID 토큰 → 세션 토큰 (인증 없이 호출 가능한 유일한 경로) ──
  if (path === '/jira-proxy/auth/login' && method === 'POST') {
    if (!env.SESSION_SECRET) return json(request, { error: '서버 설정 오류 (SESSION_SECRET 없음)' }, 500);
    let user;
    try {
      const { credential } = await request.json();
      user = await verifyGoogleIdToken(credential);
    } catch (e) {
      return json(request, { error: `로그인 검증 실패: ${e.message}` }, 401);
    }
    const { token, exp } = await issueSession(env, user);

    // 접속 로그 — 검증된 이메일로만 기록
    const existing = await env.PD_KV.get(ACCESS_LOG_KEY);
    const logs = existing ? JSON.parse(existing) : [];
    logs.unshift({ email: user.email, name: user.name, time: new Date().toISOString(), ua: request.headers.get('User-Agent') ?? '' });
    if (logs.length > MAX_LOG_ENTRIES) logs.splice(MAX_LOG_ENTRIES);
    await env.PD_KV.put(ACCESS_LOG_KEY, JSON.stringify(logs));

    return json(request, { token, exp, user: { ...user, isAdmin: user.email === ADMIN_EMAIL } });
  }

  // ── 여기부터는 모두 로그인 필요 ──
  const session = await readSession(request, env);
  if (!session) return json(request, { error: '로그인이 필요합니다' }, 401);
  const forbidden = () => json(request, { error: '권한이 없습니다' }, 403);

  // ── 어드민: Jira 토큰 설정 여부 ──
  if (path === '/jira-proxy/admin/token-status' && method === 'GET') {
    if (!session.isAdmin) return forbidden();
    const token = await env.PD_KV.get('jira_token');
    return json(request, { configured: !!token });
  }

  // ── 어드민: Jira 토큰 저장 ──
  if (path === '/jira-proxy/admin/save-token' && method === 'POST') {
    if (!session.isAdmin) return forbidden();
    const { email, token } = await request.json().catch(() => ({}));
    if (!email || !token) return json(request, { ok: false, error: 'email, token 필수' }, 400);
    await env.PD_KV.put('jira_email', String(email));
    await env.PD_KV.put('jira_token', String(token));
    return json(request, { ok: true });
  }

  // ── 어드민: 접속 로그 조회 ──
  if (path === '/jira-proxy/access-log' && method === 'GET') {
    if (!session.isAdmin) return forbidden();
    return json(request, (await env.PD_KV.get(ACCESS_LOG_KEY)) ?? '[]');
  }

  // ── 커스텀 타이틀 ──
  if (path === '/jira-proxy/custom-titles' && method === 'GET') {
    return json(request, (await env.PD_KV.get('custom_titles')) ?? '{}');
  }
  if (path === '/jira-proxy/custom-titles' && method === 'POST') {
    const titles = await request.json().catch(() => null);
    if (!titles || typeof titles !== 'object' || Array.isArray(titles)) return json(request, { ok: false, error: '잘못된 형식' }, 400);
    await env.PD_KV.put('custom_titles', JSON.stringify(titles));
    return json(request, { ok: true });
  }

  // ── 출근 현황 ──
  // 저장 구조: { [memberId]: { [YYYY-MM-DD]: 'office' | 'wfh' | 'off' } }
  if (path === '/jira-proxy/attendance' && method === 'GET') {
    return json(request, (await env.PD_KV.get('attendance')) ?? '{}');
  }
  if (path === '/jira-proxy/attendance' && method === 'POST') {
    const { memberId, date, status } = await request.json().catch(() => ({}));
    if (!memberId || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return json(request, { ok: false, error: 'memberId, date 필수' }, 400);
    if (status && !WORK_MODES.includes(status)) return json(request, { ok: false, error: '잘못된 status' }, 400);
    // 어드민은 전체, 그 외에는 본인 행만 수정 가능
    const member = ATT_MEMBERS.find(m => m.id === memberId);
    if (!member) return json(request, { ok: false, error: '알 수 없는 팀원' }, 400);
    if (!session.isAdmin && member.email !== session.email) return forbidden();

    const existing = await env.PD_KV.get('attendance');
    const all = existing ? JSON.parse(existing) : {};
    if (!all[memberId]) all[memberId] = {};
    if (status) all[memberId][date] = status;
    else delete all[memberId][date];
    await env.PD_KV.put('attendance', JSON.stringify(all));
    return json(request, { ok: true });
  }

  // ── 어드민: 출근 알림 수동 테스트 ──
  // GET /jira-proxy/attendance/notify-test?type=daily|weekly[&send=1]
  if (path === '/jira-proxy/attendance/notify-test' && method === 'GET') {
    if (!session.isAdmin) return forbidden();
    const type = url.searchParams.get('type') || 'daily';
    const doSend = url.searchParams.get('send') === '1';
    const raw = await env.PD_KV.get('attendance');
    const attendance = raw ? JSON.parse(raw) : {};
    const today = kstDate();
    const text = type === 'weekly' ? buildWeeklyMessage(attendance, today) : buildDailyMessage(attendance, today);
    let sent = false;
    if (doSend && text) sent = await sendSlack(env.SLACK_WEBHOOK_URL, text);
    return json(request, { type, mode: doSend ? 'sent' : 'preview-only', sent, skipped: !text, preview: text ?? '(공휴일이라 발송 안 함)' });
  }

  // ── 예정 업무 (전체 교체) ──
  if (path === '/jira-proxy/planned' && method === 'GET') {
    return json(request, (await env.PD_KV.get('planned_items')) ?? '[]');
  }
  if (path === '/jira-proxy/planned' && method === 'POST') {
    const items = await request.json().catch(() => null);
    if (!Array.isArray(items)) return json(request, { ok: false, error: '배열이어야 합니다' }, 400);
    await env.PD_KV.put('planned_items', JSON.stringify(items));
    return json(request, { ok: true });
  }

  // ── Jira 프록시: 읽기 전용, 허용 목록 경로만 ──
  const jiraPath = path.replace(/^\/jira-proxy/, '');
  if (path.startsWith('/jira-proxy/') && method === 'GET' && JIRA_ALLOWED_PATHS.includes(jiraPath)) {
    const storedEmail = await env.PD_KV.get('jira_email');
    const storedToken = await env.PD_KV.get('jira_token');
    if (!storedEmail || !storedToken) return json(request, { error: 'Worker에 Jira 토큰이 설정되지 않았습니다' }, 503);

    const response = await fetch(`https://musinsa-oneteam.atlassian.net${jiraPath}${url.search}`, {
      method: 'GET',
      headers: {
        // 클라이언트가 보낸 Authorization은 절대 넘기지 않는다
        'Authorization': 'Basic ' + btoa(`${storedEmail}:${storedToken}`),
        'Accept': 'application/json',
      },
    });
    // Jira 인증 실패를 401로 그대로 넘기면 브라우저가 '세션 만료'로 오해해 로그아웃된다 → 502로 구분
    if (response.status === 401 || response.status === 403) {
      return json(request, { error: 'Worker에 저장된 Jira 토큰이 유효하지 않습니다 — Jira 설정에서 토큰을 다시 저장해주세요' }, 502);
    }
    return json(request, await response.text(), response.status);
  }

  return json(request, { error: 'Not found' }, 404);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    try {
      return await handle(request, env);
    } catch (e) {
      return json(request, { error: String(e) }, 500);
    }
  },

  // ── Cron 스케줄 알림 ──
  // 요일 판단은 코드가 KST 기준으로 하므로 cron에는 요일을 넣지 않는다.
  // 매일 알림:  0 0 * * *  (00:00 UTC = 09:00 KST) → 코드가 월~금만 발송
  // 주간 알림:  0 8 * * *  (08:00 UTC = 17:00 KST) → 코드가 금요일만 발송
  async scheduled(event, env, ctx) {
    const run = async () => {
      const raw = await env.PD_KV.get('attendance');
      const attendance = raw ? JSON.parse(raw) : {};
      const today = kstDate();
      const dow = today.getUTCDay(); // KST 요일 (0=일 … 6=토)
      let text = null;
      if (event.cron === '0 8 * * *') {
        // 주간: 금요일(5)에만
        if (dow === 5) text = buildWeeklyMessage(attendance, today);
      } else {
        // 매일: 월~금(1~5)에만, 공휴일이면 buildDailyMessage가 null 반환
        if (dow >= 1 && dow <= 5) text = buildDailyMessage(attendance, today);
      }
      if (text) await sendSlack(env.SLACK_WEBHOOK_URL, text);
    };
    ctx.waitUntil(run());
  },
};
