'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { can, isManager, isSuperAdmin } from '@/lib/permissions';
import { useBootstrap, useCashSession } from '@/lib/queries';
import { time, todayISO, usd } from '@/lib/format';
import type { DispatchOverview, Parcel, Trip } from '@/lib/types';
import { Alert, Card, Loading, Stat } from '@/components/ui';
import { TripStatusBadge } from '@/components/domain';

interface Dashboard {
  revenueUsdCents: number;
  perBranch: { branch: { id: string; name: string }; totalUsdCents: number; expensesUsdCents: number; netUsdCents: number }[];
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
  const queue = useQuery({ queryKey: ['dispatch', 'overview'], queryFn: () => api<DispatchOverview>('/dispatch'), enabled: staff, refetchInterval: 30_000 });
  const boot = useBootstrap();
  const myCity = boot.data?.branches.find((b) => b.id === user?.branchId)?.city;
  const myQueues = (queue.data?.routes ?? []).filter((r) => isSuperAdmin(user) || r.route.from.city === myCity);
  // "Iibi tigidh": gaariga hadda buuxsamaya ee magaaladayda (haddii jiro) → toos seat map-kiisa
  const loadingNow = myQueues.flatMap((r) => r.loading).find((l) => l.tripId && l.taken < l.capacity);
  const voids = useQuery({ queryKey: ['void-requests', 'PENDING'], queryFn: () => api<unknown[]>('/void-requests', { query: { status: 'PENDING' } }), enabled: manager });

  return (
    <div className="flex flex-col gap-4">
      {staff && user?.branchId && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <BigAction href={loadingNow ? `/trips/${loadingNow.tripId}` : '/trips'} icon="🎫" label={loadingNow ? `${t('dashboard.sellTicket')} · ${loadingNow.plate} (${loadingNow.taken}/${loadingNow.capacity})` : t('dashboard.sellTicket')} />
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

      {isSuperAdmin(user) && dash.data && dash.data.perBranch.length > 0 && (
        <Card title={t('dashboard.perBranch')} actions={<Link className="text-sm font-semibold text-navy hover:underline" href="/books">{t('nav.books')} →</Link>}>
          <div className="grid gap-3 sm:grid-cols-3">
            {dash.data.perBranch.map((b) => (
              <div key={b.branch.id} className="rounded-lg border border-gray-200 p-3">
                <p className="text-sm font-semibold text-gray-700">{b.branch.name}</p>
                <p className="text-xl font-bold text-navy">{usd(b.totalUsdCents)}</p>
                <p className="text-xs text-gray-500">{t('reports.expenses')}: {usd(b.expensesUsdCents)} · {t('books.net')}: <b className={b.netUsdCents < 0 ? 'text-red-700' : 'text-emerald-700'}>{usd(b.netUsdCents)}</b></p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {staff && myQueues.length > 0 && (
        <Card title={`🚏 ${t('dispatch.overview')}`} actions={<Link className="text-sm font-semibold text-navy hover:underline" href="/dispatch">{t('nav.dispatch')} →</Link>}>
          <div className="grid gap-3 sm:grid-cols-2">
            {myQueues.map((r) => (
              <div key={r.route.id} className="rounded-lg border border-gray-200 p-3">
                <p className="text-sm font-semibold">{r.route.from.name} → {r.route.to.name}</p>
                {r.loading.length ? r.loading.map((l) => (
                  <Link key={l.plate} href={l.tripId ? `/trips/${l.tripId}` : '/dispatch'} className="mt-1 flex items-center justify-between rounded-md bg-emerald-50 px-2 py-1.5 hover:bg-emerald-100">
                    <span><span className="font-mono font-bold">{l.plate}</span> <span className="text-xs text-gray-600">· {l.driver}</span></span>
                    <span className="font-bold text-emerald-800">{l.taken}/{l.capacity}</span>
                  </Link>
                )) : <p className="mt-1 text-xs text-gray-500">{t('dispatch.queueEmpty')}</p>}
                <p className="mt-1.5 text-xs text-gray-500">
                  {r.next.length > 0 && <>{t('dispatch.next')}: <span className="font-mono">{r.next.join(' → ')}</span> · </>}
                  {t('dispatch.departedToday')}: {r.stats.departed} · {r.stats.passengers} {t('dispatch.passengers')}
                </p>
              </div>
            ))}
          </div>
        </Card>
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
