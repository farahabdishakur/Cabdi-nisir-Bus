'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { isSuperAdmin } from '@/lib/permissions';
import { useBootstrap } from '@/lib/queries';
import { localToIso } from '@/lib/format';
import type { Driver, Trip, Vehicle } from '@/lib/types';
import { Alert, Button, Field, Input, Modal, Select } from './ui';

function useFleet(enabled: boolean) {
  const vehicles = useQuery({ queryKey: ['vehicles'], queryFn: () => api<Vehicle[]>('/vehicles'), enabled });
  const drivers = useQuery({ queryKey: ['drivers'], queryFn: () => api<Driver[]>('/drivers'), enabled });
  return { vehicles: (vehicles.data ?? []).filter((v) => v.isActive), drivers: (drivers.data ?? []).filter((d) => d.isActive) };
}

/** Beddel gaariga / darawalka / waqtiga (safar aan bixin). */
export function EditTripModal({ trip, open, onClose }: { trip: Trip; open: boolean; onClose: () => void }) {
  const { t, err } = useI18n();
  const qc = useQueryClient();
  const fleet = useFleet(open);
  const local = new Date(new Date(trip.departureAt).getTime() + 3 * 3600_000).toISOString();
  const [form, setForm] = useState({ vehicleId: trip.vehicle.id, driverId: trip.driver.id, day: local.slice(0, 10), hhmm: local.slice(11, 16) });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setForm({ vehicleId: trip.vehicle.id, driverId: trip.driver.id, day: local.slice(0, 10), hhmm: local.slice(11, 16) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/trips/${trip.id}`, { method: 'PATCH', body: { vehicleId: form.vehicleId, driverId: form.driverId, departureAt: localToIso(form.day, form.hhmm) } });
      qc.invalidateQueries({ queryKey: ['trip', trip.id] });
      qc.invalidateQueries({ queryKey: ['trips'] });
      onClose();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('trips.edit')}>
      <div className="flex flex-col gap-3">
        <Field label={t('trips.vehicle')}>{(id) => (
          <Select id={id} value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}>
            {fleet.vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} · {v.model} ({v.capacity})</option>)}
          </Select>
        )}</Field>
        <Field label={t('trips.driver')}>{(id) => (
          <Select id={id} value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
            {fleet.drivers.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.phone}</option>)}
          </Select>
        )}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('common.date')}>{(id) => <Input id={id} type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} />}</Field>
          <Field label={t('trips.time')}>{(id) => <Input id={id} type="time" value={form.hhmm} onChange={(e) => setForm({ ...form, hhmm: e.target.value })} />}</Field>
        </div>
        {error && <Alert>{error}</Alert>}
        <Button onClick={save} loading={busy}>{t('common.save')}</Button>
      </div>
    </Modal>
  );
}

interface Row { hhmm: string; vehicleId: string; driverId: string }

/** Jadwalka maalinta: safaro badan hal mar (tusaale 6 subax kasta). Safar kasta si gooni ah ayaa loo hubiyaa. */
export function ScheduleModal({ open, onClose, day }: { open: boolean; onClose: () => void; day: string }) {
  const { t, err, codeText } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const boot = useBootstrap();
  const fleet = useFleet(open);
  const routes = (boot.data?.routes ?? []).filter((r) => r.isActive && (isSuperAdmin(user) || r.fromBranchId === user?.branchId));
  const branchName = (id: string) => boot.data?.branches.find((b) => b.id === id)?.name ?? id;
  const [routeId, setRouteId] = useState('');
  const [date, setDate] = useState(day);
  const [rows, setRows] = useState<Row[]>([{ hhmm: '06:00', vehicleId: '', driverId: '' }]);
  const [result, setResult] = useState<{ created: number; results: { ok: boolean; error?: { code: string } }[] } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setResult(null);
      setError('');
      setDate(day);
    }
  }, [open, day]);

  const setRow = (i: number, r: Partial<Row>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...r } : x)));
  const ready = routeId && rows.length && rows.every((r) => r.hhmm && r.vehicleId && r.driverId);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api<{ created: number; results: { ok: boolean; error?: { code: string } }[] }>('/trips/bulk', {
        method: 'POST',
        body: { trips: rows.map((x) => ({ routeId, vehicleId: x.vehicleId, driverId: x.driverId, departureAt: localToIso(date, x.hhmm) })) },
      });
      setResult(r);
      qc.invalidateQueries({ queryKey: ['trips'] });
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('trips.schedule')} wide>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('trips.route')} required>{(id) => (
            <Select id={id} value={routeId} onChange={(e) => setRouteId(e.target.value)}>
              <option value="">—</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{branchName(r.fromBranchId)} → {branchName(r.toBranchId)}</option>)}
            </Select>
          )}</Field>
          <Field label={t('common.date')} required>{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[90px_1fr_1fr_auto] items-end gap-2">
            <Field label={t('trips.time')}>{(id) => <Input id={id} type="time" value={r.hhmm} onChange={(e) => setRow(i, { hhmm: e.target.value })} />}</Field>
            <Field label={t('trips.vehicle')}>{(id) => (
              <Select id={id} value={r.vehicleId} onChange={(e) => setRow(i, { vehicleId: e.target.value })}>
                <option value="">—</option>
                {fleet.vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}
              </Select>
            )}</Field>
            <Field label={t('trips.driver')}>{(id) => (
              <Select id={id} value={r.driverId} onChange={(e) => setRow(i, { driverId: e.target.value })}>
                <option value="">—</option>
                {fleet.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            )}</Field>
            <Button variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1} aria-label="remove">✕</Button>
            {result?.results[i] && (
              <p className={`col-span-4 text-xs font-semibold ${result.results[i].ok ? 'text-emerald-700' : 'text-red-700'}`}>
                {result.results[i].ok ? `✓ ${r.hhmm}` : `✕ ${r.hhmm}: ${codeText(result.results[i].error?.code ?? 'UNKNOWN', (result.results[i].error as { message?: string } | undefined)?.message)}`}
              </p>
            )}
          </div>
        ))}
        <Button variant="secondary" onClick={() => setRows([...rows, { hhmm: rows.length ? nextTime(rows[rows.length - 1].hhmm) : '06:00', vehicleId: '', driverId: '' }])}>+ {t('trips.addRow')}</Button>
        {result && <Alert tone={result.created === rows.length ? 'green' : 'yellow'}>{t('trips.created', { n: result.created, total: rows.length })}</Alert>}
        {error && <Alert>{error}</Alert>}
        <Button onClick={save} loading={busy} disabled={!ready}>{t('common.create')} ({rows.length})</Button>
      </div>
    </Modal>
  );
}

function nextTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h * 60 + m + 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

