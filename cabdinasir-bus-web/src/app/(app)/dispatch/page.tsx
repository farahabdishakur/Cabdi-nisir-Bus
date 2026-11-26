'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { isManager, isSuperAdmin } from '@/lib/permissions';
import { BusNo, DriverLine } from '@/components/bus';
import { useBootstrap } from '@/lib/queries';
import { cx, phone, time } from '@/lib/format';
import { busLabel, type DispatchBoard, type DispatchCandidate, type DispatchEntry, type Driver } from '@/lib/types';
import { Alert, Badge, Button, Card, Loading, PageHeader, Select, Stat } from '@/components/ui';
import { ErrorAlert, ReasonModal } from '@/components/domain';

/**
 * Safka gaadiidka maalinta: gaariga hore ayaa la buuxiyaa → wuu baxaa → kan xiga.
 * Maamuluhu subaxdii wuxuu doortaa gaadiidka shaqeynaya (kuwa maqan waa laga reebaa) iyo kala horreynta.
 */
export default function DispatchPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const boot = useBootstrap();
  const routes = useMemo(() => (boot.data?.routes ?? []).filter((r) => r.isActive), [boot.data]);
  const city = boot.data?.branches.find((b) => b.id === user?.branchId)?.city;
  const mine = routes.filter((r) => boot.data?.branches.find((b) => b.id === r.fromBranchId)?.city === city);
  const [routeId, setRouteId] = useState('');
  useEffect(() => {
    if (!routeId && routes.length) setRouteId((mine[0] ?? routes[0]).id);
  }, [routeId, routes, mine]);
  const branchName = (id: string) => boot.data?.branches.find((b) => b.id === id)?.name ?? '';

  return (
    <div>
      <PageHeader title={t('dispatch.title')} />
      <div className="mb-4 flex flex-wrap gap-2">
        {routes.map((r) => (
          <Button key={r.id} size="sm" variant={routeId === r.id ? 'navy' : 'secondary'} onClick={() => setRouteId(r.id)}>
            {branchName(r.fromBranchId)} → {branchName(r.toBranchId)}
          </Button>
        ))}
      </div>
      {routeId ? <Board routeId={routeId} canManage={isSuperAdmin(user) || (isManager(user) && mine.some((r) => r.id === routeId))} canArrive={user?.role === 'CASHIER' && mine.some((r) => r.id === routeId)} /> : <Loading />}
    </div>
  );
}

