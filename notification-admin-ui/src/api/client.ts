import type { ApiList } from '../types/api';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const ACCESS_TOKEN_KEY = 'notification_admin_token';
const REFRESH_TOKEN_KEY = 'notification_admin_refresh_token';
const USER_KEY = 'notification_admin_user';
const LOGOUT_EVENT = 'notification_admin_logout';
let refreshRequest: Promise<boolean> | null = null;

const STATUS_ERROR_CODES: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'AUTHENTICATION_ERROR',
  403: 'AUTHORIZATION_ERROR',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
};

function errorCodeForStatus(status: number) {
  return STATUS_ERROR_CODES[status] ?? (status >= 500 ? 'SERVER_ERROR' : 'REQUEST_ERROR');
}

function cleanServerMessage(data: any, response: Response) {
  const raw = data?.message || data?.error || data?.detail || response.statusText || 'Request failed';
  return String(raw).replace(/\s+/g, ' ').trim();
}

export class ApiError extends Error {
  status: number;
  code: string;
  detail: string;

  constructor(status: number, code: string, detail: string) {
    super(`${code} (${status}): ${detail}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export function getErrorMessage(error: unknown, fallback = 'Request failed') {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && shouldRefresh(path)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiRequest<T>(path, options);
    clearAuthAndRedirect();
  }
  if (!response.ok) {
    throw new ApiError(response.status, errorCodeForStatus(response.status), cleanServerMessage(data, response));
  }
  return data as T;
}

function shouldRefresh(path: string) {
  return !path.includes('/admin/api/v1/auth/login') && !path.includes('/admin/api/v1/auth/refresh');
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return false;
  if (!refreshRequest) {
    refreshRequest = fetch(`${API_BASE}/admin/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.access_token || !data.refresh_token) return false;
      localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
      if (data.user) localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      return true;
    }).catch(() => false).finally(() => {
      refreshRequest = null;
    });
  }
  return refreshRequest;
}

function clearAuthAndRedirect() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event(LOGOUT_EVENT));
  if (window.location.pathname !== '/login') window.location.replace('/login');
}

export function list<T>(path: string) {
  return apiRequest<ApiList<T>>(path);
}

export function listPage<T>(path: string, params: Record<string, string | number | undefined> = {}) {
  const [base, existing = ''] = path.split('?');
  const query = new URLSearchParams(existing);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  const qs = query.toString();
  return list<T>(base + (qs ? `?${qs}` : ''));
}
