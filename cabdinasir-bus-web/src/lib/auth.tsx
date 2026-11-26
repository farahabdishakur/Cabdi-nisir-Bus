'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, applySession, lastRefreshWasOffline, refreshSession, SessionUser, setSessionListener } from './api';

const LAST_USER = 'session:user';

interface Auth {
  user: SessionUser | null;
  /** true inta la hubinayo fadhiga (refresh cookie) marka bogga la furo */
  loading: boolean;
  login: (phone: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Taleefanka login-ka beddel (password-ka hadda waajib) */
  changePhone: (currentPassword: string, newPhone: string) => Promise<void>;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    setSessionListener((s) => {
      setUser(s?.user ?? null);
      try {
        if (s) sessionStorage.setItem(LAST_USER, JSON.stringify(s.user));
        else sessionStorage.removeItem(LAST_USER);
      } catch {
        /* ignore */
      }
      if (!s) qc.clear();
    });
    // bogga marka la furo: cookie-ga refresh → access token (xusuusta).
    // Offline (internet go'an, ma aha 401): user-kii tab-kan ayaa la sii hayaa → alaab offline ayaa la diiwaangelin karaa;
    // marka internet-ku soo noqdo, 401 → refresh → token cusub (cookie).
    refreshSession()
      .then((s) => {
        if (!s && lastRefreshWasOffline) {
          try {
            const u = sessionStorage.getItem(LAST_USER);
            if (u) setUser(JSON.parse(u) as SessionUser);
          } catch {
            /* ignore */
          }
        }
      })
      .finally(() => setLoading(false));
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

  const changePhone = useCallback(async (currentPassword: string, newPhone: string) => {
    const s = await api<{ accessToken: string; user: SessionUser }>('/auth/change-phone', { method: 'POST', body: { currentPassword, newPhone } });
    applySession(s);
  }, []);

  return <Ctx.Provider value={{ user, loading, login, logout, changePassword, changePhone }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside provider');
  return c;
}
