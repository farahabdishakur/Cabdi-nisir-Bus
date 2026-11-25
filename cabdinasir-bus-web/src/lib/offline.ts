'use client';

/**
 * Offline mode (UI_RULES §6, backend DEPLOYMENT §4): internet-ku marka uu go'o, ALAABTA waa la diiwaangelin karaa.
 * - Waxaa lagu kaydiyaa IndexedDB (kombiyuutarka) — tab-ka oo la xiro xataa way sii jiraan.
 * - Marka internet-ku soo noqdo → POST /sync/parcels (Idempotency-Key → laba jeer ma noqoto; PIN-ka client-ka).
 * - Tigidh / wareejin / void → online kaliya (kursi laba jeer ayaa la iibin karaa).
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { api, ApiError } from './api';
import type { PaymentInput } from './types';

export interface OfflineParcelInput {
  toBranchId: string;
  categoryId: string;
  weightKg: number;
  pieces: number;
  description?: string;
  senderName: string;
  senderPhone: string;
  receiverName: string;
  receiverPhone: string;
  isFragile: boolean;
  insured: boolean;
  packagingOk: boolean;
  payer: 'SENDER' | 'RECEIVER';
  declaredValueCents?: number;
  payment?: PaymentInput;
}

export interface OfflineItem {
  idempotencyKey: string;
  offlineCreatedAt: string;
  pickupPin: string;
  parcel: OfflineParcelInput;
  /** qiyaas (server-ka ayaa mar kale xisaabiya) */
  estimateCents: number;
  toBranchName: string;
  status: 'pending' | 'error' | 'synced';
  error?: { code: string; message?: string };
  trackingCode?: string;
  parcelId?: string;
}

const DB = 'cabdinasir-offline';
const STORE = 'parcels';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'idempotencyKey' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

// --- tiny store so the UI (topbar count, offline page) re-renders on change
let items: OfflineItem[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function loadQueue() {
  if (typeof indexedDB === 'undefined') return items;
  items = (await tx<OfflineItem[]>('readonly', (s) => s.getAll() as IDBRequest<OfflineItem[]>)).sort((a, b) => a.offlineCreatedAt.localeCompare(b.offlineCreatedAt));
  emit();
  return items;
}

export async function enqueue(item: OfflineItem) {
  await tx('readwrite', (s) => s.put(item));
  await loadQueue();
}

export async function removeItem(key: string) {
  await tx('readwrite', (s) => s.delete(key));
  await loadQueue();
}

export async function getItem(key: string): Promise<OfflineItem | undefined> {
  return tx<OfflineItem | undefined>('readonly', (s) => s.get(key) as IDBRequest<OfflineItem | undefined>);
}

export function useOfflineQueue(): OfflineItem[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
    () => items,
  );
}

let syncing = false;

/** U dir server-ka wixii sugaya. Natiijada item kasta: synced (koodh dhab ah) ama error (sabab). */
export async function syncQueue(): Promise<{ synced: number; failed: number } | null> {
  if (syncing) return null;
  const pending = (await loadQueue()).filter((i) => i.status !== 'synced');
  if (!pending.length) return { synced: 0, failed: 0 };
  syncing = true;
  try {
    const res = await api<{ results: { idempotencyKey: string; ok: boolean; trackingCode?: string; id?: string; error?: { code: string; message?: string } }[] }>('/sync/parcels', {
      method: 'POST',
      body: { items: pending.map((i) => ({ idempotencyKey: i.idempotencyKey, offlineCreatedAt: i.offlineCreatedAt, pickupPin: i.pickupPin, parcel: i.parcel })) },
    });
    let synced = 0;
    let failed = 0;
    for (const r of res.results) {
      const it = pending.find((p) => p.idempotencyKey === r.idempotencyKey);
      if (!it) continue;
      if (r.ok) {
        synced++;
        await tx('readwrite', (s) => s.put({ ...it, status: 'synced', trackingCode: r.trackingCode, parcelId: r.id, error: undefined }));
      } else {
        failed++;
        await tx('readwrite', (s) => s.put({ ...it, status: 'error', error: r.error }));
      }
    }
    await loadQueue();
    return { synced, failed };
  } catch (e) {
    if (e instanceof ApiError && e.code === 'NETWORK_ERROR') return null;
    throw e;
  } finally {
    syncing = false;
  }
}

/** Kuwa la diray (synced) ka saar liiska kadib 24 saac. */
export async function pruneSynced() {
  for (const i of await loadQueue()) {
    if (i.status === 'synced' && Date.now() - new Date(i.offlineCreatedAt).getTime() > 86400_000) await removeItem(i.idempotencyKey);
  }
}

/** Internet ma jiraa? (browser + isku day dhab ah ayaa la isku daraa) */
export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

export function randomPin(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 10000).padStart(4, '0');
}

// --- bootstrap cache (qiimaha, laamaha, noocyada) si offline loogu shaqeeyo
const BOOT_KEY = 'bootstrap:v1';
export function saveBootstrap(data: unknown) {
  try {
    localStorage.setItem(BOOT_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}
export function loadBootstrap<T>(): T | undefined {
  try {
    const v = localStorage.getItem(BOOT_KEY);
    return v ? (JSON.parse(v) as T) : undefined;
  } catch {
    return undefined;
  }
}
