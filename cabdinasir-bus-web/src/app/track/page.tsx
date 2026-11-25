'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { dateTime, usd } from '@/lib/format';
import type { ParcelStatus } from '@/lib/types';
import { Alert, Button, Card, Field, Input } from '@/components/ui';
import { ParcelStatusBadge } from '@/components/domain';
import { PublicShell } from '@/components/public-shell';

interface Tracked {
  trackingCode: string;
  status: ParcelStatus;
  from: string;
  to: string;
  pieces: number;
  registeredAt: string;
  arrivedAt: string | null;
  deliveredAt: string | null;
  amountDueCents: number;
  history: { status: ParcelStatus; at: string; branch: string | null }[];
}

/**
 * Macmiilku alaabtiisa ayuu raadiyaa: koodhka + 4-ta god ee ugu dambeeya taleefanka (qaataha ama diraha).
 * Magac / taleefan lama muujiyo (backend). 10 isku day daqiiqaddii.
 */
export default function TrackPage() {
  const { t, err } = useI18n();
  const [code, setCode] = useState('');
  const [last4, setLast4] = useState('');
  const [data, setData] = useState<Tracked | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('code');
    if (c) setCode(c.toUpperCase());
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setData(null);
    try {
      setData(await api<Tracked>(`/public/track/${encodeURIComponent(code.trim().toUpperCase())}`, { query: { phone: last4 } }));
    } catch (x) {
      setError(err(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicShell>
      <Card title={t('public.trackTitle')}>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end">
          <Field label={t('parcel.tracking')} required>{(id) => <Input id={id} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CB-BO1-000123" required />}</Field>
          <Field label={t('public.last4')} required>{(id) => <Input id={id} inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))} placeholder="0038" required />}</Field>
          <Button type="submit" loading={busy} disabled={!code || last4.length !== 4}>{t('common.search')}</Button>
        </form>
        <p className="mt-2 text-xs text-gray-500">{t('public.trackHint')}</p>
      </Card>

      {error && <div className="mt-4"><Alert>{error}</Alert></div>}

      {data && (
        <Card className="mt-4" title={<span className="flex flex-wrap items-center gap-2 font-mono">{data.trackingCode} <ParcelStatusBadge s={data.status} /></span>}>
          <div className="mb-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div><p className="text-gray-500">{t('common.from')}</p><p className="font-semibold">{data.from}</p></div>
            <div><p className="text-gray-500">{t('common.to')}</p><p className="font-semibold">{data.to}</p></div>
            <div><p className="text-gray-500">{t('parcel.pieces')}</p><p className="font-semibold">{data.pieces}</p></div>
            <div><p className="text-gray-500">{t('common.date')}</p><p className="font-semibold">{dateTime(data.registeredAt)}</p></div>
          </div>
          {data.status === 'ARRIVED' && <Alert tone="green">{t('public.readyForPickup', { to: data.to })}</Alert>}
          {data.amountDueCents > 0 && <div className="mt-2"><Alert tone="yellow">{t('public.amountDue', { amount: usd(data.amountDueCents) })}</Alert></div>}
          <ol className="relative mt-4 border-l-2 border-gray-200 pl-4">
            {data.history.map((h, i) => (
              <li key={i} className="mb-3">
                <span className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full bg-navy" />
                <p className="text-sm font-semibold">{t(`parcelStatus.${h.status}`)}{h.branch ? ` · ${h.branch}` : ''}</p>
                <p className="text-xs text-gray-500">{dateTime(h.at)}</p>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </PublicShell>
  );
}
