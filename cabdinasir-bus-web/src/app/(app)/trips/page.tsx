'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { can, isSuperAdmin } from '@/lib/permissions';
import { useBootstrap } from '@/lib/queries';
import { localToIso, time, todayISO } from '@/lib/format';
import type { Driver, Trip, Vehicle } from '@/lib/types';
import { Alert, Button, Card, Field, Input, Loading, Modal, PageHeader, Select } from '@/components/ui';
import { ErrorAlert, TripStatusBadge } from '@/components/domain';
import { ScheduleModal } from '@/components/trip-forms';

export default function TripsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [day, setDay] = useState(todayISO());
  const [creating, setCreating] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const trips = useQuery({ queryKey: ['trips', day], queryFn: () => api<Trip[]>('/trips', { query: { date: day } }), refetchInterval: 30_000 });

  const shift = (d: number) => {
    const x = new Date(`${day}T12:00:00Z`);
    x.setUTCDate(x.getUTCDate() + d);
    setDay(x.toISOString().slice(0, 10));
  };

  return (
    <div>
      <PageHeader
        title={t('trips.title')}
        actions={can(user, 'manageTrips') && (
          <>
            <Button variant="secondary" onClick={() => setScheduling(true)}>🗓 {t('trips.schedule')}</Button>
            <Button onClick={() => setCreating(true)}>+ {t('trips.new')}</Button>
          </>
        )}
      />
      <div className="mb-4 flex items-center gap-2">
        <Button variant="secondary" onClick={() => shift(-1)} aria-label="prev">
          ←
        </Button>
        <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="max-w-44" />
        <Button variant="secondary" onClick={() => shift(1)} aria-label="next">
          →
        </Button>
        {day !== todayISO() && (
          <Button variant="ghost" onClick={() => setDay(todayISO())}>
            {t('common.date')}: {todayISO()}
          </Button>
        )}
      </div>

      {trips.error ? (
        <ErrorAlert error={trips.error} />
      ) : trips.isLoading ? (
        <Loading />
      ) : !trips.data?.length ? (
        <Card>
          <p className="text-sm text-gray-500">{t('common.empty')}</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {trips.data.map((tr) => (
            <Link key={tr.id} href={`/trips/${tr.id}`} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-navy">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-2xl font-black text-navy">{time(tr.departureAt)}</p>
                  <p className="font-semibold text-gray-900">
                    {tr.route.fromBranch.name} → {tr.route.toBranch.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {tr.vehicle.plate} · {tr.driver.name}
                  </p>
                </div>
                <TripStatusBadge s={tr.status} />
              </div>
              <div className="mt-3 flex gap-3 text-sm">
                <span className="font-semibold text-emerald-700">
                  {tr.seatsAvailable} {t('trips.free')}
                </span>
                <span className="text-red-700">
                  {tr.seatsSold} {t('trips.sold')}
                </span>
                {!!tr.seatsReserved && (
                  <span className="text-violet-700">
                    {tr.seatsReserved} {t('trips.reserved')}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
      <ScheduleModal open={scheduling} onClose={() => setScheduling(false)} day={day} />
      <NewTripModal open={creating} onClose={() => setCreating(false)} day={day} superAdmin={isSuperAdmin(user)} branchId={user?.branchId ?? null} />
    </div>
  );
}

function NewTripModal({ open, onClose, day, superAdmin, branchId }: { open: boolean; onClose: () => void; day: string; superAdmin: boolean; branchId: string | null }) {
  const { t, err } = useI18n();
  const qc = useQueryClient();
  const boot = useBootstrap();
  const vehicles = useQuery({ queryKey: ['vehicles'], queryFn: () => api<Vehicle[]>('/vehicles'), enabled: open });
  const drivers = useQuery({ queryKey: ['drivers'], queryFn: () => api<Driver[]>('/drivers'), enabled: open });
  const routes = (boot.data?.routes ?? []).filter((r) => superAdmin || r.fromBranchId === branchId);
  const branchName = (id: string) => boot.data?.branches.find((b) => b.id === id)?.name ?? id;
  const [form, setForm] = useState({ routeId: '', vehicleId: '', driverId: '', day, hhmm: '07:00' });
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () => api('/trips', { method: 'POST', body: { routeId: form.routeId, vehicleId: form.vehicleId, driverId: form.driverId, departureAt: localToIso(form.day, form.hhmm) } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips'] });
      onClose();
    },
    onError: (e) => setError(err(e)),
  });

  return (
    <Modal open={open} onClose={onClose} title={t('trips.new')}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          create.mutate();
        }}
      >
        <Field label={t('trips.route')} required>
          {(id) => (
            <Select id={id} value={form.routeId} onChange={(e) => setForm({ ...form, routeId: e.target.value })} required>
              <option value="">—</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {branchName(r.fromBranchId)} → {branchName(r.toBranchId)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('trips.vehicle')} required>
          {(id) => (
            <Select id={id} value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} required>
              <option value="">—</option>
              {vehicles.data?.filter((v) => v.isActive).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} · {v.model} ({v.capacity})
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('trips.driver')} required>
          {(id) => (
            <Select id={id} value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })} required>
              <option value="">—</option>
              {drivers.data?.filter((d) => d.isActive).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.phone}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('common.date')} required>
            {(id) => <Input id={id} type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} required />}
          </Field>
          <Field label={t('trips.time')} required>
            {(id) => <Input id={id} type="time" value={form.hhmm} onChange={(e) => setForm({ ...form, hhmm: e.target.value })} required />}
          </Field>
        </div>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={create.isPending}>
          {t('common.create')}
        </Button>
      </form>
    </Modal>
  );
}
