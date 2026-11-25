'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { dateTime, phone, usd } from '@/lib/format';
import type { Parcel } from '@/lib/types';
import { Alert, Button, Card, Loading, PageHeader } from '@/components/ui';
import { ParcelStatusBadge, ErrorAlert } from '@/components/domain';

/**
 * Alaabta imanaysa (laantayda): waa la arkaa ka hor inta gaarigu iman.
 * Gaarigu marka uu yimaado: calaamadee kuwa la helay → "Xaqiiji" → kuwa maqan si cas ah ayay u muuqdaan.
 */
export default function IncomingPage() {
  const { t, err } = useI18n();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['parcels', 'incoming'], queryFn: () => api<Parcel[]>('/parcels/incoming'), refetchInterval: 30_000 });
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<{ arrived: string[]; missing: { trackingCode: string; receiverName: string }[] } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const groups = new Map<string, Parcel[]>();
  for (const p of list.data ?? []) {
    const k = p.status === 'IN_TRANSIT' || p.status === 'MISSING' ? (p.tripId ?? 'none') : p.status;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }

  const arrive = async (tripId: string, parcels: Parcel[]) => {
    const ids = parcels.filter((p) => checked[p.id]).map((p) => p.id);
    if (!ids.length) return;
    setBusy(tripId);
    setError('');
    try {
      setResult(await api('/parcels/arrive-batch', { method: 'POST', body: { tripId, parcelIds: ids } }));
      setChecked({});
      qc.invalidateQueries({ queryKey: ['parcels'] });
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <div>
      <PageHeader title={t('nav.incoming')} />
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      {result && (
        <div className="mb-3 flex flex-col gap-2">
          <Alert tone="green">✓ {result.arrived.length} — {result.arrived.join(', ')}</Alert>
          {result.missing.length > 0 && <Alert>{t('parcel.missing')}: {result.missing.map((m) => `${m.trackingCode} (${m.receiverName})`).join(', ')}</Alert>}
        </div>
      )}
      {list.error ? <ErrorAlert error={list.error} /> : list.isLoading ? <Loading /> : !list.data?.length ? <Card><p className="text-sm text-gray-500">{t('common.empty')}</p></Card> : (
        <div className="flex flex-col gap-4">
          {[...groups.entries()].map(([key, parcels]) => {
            const inTransit = parcels[0].status === 'IN_TRANSIT' || parcels[0].status === 'MISSING';
            const title = inTransit && parcels[0].trip ? `🚐 ${parcels[0].trip.vehicle.plate} · ${dateTime(parcels[0].trip.departureAt)}` : t(`parcelStatus.${parcels[0].status}`);
            return (
              <Card
                key={key}
                title={`${title} (${parcels.length})`}
                actions={inTransit && parcels[0].tripId && (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => setChecked(Object.fromEntries(parcels.map((p) => [p.id, true])))}>✓ {t('booking.filterAll')}</Button>
                    <Button size="sm" variant="success" loading={busy === key} onClick={() => arrive(parcels[0].tripId!, parcels)}>{t('parcel.arriveSelected')}</Button>
                  </>
                )}
              >
                <ul className="divide-y divide-gray-100">
                  {parcels.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 py-2">
                      {inTransit && (
                        <input type="checkbox" className="h-6 w-6 accent-emerald-600" checked={!!checked[p.id]} onChange={(e) => setChecked({ ...checked, [p.id]: e.target.checked })} aria-label={p.trackingCode} />
                      )}
                      <div className="min-w-0 flex-1">
                        <Link href={`/parcels/${p.trackingCode}`} className="font-mono font-semibold text-navy hover:underline">{p.trackingCode}</Link>
                        <p className="text-sm text-gray-700">{p.receiverName} · {phone(p.receiverPhone)} · {p.pieces}× · {p.category.nameSo}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <ParcelStatusBadge s={p.status} />
                        {p.payer === 'RECEIVER' && !p.paidAt && <span className="text-xs font-bold text-amber-700">COD {usd(p.feeCents)}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
