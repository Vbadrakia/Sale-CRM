import type { Pagination } from '@/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';
const TOKEN_KEY = 'crm.token';

export const AUTH_INVALIDATION_CODES = new Set([
  'AUTH_REQUIRED',
  'AUTH_INVALID_TOKEN',
  'AUTH_TOKEN_EXPIRED',
  'ACCOUNT_NOT_FOUND',
  'ACCOUNT_DISABLED',
]);

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  errors: { field?: string; message: string }[];
  requestId?: string;

  constructor(
    status: number,
    message: string,
    code?: string,
    errors: { field?: string; message: string }[] = [],
    requestId?: string,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
    this.requestId = requestId;
  }

  get isSessionInvalidation(): boolean {
    if (!this.code) return false;
    return AUTH_INVALIDATION_CODES.has(this.code);
  }

  get isAuthError(): boolean {
    return this.isSessionInvalidation;
  }

  get isNetworkOrServerError(): boolean {
    return this.status === 0 || this.status >= 500;
  }

  /** Field-level messages keyed by field name, for inline form errors. */
  get fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const error of this.errors) {
      if (error.field) result[error.field] = error.message;
    }
    return result;
  }
}

export const tokenStore = {
  get: () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token || token === 'undefined' || token === 'null' || token.trim() === '') return null;
    return token;
  },
  set: (token: string) => {
    if (token && typeof token === 'string' && token !== 'undefined' && token !== 'null') {
      localStorage.setItem(TOKEN_KEY, token);
    }
  },
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

let onUnauthorized: ((code?: string) => void) | null = null;
export function setUnauthorizedHandler(handler: (code?: string) => void) {
  onUnauthorized = handler;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  query?: Record<string, string | number | boolean | undefined | null | ''>;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_URL}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<{ data: T; pagination?: Pagination; message: string }> {
  const token = tokenStore.get();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!options.formData) headers['Content-Type'] = 'application/json';

  const method = options.method ?? 'GET';
  let response: Response | undefined;
  // Retry up to 2 attempts for GET requests on transient network or 5xx failures
  const maxAttempts = method === 'GET' ? 2 : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), 30000);
    const signal = options.signal ?? timeoutController.signal;

    try {
      response = await fetch(buildUrl(path, options.query), {
        method,
        headers,
        body: options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
        signal,
      });
      clearTimeout(timeoutId);
      if (response.ok || attempt === maxAttempts) break;
      if (response.status >= 500 && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ApiRequestError(0, 'Request timed out. Please check your connection and try again.', 'TIMEOUT');
      }
      const msg = err instanceof Error ? err.message : 'Cannot reach the server. Check your connection and try again.';
      throw new ApiRequestError(0, msg, 'NETWORK_ERROR');
    }
  }

  if (!response) {
    throw new ApiRequestError(0, 'Cannot reach the server. Check your connection and try again.', 'NETWORK_ERROR');
  }

  const requestId = response.headers.get('x-request-id') ?? undefined;

  if (response.status === 204) return { data: undefined as T, message: 'OK' };

  const text = await response.text();
  let payload: {
    success?: boolean;
    code?: string;
    data?: T;
    message?: string;
    errors?: { field?: string; message: string }[];
    pagination?: Pagination;
  };

  try {
    payload = JSON.parse(text);
  } catch {
    const contentType = response.headers.get('content-type') ?? '';
    const trimmedText = text.trim();
    if (
      contentType.includes('text/html') ||
      contentType.includes('text/plain') ||
      /^<!doctype html/i.test(trimmedText) ||
      trimmedText === ''
    ) {
      throw new ApiRequestError(response.status || 502, 'Service temporarily unavailable. Please try again.', 'SERVER_ERROR', [], requestId);
    }
    throw new ApiRequestError(response.status, 'The server returned an unexpected response.', 'SERVER_ERROR', [], requestId);
  }

  if (!response.ok || payload.success === false) {
    const rawErrorObj = (payload as { error?: { code?: string; message?: string } }).error;
    const errCode = payload.code || rawErrorObj?.code;
    const errMessage = payload.message || rawErrorObj?.message || 'Request failed';
    const isLoginEndpoint = path.startsWith('/auth/login');
    const isSessionInvalid = !isLoginEndpoint && Boolean(errCode && AUTH_INVALIDATION_CODES.has(errCode));

    if (isSessionInvalid) {
      console.warn(`[API] Session invalidation triggered by ${path}: status=${response.status}, code=${errCode}, reqId=${requestId}`);
      onUnauthorized?.(errCode);
    }

    throw new ApiRequestError(response.status, errMessage, errCode, payload.errors ?? [], requestId);
  }

  return { data: payload.data as T, pagination: payload.pagination, message: payload.message ?? 'OK' };
}

/** Downloads a file from an authenticated endpoint. */
export async function downloadFile(path: string, fileName: string): Promise<void> {
  const token = tokenStore.get();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, { headers });
  const requestId = response.headers.get('x-request-id') ?? undefined;

  if (!response.ok) {
    const text = await response.text();
    let errCode: string | undefined;
    let message = 'Could not download the file';
    try {
      const parsed = JSON.parse(text);
      errCode = parsed.code;
      if (parsed.message) message = parsed.message;
    } catch {
      // Plain error
    }

    const isSessionInvalid = Boolean(errCode && AUTH_INVALIDATION_CODES.has(errCode));

    if (isSessionInvalid) {
      onUnauthorized?.(errCode);
    }

    throw new ApiRequestError(response.status, message, errCode, [], requestId);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
