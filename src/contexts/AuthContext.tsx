import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { WORKER_BASE, getSessionToken, setSessionToken, setUnauthorizedHandler } from '../lib/api';

const AUTH_KEY = 'pd-planner-auth';

export interface AuthUser {
  email: string;
  name: string;
  picture?: string;
  isAdmin?: boolean; // Worker가 검증 후 내려준 값 (UI 표시용, 실제 권한은 Worker가 판단)
}

interface AuthContextValue {
  user: AuthUser | null;
  isAdmin: boolean;
  login: (googleCredential: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadUser(): AuthUser | null {
  // 세션 토큰이 없는 예전 로그인 정보는 무효 — 다시 로그인하게 한다
  if (!getSessionToken()) return null;
  try {
    const s = localStorage.getItem(AUTH_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

function disableGoogleAutoSelect() {
  const g = (window as unknown as { google?: { accounts?: { id?: { disableAutoSelect?: () => void } } } }).google;
  g?.accounts?.id?.disableAutoSelect?.();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadUser);

  const isAdmin = user?.isAdmin === true;

  // Google ID 토큰을 Worker로 보내 검증받고 세션 토큰을 받는다.
  // 접속 로그도 Worker가 검증된 이메일로 기록한다.
  async function login(googleCredential: string) {
    const res = await fetch(`${WORKER_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: googleCredential }),
    });
    const data = await res.json().catch(() => ({})) as {
      token?: string; user?: AuthUser; error?: string;
    };
    if (!res.ok || !data.token || !data.user) {
      throw new Error(data.error ?? `로그인 실패 (${res.status})`);
    }
    setSessionToken(data.token);
    localStorage.setItem(AUTH_KEY, JSON.stringify(data.user));
    setUser(data.user);
  }

  function logout() {
    setUser(null);
    setSessionToken(null);
    localStorage.removeItem(AUTH_KEY);
    disableGoogleAutoSelect();
  }

  // Worker가 401을 주면(세션 만료 등) 로그인 화면으로
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      localStorage.removeItem(AUTH_KEY);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
