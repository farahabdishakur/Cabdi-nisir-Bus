/**
 * API client — xiriirka kaliya ee backend-ka (CLAUDE.md §3).
 * - Access token: xusuusta (memory) — localStorage MA AHA.
 * - Refresh token: httpOnly cookie (backend ayaa dejiya) → 401 → refresh hal mar → isku day mar kale.
 * - POST lacageed: Idempotency-Key (badhan laba jeer la riixo → lacag hal mar).
 * - Khaladka: ApiError { code, message, details } — UI-gu `code`-ka ayuu turjumaa.
 */

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface SessionUser {
  id: string;
  name: string;
  role: 'SUPER_ADMIN' | 'BRANCH_MANAGER' | 'CASHIER' | 'DRIVER';
  branchId: string | null;
  mustChangePassword: boolean;
}

interface TokenResponse {
  accessToken: string;
  user: SessionUser;
}

const BASE = '/api/v1';
let accessToken: string | null = null;
let refreshing: Promise<TokenResponse | null> | null = null;
let onSession: (s: TokenResponse | null) => void = () => undefined;

export function setSessionListener(fn: (s: TokenResponse | null) => void) {
  onSession = fn;
}

export function getAccessToken() {
  return accessToken;
}

export function applySession(s: TokenResponse | null) {
  accessToken = s?.accessToken ?? null;
  onSession(s);
}

/** Refresh hal mar (requests badan oo isku mar 401 helay → hal refresh). */
export function refreshSession(): Promise<TokenResponse | null> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!res.ok) {
        applySession(null);
        return null;
      }
      const data = (await res.json()) as TokenResponse;
      applySession(data);
      return data;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** true → Idempotency-Key cusub; string → key-gan (dib u isku day isla key-ga) */
  idempotencyKey?: boolean | string;
  /** FormData (sawir) */
  form?: FormData;
}

export function newKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function buildUrl(path: string, query?: RequestOptions['query']) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  const s = qs.toString();
  return `${BASE}${path}${s ? `?${s}` : ''}`;
}

export async function api<T>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.idempotencyKey) headers['Idempotency-Key'] = typeof opts.idempotencyKey === 'string' ? opts.idempotencyKey : newKey();

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      credentials: 'include',
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Network error', 0);
  }

  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    const s = await refreshSession();
    if (s) return api<T>(path, opts, true);
  }
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? safeJson(text) : undefined;
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | undefined)?.error;
    if (res.status === 401 && (e?.code === 'SESSION_REVOKED' || e?.code === 'UNAUTHORIZED') && !path.startsWith('/auth/login')) applySession(null);
    throw new ApiError(e?.code ?? `HTTP_${res.status}`, e?.message ?? res.statusText, res.status, e?.details);
  }
  return (data ?? text) as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

/** CSV / fayl: soo deji (token-ka header-ka ayuu raacaa) */
export async function download(path: string, query: RequestOptions['query'], filename: string) {
  const res = await fetch(buildUrl(path, query), { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}, credentials: 'include' });
  if (!res.ok) throw new ApiError(`HTTP_${res.status}`, 'Download failed', res.status);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