function Board({ routeId, canManage, canArrive }: { routeId: string; canManage: boolean; canArrive: boolean }) {
  const { t, err } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['dispatch', routeId], queryFn: () => api<DispatchBoard>(`/dispatch/${routeId}`), refetchInterval: 30_000 });
  const [removing, setRemoving] = useState<DispatchEntry | null>(null);
  const [departing, setDeparting] = useState<DispatchEntry | null>(null);
  const [error, setError] = useState('');
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['dispatch'] });
    qc.invalidateQueries({ queryKey: ['trips'] });
  };
  const move = async (e: DispatchEntry, direction: 'up' | 'down') => {
    setError('');
    try {
      await api(`/dispatch/entries/${e.id}/move`, { method: 'POST', body: { direction } });
      refresh();
    } catch (x) {
      setError(err(x));
    }
  };

  if (q.error) return <ErrorAlert error={q.error} />;
  if (!q.data) return <Loading />;
  const b = q.data;
  const loading = b.entries.filter((e) => e.status === 'LOADING');
  const waiting = b.entries.filter((e) => e.status === 'WAITING');
  const departed = b.entries.filter((e) => e.status === 'DEPARTED' && e.serviceDate === b.date);
  const removed = b.entries.filter((e) => e.status === 'REMOVED' && e.serviceDate === b.date);
  const empty = !loading.length && !waiting.length;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t('dispatch.loading')} value={b.stats.loading} />
          <Stat label={t('dispatch.waiting')} value={b.stats.waiting} />
          <Stat label={t('dispatch.departedToday')} value={b.stats.departed} tone="green" />
          <Stat label={t('dispatch.passengersToday')} value={b.stats.passengers} />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Link href={`/print/schedule/${routeId}?date=${b.date}`} target="_blank"><Button size="sm" variant="secondary">🖨️ {t('schedule.print')}</Button></Link>
        </div>
        {error && <Alert>{error}</Alert>}
        {empty && <Alert tone="yellow">{canManage ? t('dispatch.emptyManager') : t('dispatch.emptyStaff')}</Alert>}

        {loading.map((e, i) => (
          <Card key={e.id} className={cx(i === 0 && 'ring-2 ring-emerald-500')}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-emerald-700">{e.trip?.full ? t('dispatch.fullWaiting') : t('dispatch.nowLoading')}</p>
                <div className="flex items-center gap-2"><BusNo no={e.vehicle.fleetNo} size="lg" /><p className="font-mono text-2xl font-black text-navy">{e.vehicle.plate}</p></div>
                <DriverLine name={e.driver.name} phone={e.driver.phone} extra={`${e.vehicle.model}${e.note === 'AUTO_RETURN' ? ` · ${t('dispatch.autoReturn')}` : ''}`} />
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-navy">{e.trip?.taken ?? 0}<span className="text-lg text-gray-400">/{e.vehicle.capacity}</span></p>
                <p className="text-xs text-gray-500">{t('dispatch.seatsTaken')}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1" aria-hidden>
              {Array.from({ length: e.vehicle.capacity }, (_, s) => (
                <span key={s} className={cx('h-4 w-4 rounded', s < (e.trip?.taken ?? 0) ? 'bg-emerald-600' : 'bg-gray-200')} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {e.tripId && <Link href={`/trips/${e.tripId}`}><Button variant="success">🎫 {t('dispatch.sell')}</Button></Link>}
              {canManage && e.tripId && <Button variant="navy" onClick={() => setDeparting(e)}>🚌 {t('dispatch.depart')}</Button>}
              {canManage && !e.trip?.taken && <Button variant="ghost" onClick={() => setRemoving(e)}>{t('dispatch.remove')}</Button>}
            </div>
          </Card>
        ))}

        <Card title={`${t('dispatch.queue')} (${waiting.length})`}>
          {!waiting.length ? <p className="text-sm text-gray-500">{t('dispatch.queueEmpty')}</p> : (
            <ol className="flex flex-col divide-y divide-gray-100">
              {waiting.map((e, i) => (
                <li key={e.id} className="flex items-center gap-3 py-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">{i + 1}</span>
                  <BusNo no={e.vehicle.fleetNo} />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono font-bold">{e.vehicle.plate}</p>
                    <DriverLine small name={e.driver.name} phone={e.driver.phone} extra={`${e.vehicle.capacity} ${t('seatEditor.seats')}${e.note === 'AUTO_RETURN' ? ` · ${t('dispatch.autoReturn')}` : ''}`} />
                  </div>
                  {canManage && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(e, 'up')} aria-label={t('dispatch.up')}>↑</Button>
                      <Button size="sm" variant="ghost" disabled={i === waiting.length - 1} onClick={() => move(e, 'down')} aria-label={t('dispatch.down')}>↓</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(e)} aria-label={t('dispatch.remove')}>✕</Button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>

        {(departed.length > 0 || removed.length > 0) && (
          <Card title={`${t('dispatch.departedToday')} (${departed.length})`}>
            <ul className="flex flex-col gap-1 text-sm">
              {departed.map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span><span className="font-mono font-semibold">{busLabel(e.vehicle)}</span> · {e.driver.name} · {phone(e.driver.phone)}</span>
                  <span className="text-gray-600">{time(e.departedAt)} · {e.trip?.taken ?? 0} {t('dispatch.passengers')}</span>
                </li>
              ))}
              {removed.map((e) => (
                <li key={e.id} className="flex justify-between gap-2 text-gray-400">
                  <span className="line-through"><span className="font-mono">{busLabel(e.vehicle)}</span> · {e.driver.name}</span>
                  <span>{e.removedReason === 'END_OF_DAY' ? t('dispatch.endOfDay') : e.removedReason}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {canManage && <Roster routeId={routeId} candidates={b.candidates} starting={empty && !departed.length} onDone={refresh} />}
      {canArrive && !canManage && <Arrival routeId={routeId} candidates={b.candidates} onDone={refresh} />}

      <ReasonModal open={!!removing} title={`${t('dispatch.remove')}: ${removing ? busLabel(removing.vehicle) : ''}`} onClose={() => setRemoving(null)}
        onSubmit={async (reason) => { await api(`/dispatch/entries/${removing!.id}/remove`, { method: 'POST', body: { reason } }); refresh(); }} />
      <ReasonModal open={!!departing} title={`${t('dispatch.depart')}: ${departing ? busLabel(departing.vehicle) : ''}`} reasonOptional onClose={() => setDeparting(null)}
        onSubmit={async () => { await api(`/trips/${departing!.tripId}/status`, { method: 'PATCH', body: { status: 'DEPARTED' } }); refresh(); }}>
        <Alert tone="blue">{t('dispatch.departConfirm', { n: departing?.trip?.taken ?? 0, cap: departing?.vehicle.capacity ?? 0 })}</Alert>
      </ReasonModal>
    </div>
  );
}

/** Bilow maalinta / ku dar: gaadiidka joogo (calaamadee), darawalka, kala horreynta (talo cadaalad ah) */
function Roster({ routeId, candidates, starting, onDone }: { routeId: string; candidates: DispatchCandidate[]; starting: boolean; onDone: () => void }) {
  const { t, err } = useI18n();
  const drivers = useQuery({ queryKey: ['drivers'], queryFn: () => api<Driver[]>('/drivers') });
  const [rows, setRows] = useState<{ c: DispatchCandidate; on: boolean; driverId: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setRows(candidates.map((c) => ({ c, on: starting && !!c.defaultDriver, driverId: c.defaultDriver?.id ?? '' })));
  }, [candidates, starting]);
  const swap = (i: number, j: number) => setRows((r) => { const n = [...r]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const chosen = rows.filter((r) => r.on);
  const usedDrivers = chosen.map((r) => r.driverId);
  const dupDriver = usedDrivers.some((d, i) => d && usedDrivers.indexOf(d) !== i);
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/dispatch/${routeId}/enqueue`, { method: 'POST', body: { items: chosen.map((r) => ({ vehicleId: r.c.vehicleId, driverId: r.driverId })) } });
      onDone();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={starting ? `☀️ ${t('dispatch.startDay')}` : `+ ${t('dispatch.add')}`}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-gray-600">{starting ? t('dispatch.startHint') : t('dispatch.addHint')}</p>
        {!rows.length ? <p className="text-sm text-gray-500">{t('dispatch.noCandidates')}</p> : (
          <ul className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <li key={r.c.vehicleId} className={cx('rounded-lg border p-2', r.on ? 'border-navy bg-indigo-50/40' : 'border-gray-200')}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" className="h-5 w-5" checked={r.on} aria-label={r.c.plate} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, on: e.target.checked } : x)))} />
                  <BusNo no={r.c.fleetNo} /><span className="font-mono font-bold">{r.c.plate}</span>
                  <Badge>{r.c.capacity}</Badge>
                  <span className="ml-auto flex gap-0.5">
                    <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => swap(i, i - 1)} aria-label={t('dispatch.up')}>↑</Button>
                    <Button type="button" size="sm" variant="ghost" disabled={i === rows.length - 1} onClick={() => swap(i, i + 1)} aria-label={t('dispatch.down')}>↓</Button>
                  </span>
                </div>
                {r.on && (
                  <Select className="mt-1.5" value={r.driverId} aria-label={`${r.c.plate} — ${t('trips.driver')}`} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, driverId: e.target.value } : x)))}>
                    <option value="">— {t('trips.driver')} —</option>
                    {drivers.data?.filter((d) => d.isActive).map((d) => <option key={d.id} value={d.id}>{d.name} · {phone(d.phone)}</option>)}
                  </Select>
                )}
                {r.c.lastDepartedAt && <p className="mt-1 text-[11px] text-gray-500">{t('dispatch.lastDeparted')}: {new Date(r.c.lastDepartedAt).toLocaleString('en-GB', { timeZone: 'Africa/Mogadishu', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>}
              </li>
            ))}
          </ul>
        )}
        {dupDriver && <Alert tone="yellow">{t('dispatch.dupDriver')}</Alert>}
        {error && <Alert>{error}</Alert>}
        <Button onClick={save} loading={busy} disabled={!chosen.length || chosen.some((r) => !r.driverId) || dupDriver}>
          {starting ? t('dispatch.startButton', { n: chosen.length }) : t('dispatch.addButton', { n: chosen.length })}
        </Button>
      </div>
    </Card>
  );
}

/** "Bas soo galay" (karraani): baska soo gaadhay → safka dabadiisa (hal bas) */
function Arrival({ routeId, candidates, onDone }: { routeId: string; candidates: DispatchCandidate[]; onDone: () => void }) {
  const { t, err } = useI18n();
  const drivers = useQuery({ queryKey: ['drivers'], queryFn: () => api<Driver[]>('/drivers') });
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sorted = [...candidates].sort((a, b) => (a.fleetNo ?? '~').localeCompare(b.fleetNo ?? '~', undefined, { numeric: true }));
  const pick = (id: string) => {
    setVehicleId(id);
    setDriverId(candidates.find((c) => c.vehicleId === id)?.defaultDriver?.id ?? '');
  };
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/dispatch/${routeId}/enqueue`, { method: 'POST', body: { items: [{ vehicleId, driverId }] } });
      const c = candidates.find((x) => x.vehicleId === vehicleId);
      setMsg({ ok: true, text: t('arrival.done', { bus: c ? busLabel(c) : '' }) });
      setVehicleId('');
      setDriverId('');
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: err(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={`🚏 ${t('arrival.title')}`}>
      <p className="mb-3 text-sm text-gray-600">{t('arrival.hint')}</p>
      <div className="flex flex-col gap-2">
        <Select value={vehicleId} aria-label={t('arrival.bus')} onChange={(e) => pick(e.target.value)}>
          <option value="">— {t('arrival.bus')} —</option>
          {sorted.map((c) => <option key={c.vehicleId} value={c.vehicleId}>{busLabel(c)}{c.defaultDriver ? ` · ${c.defaultDriver.name}` : ''}</option>)}
        </Select>
        <Select value={driverId} aria-label={t('trips.driver')} onChange={(e) => setDriverId(e.target.value)}>
          <option value="">— {t('trips.driver')} —</option>
          {drivers.data?.filter((d) => d.isActive).map((d) => <option key={d.id} value={d.id}>{d.name} · {phone(d.phone)}</option>)}
        </Select>
        {msg && <Alert tone={msg.ok ? 'green' : 'red'}>{msg.text}</Alert>}
        <Button onClick={save} loading={busy} disabled={!vehicleId || !driverId}>🚏 {t('arrival.add')}</Button>
      </div>
    </Card>
  );
}
