'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { dateTime, phone, time, todayISO } from '@/lib/format';
import type { Parcel, Trip } from '@/lib/types';
import { Alert, Button, Card, Field, Loading, PageHeader, Select } from '@/components/ui';
import { ParcelStatusBadge } from '@/components/domain';

/** Alaabta baxaysa: dooro safarka → calaamadee alaabta → "Rar" (gaariga ku xir). */
export default function OutgoingPage() {
  const { t, err } = useI18n();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['parcels', 'outgoing'], queryFn: () => api<Parcel[]>('/parcels/outgoing') });
  const trips = useQuery({ queryKey: ['trips', todayISO(), 'open'], queryFn: () => api<Trip[]>('/trips', { query: { date: todayISO() } }) });
  const [tripId, setTripId] = useState('');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const openTrips = (trips.data ?? []).filter((x) => x.status === 'SCHEDULED' || x.status === 'BOARDING');
  const trip = openTrips.find((x) => x.id === tripId);

  const waiting = (list.data ?? []).filter((p) => p.status === 'REGISTERED');
  const loaded = (list.data ?? []).filter((p) => p.status === 'LOADED');
  const matches = (p: Parcel) => !trip || p.toBranch.city === trip.route.toBranch.city;

  const load = async () => {
    setBusy(true);
    setError('');
    const ids = waiting.filter((p) => checked[p.id]).map((p) => p.id);
    try {
      for (const id of ids) await api(`/parcels/${id}/load`, { method: 'POST', body: { tripId } });
      setChecked({});
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ['parcels'] });
    }
  };

  const unload = async (id: string) => {
    try {
      await api(`/parcels/${id}/unload`, { method: 'POST' });
      qc.invalidateQueries({ queryKey: ['parcels'] });
    } catch (e) {
      setError(err(e));
    }
  };

  return (
    <div>
      <PageHeader title={t('nav.outgoing')} />
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <Field label={t('parcel.loadTo')}>
              {(id) => (
                <Select id={id} value={tripId} onChange={(e) => setTripId(e.target.value)}>
                  <option value="">—</option>
                  {openTrips.map((x) => <option key={x.id} value={x.id}>{time(x.departureAt)} · {x.route.fromBranch.name} → {x.route.toBranch.name} · {x.vehicle.plate}</option>)}
                </Select>
              )}
            </Field>
          </div>
          <Button variant="navy" onClick={load} loading={busy} disabled={!tripId || !waiting.some((p) => checked[p.id])}>
            📤 {t('parcel.load')} ({waiting.filter((p) => checked[p.id]).length})
          </Button>
        </div>
        {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      </Card>

      {list.isLoading ? <Loading /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={`${t('parcelStatus.REGISTERED')} (${waiting.length})`}>
            <ul className="divide-y divide-gray-100">
              {waiting.map((p) => (
                <li key={p.id} className={`flex items-center gap-3 py-2 ${matches(p) ? '' : 'opacity-40'}`}>
                  <input type="checkbox" className="h-6 w-6 accent-navy" disabled={!matches(p)} checked={!!checked[p.id]} onChange={(e) => setChecked({ ...checked, [p.id]: e.target.checked })} aria-label={p.trackingCode} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/parcels/${p.trackingCode}`} className="font-mono font-semibold text-navy hover:underline">{p.trackingCode}</Link>
                    <p className="text-sm text-gray-700">→ {p.toBranch.name} · {p.receiverName} · {phone(p.receiverPhone)} · {p.pieces}×</p>
                  </div>
                </li>
              ))}
              {!waiting.length && <li className="py-2 text-sm text-gray-500">{t('common.empty')}</li>}
            </ul>
          </Card>
          <Card title={`${t('parcelStatus.LOADED')} (${loaded.length})`}>
            <ul className="divide-y divide-gray-100">
              {loaded.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <Link href={`/parcels/${p.trackingCode}`} className="font-mono font-semibold text-navy hover:underline">{p.trackingCode}</Link>
                    <p className="text-sm text-gray-700">→ {p.toBranch.name} · {p.trip ? `${p.trip.vehicle.plate} ${dateTime(p.trip.departureAt)}` : ''}</p>
                  </div>
                  <ParcelStatusBadge s={p.status} />
                  <Button size="sm" variant="ghost" onClick={() => unload(p.id)}>{t('parcel.unload')}</Button>
                </li>
              ))}
              {!loaded.length && <li className="py-2 text-sm text-gray-500">{t('common.empty')}</li>}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
