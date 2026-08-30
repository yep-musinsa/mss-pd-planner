// Cloudflare Worker - Jira CORS Proxy + Shared Planned Items
// KV binding: PD_KV

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

const ADMIN_EMAIL = 'ye.park@musinsa.com';
const ACCESS_LOG_KEY = 'access_log';
const MAX_LOG_ENTRIES = 500;

// ── 출근 현황 슬랙 알림용 상수 ──
const ATT_MEMBERS = [
  { id: 'm1', name: '김선경' },
  { id: 'm2', name: '류진한' },
  { id: 'm3', name: '박영은' },
  { id: 'm4', name: '유호재' },
  { id: 'm5', name: '이미희' },
  { id: 'm6', name: '이지향' },
];
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
  const lines = [`*오늘 근무 현황* - 오피스 출근율 *${pct === null ? '-' : pct + '%'}*${warn ? ' ⚠️ 50% 미만' : ''}`];
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
    if (ATT_HOLIDAYS[ds]) { lines.push(`${label} · 🎌 ${ATT_HOLIDAYS[ds]}`); continue; }
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
    body: JSON.stringify({ text }),
  });
  return res.ok;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // ── 토큰 설정 여부 확인 ──
    if (url.pathname === '/jira-proxy/admin/token-status' && request.method === 'GET') {
      const token = await env.PD_KV.get('jira_token');
      return new Response(JSON.stringify({ configured: !!token }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── 접속 로그 기록 ──
    if (url.pathname === '/jira-proxy/access-log' && request.method === 'POST') {
      try {
        const body = await request.json();
        const existing = await env.PD_KV.get(ACCESS_LOG_KEY);
        const logs = existing ? JSON.parse(existing) : [];
        logs.unshift({
          email: body.email ?? '',
          name: body.name ?? '',
          time: new Date().toISOString(),
          ua: request.headers.get('User-Agent') ?? '',
        });
        if (logs.length > MAX_LOG_ENTRIES) logs.splice(MAX_LOG_ENTRIES);
        await env.PD_KV.put(ACCESS_LOG_KEY, JSON.stringify(logs));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false }), {
          status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── 접속 로그 조회 (어드민 전용) ──
    if (url.pathname === '/jira-proxy/access-log' && request.method === 'GET') {
      const requester = url.searchParams.get('email');
      if (requester !== ADMIN_EMAIL) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
      const data = await env.PD_KV.get(ACCESS_LOG_KEY);
      return new Response(data ?? '[]', {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── 커스텀 타이틀 조회 ──
    if (url.pathname === '/jira-proxy/custom-titles' && request.method === 'GET') {
      const data = await env.PD_KV.get('custom_titles');
      return new Response(data ?? '{}', {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── 커스텀 타이틀 저장 ──
    if (url.pathname === '/jira-proxy/custom-titles' && request.method === 'POST') {
      try {
        const titles = await request.json();
        await env.PD_KV.put('custom_titles', JSON.stringify(titles));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), {
          status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── 출근 현황 조회 (전체) ──
    // 저장 구조: { [memberId]: { [YYYY-MM-DD]: 'office' | 'wfh' | 'off' } }
    if (url.pathname === '/jira-proxy/attendance' && request.method === 'GET') {
      const data = await env.PD_KV.get('attendance');
      return new Response(data ?? '{}', {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── 출근 현황 저장 (셀 단위 병합) ──
    // body: { memberId, date, status }  status 빈 값이면 해당 셀 삭제
    if (url.pathname === '/jira-proxy/attendance' && request.method === 'POST') {
      try {
        const { memberId, date, status } = await request.json();
        if (!memberId || !date) {
          return new Response(JSON.stringify({ ok: false, error: 'memberId, date 필수' }), {
            status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
        const existing = await env.PD_KV.get('attendance');
        const all = existing ? JSON.parse(existing) : {};
        if (!all[memberId]) all[memberId] = {};
        if (status) all[memberId][date] = status;
        else delete all[memberId][date];
        await env.PD_KV.put('attendance', JSON.stringify(all));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), {
          status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── 출근 알림 수동 테스트 (어드민 전용) ──
    // GET /jira-proxy/attendance/notify-test?type=daily|weekly&email=...
    if (url.pathname === '/jira-proxy/attendance/notify-test' && request.method === 'GET') {
      if (url.searchParams.get('email') !== ADMIN_EMAIL) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
      const type = url.searchParams.get('type') || 'daily';
      const doSend = url.searchParams.get('send') === '1'; // send=1일 때만 실제 슬랙 발송
      const raw = await env.PD_KV.get('attendance');
      const attendance = raw ? JSON.parse(raw) : {};
      const today = kstDate();
      const text = type === 'weekly'
        ? buildWeeklyMessage(attendance, today)
        : buildDailyMessage(attendance, today);
      let sent = false;
      if (doSend && text) sent = await sendSlack(env.SLACK_WEBHOOK_URL, text);
      return new Response(JSON.stringify({ type, mode: doSend ? 'sent' : 'preview-only', sent, skipped: !text, preview: text ?? '(공휴일이라 발송 안 함)' }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── 예정 업무 조회 ──
    if (url.pathname === '/jira-proxy/planned' && request.method === 'GET') {
      const data = await env.PD_KV.get('planned_items');
      const items = data ? JSON.parse(data) : [];
      return new Response(JSON.stringify(items), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── 예정 업무 저장 (전체 교체) ──
    if (url.pathname === '/jira-proxy/planned' && request.method === 'POST') {
      try {
        const items = await request.json();
        await env.PD_KV.put('planned_items', JSON.stringify(items));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), {
          status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── Jira API 프록시 ──
    const storedEmail = await env.PD_KV.get('jira_email');
    const storedToken = await env.PD_KV.get('jira_token');

    const authHeader = (storedEmail && storedToken)
      ? 'Basic ' + btoa(storedEmail + ':' + storedToken)
      : request.headers.get('Authorization') || '';

    const target = 'https://musinsa-oneteam.atlassian.net'
      + url.pathname.replace('/jira-proxy', '')
      + url.search;

    const response = await fetch(target, {
      method: request.method,
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: request.method !== 'GET' ? request.body : undefined,
    });

    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  },

  // ── Cron 스케줄 알림 ──
  // 매일 09:00 KST (00:00 UTC, 월~금):  0 0 * * 1-5
  // 매주 금 17:00 KST (08:00 UTC, 금):  0 8 * * 5
  async scheduled(event, env, ctx) {
    const run = async () => {
      const raw = await env.PD_KV.get('attendance');
      const attendance = raw ? JSON.parse(raw) : {};
      const today = kstDate();
      let text = null;
      if (event.cron === '0 8 * * 5') {
        text = buildWeeklyMessage(attendance, today);
      } else {
        text = buildDailyMessage(attendance, today); // 공휴일이면 null → 발송 안 함
      }
      if (text) await sendSlack(env.SLACK_WEBHOOK_URL, text);
    };
    ctx.waitUntil(run());
  },
};
