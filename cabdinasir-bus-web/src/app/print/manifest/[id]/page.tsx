'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { dateTime, phone, usd } from '@/lib/format';
import type { Trip } from '@/lib/types';
import { PrintShell } from '@/components/print';

interface Manifest {
  trip: Trip;
  passengers: { seatNo: string; passengerName: string; passengerPhone: string; receiptNo: string; status: string }[];
  parcels: { trackingCode: string; receiverName: string; receiverPhone: string; pieces: number; weightKg: string; isFragile: boolean; payer: string; feeCents: number; paidAt: string | null; category: { nameSo: string } }[];
  totals: { passengers: number; reservedUnpaid: number; parcels: number; pieces: number; codToCollectCents: number };
}

/** Manifest-ka safarka (A4): rakaabka + alaabta, saxiixa darawalka & karraaniga. */
export default function ManifestPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['print', 'manifest', id], queryFn: () => api<Manifest>(`/trips/${id}/manifest`), enabled: !!user });
  const m = q.data;
  return (
    <PrintShell ready={!!m} autoPrint={false}>
      {m && (
        <div className="mx-auto max-w-3xl text-sm text-black">
          <h1 className="text-xl font-bold">Cabdinasir Bus — {t('trips.manifest')}</h1>
          <p>
            {m.trip.route.fromBranch.name} → {m.trip.route.toBranch.name} · {dateTime(m.trip.departureAt)} · {m.trip.vehicle.plate} · {m.trip.driver.name} ({phone(m.trip.driver.phone)})
          </p>
          <h2 className="mt-4 font-bold">{t('trips.passengers')} ({m.totals.passengers}{m.totals.reservedUnpaid ? ` + ${m.totals.reservedUnpaid} ${t('trips.reserved')}` : ''})</h2>
          <table className="mt-1 w-full border-collapse text-xs">
            <thead><tr className="border-b border-black text-left"><th>{t('booking.seat')}</th><th>{t('booking.passenger')}</th><th>{t('common.phone')}</th><th>{t('booking.receipt')}</th><th>{t('common.status')}</th><th>✓</th></tr></thead>
            <tbody>
              {m.passengers.map((p) => (
                <tr key={p.receiptNo} className="border-b border-gray-300"><td className="py-1 font-bold">{p.seatNo}</td><td>{p.passengerName}</td><td>{phone(p.passengerPhone)}</td><td>{p.receiptNo}</td><td>{t(`bookingStatus.${p.status}`)}</td><td>☐</td></tr>
              ))}
            </tbody>
          </table>
          <h2 className="mt-4 font-bold">{t('trips.parcels')} ({m.totals.parcels} · {m.totals.pieces}×) · {t('trips.codToCollect')}: {usd(m.totals.codToCollectCents)}</h2>
          <table className="mt-1 w-full border-collapse text-xs">
            <thead><tr className="border-b border-black text-left"><th>{t('parcel.tracking')}</th><th>{t('parcel.receiver')}</th><th>{t('parcel.pieces')}</th><th>kg</th><th>COD</th><th>✓</th></tr></thead>
            <tbody>
              {m.parcels.map((p) => (
                <tr key={p.trackingCode} className="border-b border-gray-300"><td className="py-1 font-mono">{p.trackingCode}</td><td>{p.receiverName} {phone(p.receiverPhone)}</td><td>{p.pieces}{p.isFragile ? ' ⚠️' : ''}</td><td>{String(p.weightKg)}</td><td>{p.payer === 'RECEIVER' && !p.paidAt ? usd(p.feeCents) : '—'}</td><td>☐</td></tr>
              ))}
            </tbody>
          </table>
          <div className="mt-10 grid grid-cols-2 gap-10">
            <div className="border-t border-black pt-1">{t('trips.driver')}</div>
            <div className="border-t border-black pt-1">{t('roles.CASHIER')}</div>
          </div>
        </div>
      )}
    </PrintShell>
  );
}
