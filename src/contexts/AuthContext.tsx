import { createContext, useContext, useState, type ReactNode } from 'react';

const ADMIN_EMAIL = 'ye.park@musinsa.com';
const AUTH_KEY = 'pd-planner-auth';

export interface AuthUser {
  email: string;
  name: string;
  picture?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAdmin: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const s = localStorage.getItem(AUTH_KEY);
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  });

  const isAdmin = user?.email === ADMIN_EMAIL;

  function login(u: AuthUser) {
    setUser(u);
    localStorage.setItem(AUTH_KEY, JSON.stringify(u));
    // 접속 로그 기록 (fire-and-forget)
    const base = window.location.hostname === 'localhost'
      ? '/jira-proxy'
      : 'https://jira-proxy.ye-park.workers.dev/jira-proxy';
    fetch(`${base}/access-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, name: u.name }),
    }).catch(() => {});
  }

  function logout() {
    setUser(null);
    localStorage.removeItem(AUTH_KEY);
    // Google 세션 revoke
    if (typeof window !== 'undefined' && (window as unknown as { google?: { accounts?: { id?: { disableAutoSelect?: () => void } } } }).google?.accounts?.id?.disableAutoSelect) {
      (window as unknown as { google: { accounts: { id: { disableAutoSelect: () => void } } } }).google.accounts.id.disableAutoSelect();
    }
  }

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
