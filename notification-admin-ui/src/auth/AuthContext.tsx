import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/client';
import type { Principal } from '../types/api';

type AuthContextValue = {
  token: string | null;
  user: Principal | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (permission: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem('notification_admin_token'));
  const [user, setUser] = useState<Principal | null>(() => {
    const raw = localStorage.getItem('notification_admin_user');
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    if (!token) return;
    apiRequest<{ user: Principal }>('/admin/api/v1/auth/me')
      .then((res) => {
        setUser(res.user);
        localStorage.setItem('notification_admin_user', JSON.stringify(res.user));
      })
      .catch(() => logout());
  }, [token]);

  async function login(email: string, password: string) {
    const res = await apiRequest<{ access_token: string; user: Principal }>('/admin/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    localStorage.setItem('notification_admin_token', res.access_token);
    localStorage.setItem('notification_admin_user', JSON.stringify(res.user));
    setToken(res.access_token);
    setUser(res.user);
  }

  function logout() {
    localStorage.removeItem('notification_admin_token');
    localStorage.removeItem('notification_admin_user');
    setToken(null);
    setUser(null);
  }

  const value = useMemo<AuthContextValue>(() => ({
    token,
    user,
    login,
    logout,
    can: (permission: string) => Boolean(user?.is_platform_admin || user?.permissions?.includes(permission))
  }), [token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
