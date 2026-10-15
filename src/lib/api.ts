// Worker 호출 공통 헬퍼
// 로그인 시 Worker가 발급한 세션 토큰을 Authorization 헤더로 붙인다.
// 401을 받으면 세션이 만료/무효화된 것이므로 로그아웃 처리한다.

export const IS_LOCAL = window.location.hostname === 'localhost';

// 로컬: Vite dev 서버가 /jira-proxy 를 Worker로 프록시 (vite.config.ts)
export const WORKER_BASE = IS_LOCAL
  ? '/jira-proxy'
  : 'https://jira-proxy.ye-park.workers.dev/jira-proxy';

const SESSION_KEY = 'pd-planner-session';

export function getSessionToken(): string | null {
  try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
}

export function setSessionToken(token: string | null) {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getSessionToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${WORKER_BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    setSessionToken(null);
    onUnauthorized?.();
  }
  return res;
}
