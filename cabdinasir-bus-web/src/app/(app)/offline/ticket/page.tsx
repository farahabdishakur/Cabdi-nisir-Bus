'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { newKey } from '@/lib/api';
import { loadBootstrap, useOnline } from '@/lib/offline';
import { enqueueTicket, freeSeats, loadPack, loadTickets, refreshPack, useOfflineTickets, type OfflinePack, type PackTrip } from '@/lib/offline-tickets';
import { cx, dateTime, time, usd } from '@/lib/format';
import type { Booking, Method } from '@/lib/types';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select } from '@/components/ui';
import { PaperNoField, showPaperCopy } from '@/components/paper-ticket';

/**
 * Tigidh iib OFFLINE (internet la'aan): kaliya kuraasta QOONDADA laantayda (Boorama 1 iyo 2 kuraas kala gooni ah) —
 * sidaas darteed laba laamood isku kursi ma iibin karaan. Marka internet-ku soo noqdo si toos ah ayay u gudbaan.
 */
export default function OfflineTicketPage() {
  const { t } = useI18n();
  const online = useOnline();
  const queue = useOfflineTickets();
  const [pack, setPack] = useState<OfflinePack | null>(null);
  const [tripId, setTripId] = useState('');
  const [seat, setSeat] = useState('');
  const [f, setF] = useState({ name: '', phone: '', paper: '', method: 'CASH' as Method, reference: '' });
  const [error, setError] = useState('');
  const ticketMode = (loadBootstrap<{ settings?: { ticketMode?: number } }>()?.settings?.ticketMode) ?? 1;

  useEffect(() => {
    setPack(loadPack());
    void loadTickets();
    if (navigator.onLine) void refreshPack().then((p) => p && setPack(p));
  }, []);
  const trips = useMemo(() => [...(pack?.trips ?? [])].sort((a, b) => Number(b.loading) - Number(a.loading)), [pack]);
  useEffect(() => {
    if (!tripId && trips[0]) setTripId(trips[0].id);
  }, [trips, tripId]);
  const trip = trips.find((x) => x.id === tripId);
  const free = trip ? freeSeats(trip, queue) : new Set<string>();
  const price = trip && seat ? trip.route.ticketPriceCents + ((trip.vehicle.seatLayout.front ?? []).includes(seat) ? trip.route.frontSeatSurchargeCents : 0) : 0;
  const ready = !!trip && !!seat && free.has(seat) && f.name.trim().length >= 2 && f.phone.replace(/\s/g, '').length >= 6 && (ticketMode !== 1 || f.paper.trim()) && (f.method === 'CASH' || f.reference.trim().length >= 3);

  const save = async () => {
    if (!trip || !ready) return;
    setError('');
    const payment = f.method === 'CASH' ? { method: 'CASH' as Method, currency: 'USD' as const } : { method: f.method, currency: 'USD' as const, reference: f.reference.trim() };
    const at = new Date().toISOString();
    const key = newKey();
    try {
      await enqueueTicket({
        idempotencyKey: key, offlineCreatedAt: at, tripId: trip.id, seatNo: seat, passengerName: f.name.trim(), passengerPhone: f.phone.trim(),
        paperTicketNo: f.paper.trim() || undefined, payment, priceCents: price, status: 'pending',
        trip: { from: trip.route.from, to: trip.route.to, plate: trip.vehicle.plate, departureAt: trip.departureAt },
      });
    } catch {
      return setError(t('errors.UNKNOWN'));
    }
    // kaarka "ku qor warqadda" (isla qaabka online-ka) — rasiidka dhabta ah wuxuu imanayaa marka la sync-gareeyo
    showPaperCopy({
      id: `offline:${key}`, receiptNo: 'OFFLINE', tripId: trip.id, seatNo: seat, passengerName: f.name.trim(), passengerPhone: f.phone.trim(),
      priceCents: price, discountCents: 0, priceBreakdown: { lines: [], totalCents: price }, status: 'CONFIRMED', branchId: '', reservedUntil: null, printCount: 0,
      paperTicketNo: f.paper.trim() || null, createdAt: at,
      payments: [{ id: 'p', method: payment.method, currency: 'USD', amount: price, amountUsdCents: price, kind: 'TICKET', reference: f.reference || null, payerPhone: null, createdAt: at }],
      trip: { departureAt: trip.departureAt, route: { fromBranch: { name: trip.route.from }, toBranch: { name: trip.route.to } }, vehicle: { plate: trip.vehicle.plate } },
    } as unknown as Booking);
    setSeat('');
    setF({ name: '', phone: '', paper: '', method: 'CASH', reference: '' });
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={`📴 ${t('offTicket.title')}`} actions={<Link href="/offline"><Button variant="secondary">{t('nav.offline')}</Button></Link>} />
      <Alert tone={online ? 'blue' : 'yellow'}>{online ? t('offTicket.hintOnline') : t('offTicket.hintOffline')}</Alert>
      {!pack ? (
        <Alert>{t('offTicket.noPack')}</Alert>
      ) : (
        <p className="text-xs text-gray-500">{t('offTicket.packAge', { at: dateTime(pack.generatedAt) })}</p>
      )}
      {pack && !trips.length && <Alert tone="yellow">{t('offTicket.noTrips')}</Alert>}

      {trips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {trips.map((x) => (
            <Button key={x.id} size="sm" variant={x.id === tripId ? 'navy' : 'secondary'} onClick={() => { setTripId(x.id); setSeat(''); }}>
              {x.loading ? '🟢 ' : ''}{x.vehicle.plate} · {x.route.to} · {time(x.departureAt)}
            </Button>
          ))}
        </div>
      )}

      {trip && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={`${trip.route.from} → ${trip.route.to} · ${trip.vehicle.plate}`}>
            <SeatGrid trip={trip} free={free} selected={seat} onSelect={setSeat} />
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
              <span><span className="mr-1 inline-block h-3 w-3 rounded bg-emerald-500" />{t('offTicket.mine')}</span>
              <span><span className="mr-1 inline-block h-3 w-3 rounded bg-red-500" />{t('offTicket.taken')}</span>
              <span><span className="mr-1 inline-block h-3 w-3 rounded bg-gray-300" />{t('offTicket.otherBranch')}</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-emerald-800">{t('offTicket.freeCount', { n: free.size })}</p>
          </Card>
          <Card title={seat ? `${t('booking.seat')} ${seat}` : t('seat.pick')}>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('common.phone')} required>{(id) => <Input id={id} inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />}</Field>
                <Field label={t('common.name')} required>{(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('payment.method')}>{(id) => (
                  <Select id={id} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as Method })}>
                    <option value="CASH">Cash</option><option value="ZAAD">Zaad</option><option value="EDAHAB">eDahab</option>
                  </Select>
                )}</Field>
                {f.method !== 'CASH' && <Field label={t('payment.reference')} required>{(id) => <Input id={id} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />}</Field>}
              </div>
              {ticketMode !== 0 && <PaperNoField value={f.paper} onChange={(v) => setF({ ...f, paper: v })} required={ticketMode === 1} />}
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
                <span className="text-sm text-gray-600">{t('common.total')}</span>
                <span className="text-2xl font-black text-navy">{usd(price)}</span>
              </div>
              {error && <Alert>{error}</Alert>}
              <Button size="lg" onClick={save} disabled={!ready}>💾 {t('offTicket.save')}</Button>
            </div>
          </Card>
        </div>
      )}

      {queue.length > 0 && (
        <Card title={t('offTicket.queue')}>
          <ul className="flex flex-col gap-1 text-sm">
            {queue.map((q) => (
              <li key={q.idempotencyKey} className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 py-1">
                <span>{time(q.offlineCreatedAt)} · <b>{q.passengerName}</b> · {q.trip.plate} · {t('booking.seat')} {q.finalSeat ?? q.seatNo}{q.paperTicketNo ? ` · ✍️ ${q.paperTicketNo}` : ''}</span>
                {q.status === 'synced'
                  ? <Badge tone={q.seatChangedFrom ? 'yellow' : 'green'}>✓ {q.receiptNo}{q.seatChangedFrom ? ` · ${t('offTicket.seatChanged', { from: q.seatChangedFrom, to: q.finalSeat ?? '' })}` : ''}</Badge>
                  : q.status === 'error' ? <Badge tone="red">✕ {q.error?.code}</Badge> : <Badge tone="yellow">⏳ {t('offline.pending')}</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function SeatGrid({ trip, free, selected, onSelect }: { trip: PackTrip; free: Set<string>; selected: string; onSelect: (s: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="inline-block rounded-2xl border-2 border-gray-300 bg-gray-50 p-2">
      {trip.vehicle.seatLayout.rows.map((row, r) => (
        <div key={r} className="flex gap-1 py-0.5">
          {row.map((c, i) => {
            if (c === 'D') return <span key={i} className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-700 text-xs text-white">🛞</span>;
            if (c === null) return <span key={i} className="h-11 w-11" />;
            const mine = trip.myQuota.includes(c);
            const isFree = free.has(c);
            return (
              <button key={i} type="button" disabled={!isFree} onClick={() => onSelect(c)} aria-label={`${t('booking.seat')} ${c}`}
                className={cx('h-11 w-11 rounded-lg text-sm font-bold', selected === c ? 'bg-amber-400 text-amber-950 ring-2 ring-amber-600' : isFree ? 'bg-emerald-500 text-white hover:bg-emerald-600' : mine ? 'bg-red-500 text-white' : trip.taken.includes(c) ? 'bg-red-300 text-white' : 'bg-gray-300 text-gray-600')}>
                {c}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
