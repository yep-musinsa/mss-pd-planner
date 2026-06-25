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

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // ── 관리자 토큰 저장 ──
    if (url.pathname === '/jira-proxy/admin/save-token' && request.method === 'POST') {
      try {
        const body = await request.json();
        if (body.email) await env.PD_KV.put('jira_email', body.email);
        if (body.token) await env.PD_KV.put('jira_token', body.token);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), {
          status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

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
};
