'use client';

import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from './api';
import { loadBootstrap, saveBootstrap } from './offline';
import { useAuth } from './auth';
import type { Branch, CashSession, Category, Company, Route, Trip } from './types';

export interface Bootstrap {
  serverTime: string;
  businessDate: string;
  branches: Branch[];
  routes: Route[];
  categories: Category[];
  settings: {
    fragileSurchargeCents: number;
    insuranceBps: number;
    maxDiscountBps: number;
    seatHoldSeconds: number;
    reservationCutoffMinutes: number;
    maxReservationsPerPhone: number;
    shareTripsWithinCity: number;
    requireDeliveryPhoto: number;
  };
  company: Company;
  exchangeRate: { usdToSlsh: number; date: string } | null;
  todayTrips: Trip[];
}

/** Xogta tixraaca (laamaha, routes, noocyada, qiimaha, shirkadda) — hal call, 5 daqiiqo cache. */
export function useBootstrap() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['bootstrap', user?.id],
    // offline: xogtii ugu dambaysay ee la kaydiyay (qiimaha, laamaha, noocyada) — alaab offline ayaa lagu diiwaangeliyaa
    queryFn: async () => {
      try {
        const d = await api<Bootstrap>('/sync/bootstrap');
        saveBootstrap(d);
        return d;
      } catch (e) {
        const cached = e instanceof ApiError && e.code === 'NETWORK_ERROR' ? loadBootstrap<Bootstrap>() : undefined;
        if (cached) return cached;
        throw e;
      }
    },
    placeholderData: () => loadBootstrap<Bootstrap>(),
    enabled: !!user && user.role !== 'DRIVER',
    staleTime: 5 * 60_000,
  });
}

export function useMyBranch(): Branch | undefined {
  const { user } = useAuth();
  const { data } = useBootstrap();
  return data?.branches.find((b) => b.id === user?.branchId);
}

export function useBranchName() {
  const { data } = useBootstrap();
  return (id: string | null | undefined) => data?.branches.find((b) => b.id === id)?.name ?? '—';
}

export function useCashSession() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['cash', 'current'],
    queryFn: () => api<CashSession | null>('/cash-sessions/current'),
    enabled: !!user && !!user.branchId && user.role !== 'DRIVER',
  });
}

/** Safarada furan (maanta + 2 maalmood) — beddelka tigidhka / u rarida rakaabka. */
export function useUpcomingTrips(enabled: boolean) {
  return useQuery({
    queryKey: ['trips', 'upcoming'],
    enabled,
    queryFn: async () => {
      const days = [0, 1, 2].map((d) => new Date(Date.now() + 3 * 3600_000 + d * 86400_000).toISOString().slice(0, 10));
      const lists = await Promise.all(days.map((date) => api<Trip[]>('/trips', { query: { date } })));
      return lists.flat().filter((x) => x.status === 'SCHEDULED' || x.status === 'BOARDING').sort((a, b) => a.departureAt.localeCompare(b.departureAt));
    },
  });
}

/** Magaalada laanta user-ka (Boorama 1 & 2 = isku magaalo). */
export function useMyCity(): string | undefined {
  const { user } = useAuth();
  const { data } = useBootstrap();
  return data?.branches.find((b) => b.id === user?.branchId)?.city;
}
