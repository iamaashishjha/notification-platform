import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/client';
import type { Principal } from '../types/api';

const GRANULAR_TO_BROAD: Record<string, string> = {
  'users.view': 'users.manage',
  'users.create': 'users.manage',
  'users.update': 'users.manage',
  'users.delete': 'users.manage',
  'users.reset_password': 'users.manage',
  'users.assign_roles': 'users.manage',
  'users.assign_permissions': 'users.manage',
  'features.view': 'features.manage',
  'features.update': 'features.manage',
  'channels.view': 'channels.manage',
  'channels.update': 'channels.manage',
  'providers.view': 'providers.manage',
  'providers.create': 'providers.manage',
  'providers.update': 'providers.manage',
  'providers.delete': 'providers.manage',
  'providers.test': 'providers.manage',
  'groups.view': 'groups.manage',
  'groups.create': 'groups.manage',
  'groups.update': 'groups.manage',
  'groups.delete': 'groups.manage',
  'groups.members.manage': 'groups.manage',
  'settings.view': 'settings.manage',
  'settings.update': 'settings.manage',
  'api_keys.view': 'api_keys.manage',
  'api_keys.create': 'api_keys.manage',
  'api_keys.revoke': 'api_keys.manage',
  'campaigns.view': 'campaigns.manage',
  'campaigns.create': 'campaigns.manage',
  'campaigns.update': 'campaigns.manage',
  'campaigns.approve': 'campaigns.manage',
  'campaigns.send': 'campaigns.manage',
  'campaigns.schedule': 'campaigns.manage',
  'campaigns.cancel': 'campaigns.manage',
  'templates.view': 'templates.manage',
  'templates.create': 'templates.manage',
  'templates.update': 'templates.manage',
  'templates.delete': 'templates.manage',
  'contacts.view': 'contacts.manage',
  'contacts.create': 'contacts.manage',
  'contacts.update': 'contacts.manage',
  'contacts.delete': 'contacts.manage',
  'notifications.view': 'notifications.manage',
  'notifications.create': 'notifications.manage',
  'notifications.send': 'notifications.manage',
  'notifications.bulk_send': 'notifications.manage',
  'notifications.retry': 'notifications.manage',
  'notifications.cancel': 'notifications.manage',
};

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

  const hasPermission = useMemo(() => {
    return (permission: string): boolean => {
      if (!user) return false;
      if (user.is_platform_admin) return true;
      if (user.permissions?.includes(permission)) return true;
      const broad = GRANULAR_TO_BROAD[permission];
      if (broad && user.permissions?.includes(broad)) return true;
      return false;
    };
  }, [user]);

  const value = useMemo<AuthContextValue>(() => ({
    token,
    user,
    login,
    logout,
    can: hasPermission,
  }), [token, user, hasPermission]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
