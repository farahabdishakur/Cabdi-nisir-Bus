'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { dateTime, phone, usd } from '@/lib/format';
import type { Paged, Parcel, PaymentInput } from '@/lib/types';
import { Alert, Button, Card, Field, Input, Loading, PageHeader } from '@/components/ui';
import { CASH_USD, ParcelStatusBadge, PaymentPicker, paymentReady } from '@/components/domain';

/** Wareejin: raadi (koodh/taleefan/magac) → hubi magaca + PIN → COD/kayd → Wareeji → rasiid. */
export default function DeliverPage() {
  const { t, err } = useI18n();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Parcel | null>(null);
  const [pin, setPin] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [pay, setPay] = useState<PaymentInput>(CASH_USD);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Parcel | null>(null);

  const results = useQuery({
    queryKey: ['parcels', 'deliver', search],
    queryFn: () => api<Paged<Parcel>>('/parcels', { query: { direction: 'incoming', q: search, limit: 20 } }),
    enabled: search.length > 0,
  });
  const ready = (results.data?.data ?? []).filter((p) => p.status === 'ARRIVED' || p.status === 'DAMAGED');

  const choose = async (p: Parcel) => {
    setError('');
    setPin('');
    setReceivedBy(p.receiverName);
    setPay(CASH_USD);
    setSelected(await api<Parcel>(`/parcels/${p.id}`));
  };

  const cod = selected && selected.payer === 'RECEIVER' && !selected.paidAt ? selected.feeCents : 0;
  const storage = selected?.storageFeeCents ?? 0;
  const due = cod + storage;

  const deliver = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const p = await api<Parcel>(`/parcels/${selected.id}/deliver`, { method: 'POST', body: { pin, receivedByName: receivedBy.trim(), ...(due > 0 && { payment: pay }) } });
      setDone(p);
      setSelected(null);
      qc.invalidateQueries({ queryKey: ['parcels'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('parcel.deliverTitle')} />
      {done && (
        <div className="mb-4">
          <Alert tone="green">
            ✓ {t('parcel.delivered')}: <b>{done.trackingCode}</b> → {done.deliveredToName}{' '}
            <button className="font-bold underline" onClick={() => window.open(`/print/parcel/${done.id}`, '_blank')}>🖨 {t('common.print')}</button>
          </Alert>
        </div>
      )}
      <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); setSelected(null); setDone(null); }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('parcel.deliverSearch')} autoFocus />
        <Button type="submit" variant="navy">{t('common.search')}</Button>
      </form>

      {!selected && search && (
        <Card>
          {results.isLoading ? <Loading /> : !ready.length ? <p className="text-sm text-gray-500">{t('common.empty')}</p> : (
            <ul className="divide-y divide-gray-100">
              {ready.map((p) => (
                <li key={p.id}>
                  <button className="flex w-full items-center justify-between gap-2 py-3 text-left hover:bg-gray-50" onClick={() => choose(p)}>
                    <div>
                      <p className="font-mono font-semibold text-navy">{p.trackingCode}</p>
                      <p className="text-sm text-gray-700">{p.receiverName} · {phone(p.receiverPhone)} · {p.pieces}× {p.category.nameSo}</p>
                      <p className="text-xs text-gray-500">{p.fromBranch.name} · {dateTime(p.arrivedAt)}</p>
                    </div>
                    <ParcelStatusBadge s={p.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {selected && (
        <Card title={`${selected.trackingCode} · ${selected.receiverName}`} actions={<Button size="sm" variant="ghost" onClick={() => setSelected(null)}>✕</Button>}>
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-gray-500">{t('parcel.receiver')}</dt><dd>{selected.receiverName} · {phone(selected.receiverPhone)}</dd>
              <dt className="text-gray-500">{t('parcel.sender')}</dt><dd>{selected.senderName} ({selected.fromBranch.name})</dd>
              <dt className="text-gray-500">{t('parcel.pieces')}</dt><dd>{selected.pieces}× {selected.category.nameSo} · {String(selected.weightKg)} kg</dd>
              {cod > 0 && (<><dt className="text-gray-500">{t('parcel.codDue')}</dt><dd className="font-bold text-amber-700">{usd(cod)}</dd></>)}
              {storage > 0 && (<><dt className="text-gray-500">{t('parcel.storageFee')}</dt><dd className="font-bold text-amber-700">{usd(storage)}</dd></>)}
            </dl>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('parcel.pin')} required>
                {(id) => <Input id={id} inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} className="font-mono text-2xl tracking-[0.5em]" />}
              </Field>
              <Field label={t('parcel.receivedBy')} required>
                {(id) => <Input id={id} value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} />}
              </Field>
            </div>
            {due > 0 && <PaymentPicker value={pay} onChange={setPay} />}
            {error && <Alert>{error}</Alert>}
            <Button size="lg" variant="success" onClick={deliver} loading={busy} disabled={pin.length !== 4 || receivedBy.trim().length < 2 || (due > 0 && !paymentReady(pay))}>
              🤝 {t('parcel.deliver')} {due > 0 ? usd(due) : ''}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
