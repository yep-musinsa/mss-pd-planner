// Cloudflare Worker - Jira CORS Proxy with KV token storage
// KV binding 이름: PD_KV (Cloudflare 대시보드에서 설정 필요)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-PD-Admin',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
};

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // ── 관리자 토큰 저장 엔드포인트 ──
    // POST /jira-proxy/admin/save-token
    // Body: { email: "...", token: "..." }
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
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── 토큰 설정 여부 확인 ──
    // GET /jira-proxy/admin/token-status
    if (url.pathname === '/jira-proxy/admin/token-status' && request.method === 'GET') {
      const token = await env.PD_KV.get('jira_token');
      return new Response(JSON.stringify({ configured: !!token }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── Jira API 프록시 ──
    // KV에 저장된 토큰 사용, 없으면 요청 헤더에서 가져옴
    const storedEmail = await env.PD_KV.get('jira_email');
    const storedToken = await env.PD_KV.get('jira_token');

    let authHeader;
    if (storedEmail && storedToken) {
      authHeader = 'Basic ' + btoa(storedEmail + ':' + storedToken);
    } else {
      authHeader = request.headers.get('Authorization') || '';
    }

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
