'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, applySession, refreshSession, SessionUser, setSessionListener } from './api';

interface Auth {
  user: SessionUser | null;
  /** true inta la hubinayo fadhiga (refresh cookie) marka bogga la furo */
  loading: boolean;
  login: (phone: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    setSessionListener((s) => {
      setUser(s?.user ?? null);
      if (!s) qc.clear();
    });
    // bogga marka la furo: cookie-ga refresh → access token (xusuusta)
    refreshSession().finally(() => setLoading(false));
  }, [qc]);

  const login = useCallback(async (phone: string, password: string) => {
    const s = await api<{ accessToken: string; user: SessionUser }>('/auth/login', { method: 'POST', body: { phone, password } });
    applySession(s);
    return s.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
    } finally {
      applySession(null);
    }
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const s = await api<{ accessToken: string; user: SessionUser }>('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
    applySession(s);
  }, []);

  return <Ctx.Provider value={{ user, loading, login, logout, changePassword }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside provider');
  return c;
}
