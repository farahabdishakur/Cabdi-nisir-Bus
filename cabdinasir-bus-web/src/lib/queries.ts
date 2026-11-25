'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
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
    queryFn: () => api<Bootstrap>('/sync/bootstrap'),
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
