import type { ApiList } from '../types/api';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

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
  const token = localStorage.getItem('notification_admin_token');
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, errorCodeForStatus(response.status), cleanServerMessage(data, response));
  }
  return data as T;
}

export function list<T>(path: string) {
  return apiRequest<ApiList<T>>(path);
}
