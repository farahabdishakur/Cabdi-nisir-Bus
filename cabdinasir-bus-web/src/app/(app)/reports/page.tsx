'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, download } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { isSuperAdmin } from '@/lib/permissions';
import { useBootstrap } from '@/lib/queries';
import { dateTime, money, slsh, time, todayISO, usd } from '@/lib/format';
import type { Currency, Method } from '@/lib/types';
import { Alert, Badge, Button, Card, Input, Loading, PageHeader, Stat, Table, Td } from '@/components/ui';
import { BranchSelect, ErrorAlert } from '@/components/domain';

type Tab = 'daily' | 'revenue' | 'trips' | 'cashiers' | 'integrity';

export default function ReportsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const boot = useBootstrap();
  const [tab, setTab] = useState<Tab>('daily');
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [branchId, setBranchId] = useState('');

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('tab');
    if (p === 'integrity' || p === 'revenue' || p === 'trips' || p === 'cashiers') setTab(p);
  }, []);

  const tabs: [Tab, string][] = [
    ['daily', t('reports.dailyClose')],
    ['revenue', t('reports.revenue')],
    ['trips', t('reports.tripsProfit')],
    ['cashiers', t('reports.cashiers')],
    ['integrity', t('reports.integrity')],
  ];
  const q = { from, to, branchId: branchId || undefined };

  return (
    <div>
      <PageHeader title={t('reports.title')} />
      <div className="mb-3 flex flex-wrap gap-2">
        {tabs.map(([k, l]) => <Button key={k} size="sm" variant={tab === k ? 'navy' : 'secondary'} onClick={() => setTab(k)}>{l}</Button>)}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tab !== 'integrity' && <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (tab === 'daily' || e.target.value > to) setTo(e.target.value); }} className="max-w-44" />}
        {tab !== 'daily' && tab !== 'integrity' && <><span>→</span><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="max-w-44" /></>}
        {isSuperAdmin(user) && <div className="w-56"><BranchSelect value={branchId} onChange={setBranchId} branches={boot.data?.branches ?? []} allLabel={t('common.allBranches')} /></div>}
      </div>
      {tab === 'daily' && <DailyClose day={from} branchId={branchId} />}
      {tab === 'revenue' && <Revenue q={q} />}
      {tab === 'trips' && <TripsProfit q={q} />}
      {tab === 'cashiers' && <Cashiers q={q} />}
      {tab === 'integrity' && <Integrity branchId={branchId} />}
    </div>
  );
}

type Q = { from: string; to: string; branchId?: string };

