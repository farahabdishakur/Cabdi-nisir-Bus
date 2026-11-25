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
/** true = refresh-kii ugu dambeeyay internet ayaa ka go'naa (ma aha 401) — offline fadhiga ha la tirtirin */
export let lastRefreshWasOffline = false;

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
      lastRefreshWasOffline = false;
      if (!res.ok) {
        applySession(null);
        return null;
      }
      const data = (await res.json()) as TokenResponse;
      applySession(data);
      return data;
    } catch {
      lastRefreshWasOffline = true;
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
const EXT: Record<string, string> = { 'text/csv': 'csv', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

/** Soo deji fayl (CSV / biil): token-ka header-ka, 401 → refresh hal mar; extension-ka nooca faylka ayaa go'aamiya. */
export async function download(path: string, query: RequestOptions['query'], filename: string, retried = false): Promise<void> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}, credentials: 'include' });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Network error', 0);
  }
  if (res.status === 401 && !retried && (await refreshSession())) return download(path, query, filename, true);
  if (!res.ok) {
    const e = (safeJson(await res.text()) as { error?: { code?: string; message?: string } } | undefined)?.error;
    throw new ApiError(e?.code ?? `HTTP_${res.status}`, e?.message ?? 'Download failed', res.status);
  }
  const blob = await res.blob();
  const ext = EXT[(res.headers.get('content-type') ?? '').split(';')[0].trim()];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = ext && !filename.toLowerCase().endsWith(`.${ext}`) ? `${filename}.${ext}` : filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000); // Safari/Firefox: ha joojin soo dejinta
}

/**
 * Tab-ka daabacaadda: waa in la furaa ISLA markii la riixo (ka hor await) — haddii kale browser-ku (gaar ahaan iPhone)
 * wuu xannibayaa. Kadib `go(url)` marka xogtu timaado, ama `cancel()` haddii khalad dhaco.
 */
export function pendingTab() {
  const w = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  return {
    opened: !!w,
    /** init: xog tab-ka loo gudbinayo ka hor inta aan la furin (tusaale PIN-ka sessionStorage) */
    go(url: string, init?: (tab: Window) => void) {
      if (w && !w.closed) {
        try {
          init?.(w);
        } catch {
          /* ignore */
        }
        w.location.href = url;
      } else window.open(url, '_blank');
    },
    cancel() {
      w?.close();
    },
  };
}

/**
 * Soo geli fayl (sawir/video) oo leh horumarka (progress %) — internet gaabis ah awgiis karraanigu wuu arkaa inta dhimman.
 * 401 → refresh hal mar → isku day mar kale.
 */
export function uploadWithProgress<T>(path: string, form: FormData, onProgress?: (pct: number) => void, retried = false): Promise<T> {
  return new Promise<T>((resolveP, rejectP) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}${path}`);
    xhr.withCredentials = true;
    if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => rejectP(new ApiError('NETWORK_ERROR', 'Network error', 0));
    xhr.onload = async () => {
      if (xhr.status === 401 && !retried && (await refreshSession())) {
        uploadWithProgress<T>(path, form, onProgress, true).then(resolveP, rejectP);
        return;
      }
      const data = xhr.responseText ? safeJson(xhr.responseText) : undefined;
      if (xhr.status >= 200 && xhr.status < 300) return resolveP(data as T);
      const e = (data as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | undefined)?.error;
      rejectP(new ApiError(e?.code ?? (xhr.status === 413 ? 'FILE_TOO_LARGE' : `HTTP_${xhr.status}`), e?.message ?? xhr.statusText, xhr.status, e?.details));
    };
    xhr.send(form);
  });
}

/** Fayl ilaalisan (sawir/video/biil) → blob URL (token-ka header-ka ayuu u baahan yahay) */
export async function fetchBlobUrl(path: string, retried = false): Promise<string> {
  const res = await fetch(`${BASE}${path}`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}, credentials: 'include' });
  if (res.status === 401 && !retried && (await refreshSession())) return fetchBlobUrl(path, true);
  if (!res.ok) throw new ApiError(`HTTP_${res.status}`, res.statusText, res.status);
  return URL.createObjectURL(await res.blob());
}
