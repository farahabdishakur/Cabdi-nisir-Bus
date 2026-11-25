'use client';

/**
 * Tigidh offline (qoondada kuraasta — BUSINESS_RULES §32):
 * - Online: daqiiqad kasta "xirmada offline-ka" (GET /sync/offline-pack) ayaa la kaydiyaa: safarada iib u furan,
 *   kuraasta la qabtay, iyo QOONDADA laantayda (Boorama 1 & 2 kuraas kala gooni ah).
 * - Offline: karraanigu kaliya qoondadiisa ayuu iibin karaa → IndexedDB (tab-ka la xiro xataa way sii jiraan).
 * - Online mar kale: POST /sync/bookings (Idempotency-Key) → kursi la qaatay → mid kale (server-ka ayaa go'aamiya).
 */
import { useSyncExternalStore } from 'react';
import { api, ApiError } from './api';
import type { PaymentInput } from './types';

export interface PackTrip {
  id: string;
  departureAt: string;
  status: string;
  loading: boolean;
  route: { id: string; from: string; fromCity: string; to: string; ticketPriceCents: number; frontSeatSurchargeCents: number };
  vehicle: { plate: string; seatLayout: { rows: (string | null)[][]; front?: string[] } };
  driver: string;
  taken: string[];
  myQuota: string[];
}
export interface OfflinePack {
  generatedAt: string;
  branchId?: string;
  trips: PackTrip[];
}
export interface OfflineTicket {
  idempotencyKey: string;
  offlineCreatedAt: string;
  tripId: string;
  seatNo: string;
  passengerName: string;
  passengerPhone: string;
  paperTicketNo?: string;
  payment: PaymentInput;
  priceCents: number;
  trip: { from: string; to: string; plate: string; departureAt: string };
  status: 'pending' | 'error' | 'synced';
  error?: { code: string; message?: string };
  receiptNo?: string;
  bookingId?: string;
  finalSeat?: string;
  seatChangedFrom?: string | null;
}

// ------------------------------------------------------------------ xirmada (localStorage)

const PACK_KEY = 'offline-pack:v1';
export function loadPack(): OfflinePack | null {
  try {
    const v = localStorage.getItem(PACK_KEY);
    return v ? (JSON.parse(v) as OfflinePack) : null;
  } catch {
    return null;
  }
}
export async function refreshPack(): Promise<OfflinePack | null> {
  try {
    const p = await api<OfflinePack>('/sync/offline-pack');
    localStorage.setItem(PACK_KEY, JSON.stringify(p));
    return p;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ safka (IndexedDB)

const DB = 'cabdinasir-offline-tickets';
const STORE = 'tickets';
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

let items: OfflineTicket[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function loadTickets() {
  if (typeof indexedDB === 'undefined') return items;
  items = (await tx<OfflineTicket[]>('readonly', (s) => s.getAll() as IDBRequest<OfflineTicket[]>)).sort((a, b) => a.offlineCreatedAt.localeCompare(b.offlineCreatedAt));
  emit();
  return items;
}
export async function enqueueTicket(t: OfflineTicket) {
  await tx('readwrite', (s) => s.put(t));
  await loadTickets();
}
export async function removeTicket(key: string) {
  await tx('readwrite', (s) => s.delete(key));
  await loadTickets();
}
export function useOfflineTickets(): OfflineTicket[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
    () => items,
  );
}

/** Kuraasta aan offline ku iibin karo: qoondadayda − kuwa la qabtay − kuwa aan hore offline u iibiyay (weli sugaya) */
export function freeSeats(trip: PackTrip, queue: OfflineTicket[]): Set<string> {
  const localSold = new Set(queue.filter((q) => q.tripId === trip.id && q.status !== 'error').map((q) => q.finalSeat ?? q.seatNo));
  return new Set(trip.myQuota.filter((s) => !trip.taken.includes(s) && !localSold.has(s)));
}

let syncing = false;
export async function syncTickets(): Promise<{ synced: number; failed: number; changed: OfflineTicket[] } | null> {
  if (syncing) return null;
  const pending = (await loadTickets()).filter((i) => i.status === 'pending');
  if (!pending.length) return { synced: 0, failed: 0, changed: [] };
  syncing = true;
  try {
    const res = await api<{ results: { idempotencyKey: string; ok: boolean; id?: string; receiptNo?: string; seatNo?: string; seatChangedFrom?: string | null; error?: { code: string; message?: string } }[] }>('/sync/bookings', {
      method: 'POST',
      body: {
        items: pending.map((i) => ({
          idempotencyKey: i.idempotencyKey,
          offlineCreatedAt: i.offlineCreatedAt,
          booking: { tripId: i.tripId, seatNo: i.seatNo, passengerName: i.passengerName, passengerPhone: i.passengerPhone, payment: i.payment, ...(i.paperTicketNo && { paperTicketNo: i.paperTicketNo }) },
        })),
      },
    });
    let synced = 0;
    let failed = 0;
    const changed: OfflineTicket[] = [];
    for (const r of res.results) {
      const it = pending.find((p) => p.idempotencyKey === r.idempotencyKey);
      if (!it) continue;
      if (r.ok) {
        synced++;
        const next: OfflineTicket = { ...it, status: 'synced', receiptNo: r.receiptNo, bookingId: r.id, finalSeat: r.seatNo, seatChangedFrom: r.seatChangedFrom ?? null, error: undefined };
        if (r.seatChangedFrom) changed.push(next);
        await tx('readwrite', (s) => s.put(next));
      } else {
        failed++;
        await tx('readwrite', (s) => s.put({ ...it, status: 'error', error: r.error }));
      }
    }
    await loadTickets();
    return { synced, failed, changed };
  } catch (e) {
    if (e instanceof ApiError && e.code === 'NETWORK_ERROR') return null;
    throw e;
  } finally {
    syncing = false;
  }
}

/** Kuwa la diray ka saar 2 maalmood kadib */
export async function pruneTickets() {
  for (const i of await loadTickets()) {
    if (i.status === 'synced' && Date.now() - new Date(i.offlineCreatedAt).getTime() > 2 * 86400_000) await removeTicket(i.idempotencyKey);
  }
}
