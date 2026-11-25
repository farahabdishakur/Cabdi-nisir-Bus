'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { can, isManager } from '@/lib/permissions';
import { useCashSession } from '@/lib/queries';
import { time, todayISO, usd } from '@/lib/format';
import type { Parcel, Trip } from '@/lib/types';
import { Alert, Card, Loading, Stat } from '@/components/ui';
import { TripStatusBadge } from '@/components/domain';

interface Dashboard {
  revenueUsdCents: number;
  trips: { trips: number; capacity: number; sold: number; occupancyPct: number };
  incomingParcels: Record<string, number>;
  parcelsAwaitingLoad: number;
  openCashSessions: number;
}

export default function DashboardPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const manager = isManager(user);
  const staff = user?.role !== 'DRIVER';
  const session = useCashSession();
  const trips = useQuery({ queryKey: ['trips', 'today'], queryFn: () => api<Trip[]>('/trips', { query: { date: todayISO() } }) });
  const incoming = useQuery({ queryKey: ['parcels', 'incoming'], queryFn: () => api<Parcel[]>('/parcels/incoming'), enabled: staff && !!user?.branchId });
  const dash = useQuery({ queryKey: ['reports', 'dashboard'], queryFn: () => api<Dashboard>('/reports/dashboard'), enabled: manager });
  const integrity = useQuery({ queryKey: ['reports', 'integrity'], queryFn: () => api<{ ok: boolean; issues: number }>('/reports/integrity'), enabled: can(user, 'integrity') });
  const voids = useQuery({ queryKey: ['void-requests', 'PENDING'], queryFn: () => api<unknown[]>('/void-requests', { query: { status: 'PENDING' } }), enabled: manager });

  return (
    <div className="flex flex-col gap-4">
      {staff && user?.branchId && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <BigAction href="/trips" icon="🎫" label={t('dashboard.sellTicket')} />
          <BigAction href="/parcels/new" icon="📦" label={t('dashboard.sendParcel')} />
          <BigAction href="/parcels/deliver" icon="🤝" label={t('dashboard.handOver')} />
        </div>
      )}

      {staff && user?.branchId && !session.isLoading && !session.data && (
        <Alert tone="yellow">
          {t('dashboard.noSession')}{' '}
          <Link className="font-bold underline" href="/cash">
            {t('dashboard.openSession')}
          </Link>
        </Alert>
      )}

      {manager && (
        <>
          {integrity.data && (
            <Link href="/reports?tab=integrity">
              <Alert tone={integrity.data.ok ? 'green' : 'red'}>
                {integrity.data.ok ? t('dashboard.integrityOk') : t('dashboard.integrityIssues', { n: integrity.data.issues })}
              </Alert>
            </Link>
          )}
          {dash.data && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Stat label={t('dashboard.revenueToday')} value={usd(dash.data.revenueUsdCents)} />
              <Stat label={t('dashboard.trips')} value={dash.data.trips.trips} />
              <Stat label={t('dashboard.occupancy')} value={`${dash.data.trips.occupancyPct}%`} />
              <Stat label={t('dashboard.awaitingLoad')} value={dash.data.parcelsAwaitingLoad} />
              <Link href="/void-requests">
                <Stat label={t('dashboard.pendingVoids')} value={voids.data?.length ?? 0} tone={(voids.data?.length ?? 0) > 0 ? 'red' : undefined} />
              </Link>
            </div>
          )}
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('dashboard.todayTrips')} actions={<Link className="text-sm font-semibold text-navy hover:underline" href="/trips">{t('nav.trips')} →</Link>}>
          {trips.isLoading ? (
            <Loading />
          ) : !trips.data?.length ? (
            <p className="text-sm text-gray-500">{t('common.empty')}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {trips.data.map((tr) => (
                <li key={tr.id}>
                  <Link href={`/trips/${tr.id}`} className="flex items-center justify-between gap-2 py-2 hover:bg-gray-50">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {time(tr.departureAt)} · {tr.route.fromBranch.name} → {tr.route.toBranch.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {tr.vehicle.plate} · {tr.driver.name}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <TripStatusBadge s={tr.status} />
                      <span className="text-xs text-gray-600">
                        {tr.seatsAvailable} {t('trips.free')}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {staff && user?.branchId && (
          <Card title={t('dashboard.incoming')} actions={<Link className="text-sm font-semibold text-navy hover:underline" href="/parcels/incoming">{t('nav.incoming')} →</Link>}>
            {incoming.isLoading ? (
              <Loading />
            ) : (
              <div className="grid grid-cols-3 gap-2 text-center">
                {(['LOADED', 'IN_TRANSIT', 'ARRIVED'] as const).map((s) => (
                  <div key={s} className="rounded-lg bg-gray-50 p-3">
                    <p className="text-2xl font-bold text-navy">{incoming.data?.filter((p) => p.status === s).length ?? 0}</p>
                    <p className="text-xs text-gray-600">{t(`parcelStatus.${s}`)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

function BigAction({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link href={href} className="flex min-h-24 items-center gap-4 rounded-2xl bg-brand px-5 text-white shadow-sm transition hover:bg-brand-dark">
      <span className="text-4xl" aria-hidden>
        {icon}
      </span>
      <span className="text-lg font-bold">{label}</span>
    </Link>
  );
}