function DailyClose({ day, branchId }: { day: string; branchId: string }) {
  const { t } = useI18n();
  const r = useQuery({
    queryKey: ['reports', 'daily', day, branchId],
    queryFn: () => api<{
      counts: { tickets: number; parcelsSent: number; parcelsDelivered: number };
      incomeUsdCents: number; expensesUsdCents: number; depositsUsdCents: number;
      breakdown: { kind: string; method: Method; currency: Currency; count: number; amount: number }[];
      sessions: { id: string; cashier: string; openedAt: string; closedAt: string | null; variance: { USD: number; SLSH: number } | null; approved: boolean }[];
    }>('/reports/daily-close', { query: { date: day, branchId: branchId || undefined } }),
  });
  if (r.error) return <ErrorAlert error={r.error} />;
  if (r.isLoading || !r.data) return <Loading />;
  const d = r.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label={t('reports.income')} value={usd(d.incomeUsdCents)} />
        <Stat label={t('reports.expenses')} value={usd(d.expensesUsdCents)} />
        <Stat label={t('reports.net')} value={usd(d.incomeUsdCents - d.expensesUsdCents)} tone="green" />
        <Stat label={t('reports.deposits')} value={usd(d.depositsUsdCents)} />
        <Stat label={t('reports.tickets')} value={d.counts.tickets} />
        <Stat label={t('reports.parcelsSent')} value={`${d.counts.parcelsSent} / ${d.counts.parcelsDelivered}`} />
      </div>
      <Card title={t('cash.byMethod')}>
        <Table head={['', t('payment.method'), '#', t('common.amount')]} empty={!d.breakdown.length}>
          {d.breakdown.map((b, i) => <tr key={i}><Td>{t(`paymentKind.${b.kind}`)}</Td><Td>{t(`method.${b.method}`)}</Td><Td>{b.count}</Td><Td className="font-semibold">{money(b.amount, b.currency)}</Td></tr>)}
        </Table>
      </Card>
      <Card title={t('cash.sessions')}>
        <Table head={[t('zaad.cashier'), t('common.date'), t('cash.variance'), t('common.status')]} empty={!d.sessions.length}>
          {d.sessions.map((s) => (
            <tr key={s.id}>
              <Td>{s.cashier}</Td>
              <Td>{time(s.openedAt)} → {s.closedAt ? time(s.closedAt) : '…'}</Td>
              <Td className={s.variance && (s.variance.USD || s.variance.SLSH) ? 'font-bold text-red-700' : ''}>{s.variance ? `${usd(s.variance.USD)} · ${slsh(s.variance.SLSH)}` : '—'}</Td>
              <Td>{s.approved ? <Badge tone="green">{t('cash.approved')}</Badge> : s.closedAt ? <Badge tone="yellow">{t('cash.closed')}</Badge> : <Badge tone="blue">{t('dashboard.sessionOpen')}</Badge>}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

function Revenue({ q }: { q: Q }) {
  const { t } = useI18n();
  const r = useQuery({
    queryKey: ['reports', 'revenue', q],
    queryFn: () => api<{ totalUsdCents: number; expensesUsdCents: number; netUsdCents: number; perBranch: { branch: { name: string }; byKind: Record<string, number>; totalUsdCents: number; expensesUsdCents: number; netUsdCents: number }[]; daily: { day: string; usdCents: number }[] }>('/reports/revenue', { query: q }),
  });
  if (r.error) return <ErrorAlert error={r.error} />;
  if (r.isLoading || !r.data) return <Loading />;
  const max = Math.max(1, ...r.data.daily.map((d) => d.usdCents));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t('reports.income')} value={usd(r.data.totalUsdCents)} />
        <Stat label={t('reports.expenses')} value={usd(r.data.expensesUsdCents)} />
        <Stat label={t('reports.net')} value={usd(r.data.netUsdCents)} tone="green" />
      </div>
      <Card title={t('common.branch')} actions={<Button size="sm" variant="secondary" onClick={() => download('/reports/revenue', { ...q, format: 'csv' }, `revenue-${q.from}.csv`)}>{t('common.downloadCsv')}</Button>}>
        <Table head={[t('common.branch'), t('reports.tickets'), t('nav.parcels'), t('reports.income'), t('reports.expenses'), t('reports.net')]}>
          {r.data.perBranch.map((b) => (
            <tr key={b.branch.name}>
              <Td className="font-semibold">{b.branch.name}</Td>
              <Td>{usd(b.byKind.TICKET ?? 0)}</Td>
              <Td>{usd((b.byKind.PARCEL ?? 0) + (b.byKind.STORAGE ?? 0))}</Td>
              <Td>{usd(b.totalUsdCents)}</Td>
              <Td>{usd(b.expensesUsdCents)}</Td>
              <Td className="font-bold text-emerald-700">{usd(b.netUsdCents)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      {r.data.daily.length > 1 && (
        <Card title={t('reports.revenue')}>
          <div className="flex h-40 items-end gap-1" role="img" aria-label={t('reports.revenue')}>
            {r.data.daily.map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${usd(d.usdCents)}`}>
                <div className="w-full rounded-t bg-navy" style={{ height: `${Math.max(2, (d.usdCents / max) * 130)}px` }} />
                <span className="text-[10px] text-gray-500">{d.day.slice(8)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function TripsProfit({ q }: { q: Q }) {
  const { t } = useI18n();
  const r = useQuery({
    queryKey: ['reports', 'trips-profit', q],
    queryFn: () => api<{ trips: { tripId: string; departureAt: string; route: string; vehicle: string; driver: string; passengers: number; capacity: number; parcels: number; ticketsUsdCents: number; parcelsUsdCents: number; expensesUsdCents: number; profitUsdCents: number }[]; totals: { profitUsdCents: number; lossMakingTrips: number; trips: number } }>('/reports/trips-profit', { query: q }),
  });
  if (r.error) return <ErrorAlert error={r.error} />;
  if (r.isLoading || !r.data) return <Loading />;
  return (
    <Card title={`${t('reports.profit')}: ${usd(r.data.totals.profitUsdCents)} · ${r.data.totals.trips} ${t('dashboard.trips')}`} actions={<Button size="sm" variant="secondary" onClick={() => download('/reports/trips-profit', { ...q, format: 'csv' }, `trips-${q.from}.csv`)}>{t('common.downloadCsv')}</Button>}>
      <Table head={[t('common.date'), t('trips.route'), t('trips.vehicle'), t('trips.passengers'), t('trips.parcels'), t('reports.tickets'), t('nav.parcels'), t('reports.expenses'), t('reports.profit')]} empty={!r.data.trips.length}>
        {r.data.trips.map((x) => (
          <tr key={x.tripId} className={x.profitUsdCents < 0 ? 'bg-red-50' : ''}>
            <Td>{dateTime(x.departureAt)}</Td><Td>{x.route}</Td><Td>{x.vehicle}</Td><Td>{x.passengers}/{x.capacity}</Td><Td>{x.parcels}</Td>
            <Td>{usd(x.ticketsUsdCents)}</Td><Td>{usd(x.parcelsUsdCents)}</Td><Td>{usd(x.expensesUsdCents)}</Td>
            <Td className={`font-bold ${x.profitUsdCents < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{usd(x.profitUsdCents)}</Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function Cashiers({ q }: { q: Q }) {
  const { t } = useI18n();
  const r = useQuery({
    queryKey: ['reports', 'cashiers', q],
    queryFn: () => api<{ cashiers: { userId: string; name: string; role: string; tickets: number; parcels: number; deliveries: number; incomeUsdCents: number; varianceUsdCents: number; varianceSlsh: number }[] }>('/reports/cashiers', { query: q }),
  });
  if (r.error) return <ErrorAlert error={r.error} />;
  if (r.isLoading || !r.data) return <Loading />;
  return (
    <Card title={t('reports.cashiers')}>
      <Table head={[t('common.name'), t('reports.tickets'), t('reports.parcelsSent'), t('reports.delivered'), t('reports.income'), t('cash.variance')]} empty={!r.data.cashiers.length}>
        {r.data.cashiers.map((c) => (
          <tr key={c.userId}>
            <Td className="font-semibold">{c.name} <span className="text-xs text-gray-500">{t(`roles.${c.role}`)}</span></Td>
            <Td>{c.tickets}</Td><Td>{c.parcels}</Td><Td>{c.deliveries}</Td><Td>{usd(c.incomeUsdCents)}</Td>
            <Td className={c.varianceUsdCents || c.varianceSlsh ? 'font-bold text-red-700' : ''}>{usd(c.varianceUsdCents)} · {slsh(c.varianceSlsh)}</Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}


function Integrity({ branchId }: { branchId: string }) {
  const { t } = useI18n();
  const r = useQuery({ queryKey: ['reports', 'integrity', branchId], queryFn: () => api<{ ok: boolean; issues: number; failedSms: number; checks: Record<string, unknown[]> }>('/reports/integrity', { query: { branchId: branchId || undefined } }) });
  if (r.error) return <ErrorAlert error={r.error} />;
  if (r.isLoading || !r.data) return <Loading />;
  return (
    <div className="flex flex-col gap-3">
      <Alert tone={r.data.ok ? 'green' : 'red'}>{r.data.ok ? t('reports.issuesNone') : t('dashboard.integrityIssues', { n: r.data.issues })}</Alert>
      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(r.data.checks).map(([k, list]) => (
          <Card key={k} title={<span className="flex items-center gap-2">{t(`reports.checks.${k}`)} <Badge tone={list.length ? 'red' : 'green'}>{list.length}</Badge></span>}>
            {list.length ? (
              <ul className="max-h-48 overflow-y-auto text-xs text-gray-700">
                {list.map((x, i) => <li key={i} className="truncate border-b border-gray-100 py-1 font-mono">{JSON.stringify(x)}</li>)}
              </ul>
            ) : <p className="text-sm text-emerald-700">✓</p>}
          </Card>
        ))}
        {r.data.failedSms > 0 && <Alert>{t('reports.failedSms')}: {r.data.failedSms}</Alert>}
      </div>
    </div>
  );
}
