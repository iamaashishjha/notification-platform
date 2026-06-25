import type { ApiList } from '../types/api';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('notification_admin_token');
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? 'Request failed');
  }
  return data as T;
}

export function list<T>(path: string) {
  return apiRequest<ApiList<T>>(path);
}
