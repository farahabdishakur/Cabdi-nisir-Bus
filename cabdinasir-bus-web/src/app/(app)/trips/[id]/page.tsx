'use client';

import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, newKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { can } from '@/lib/permissions';
import { useBootstrap, useCashSession, useUpcomingTrips } from '@/lib/queries';
import { dateTime, parseUsd, time, usd } from '@/lib/format';
import type { Booking, PaymentInput, SeatMapData, SeatState, Trip, TripStatus } from '@/lib/types';
import { Alert, Button, Card, Field, Input, Loading, Modal, PageHeader, Select } from '@/components/ui';
import { CASH_USD, PartyInput, PaymentPicker, paymentReady, ReasonModal, TripStatusBadge, ErrorAlert } from '@/components/domain';
import { SeatMap } from '@/components/seat-map';
import { BookingModal } from '@/components/booking-actions';
import { EditTripModal } from '@/components/trip-forms';

const NEXT_STATUS: Partial<Record<TripStatus, TripStatus[]>> = {
  SCHEDULED: ['BOARDING', 'DEPARTED', 'CANCELLED'],
  BOARDING: ['DEPARTED', 'CANCELLED'],
  DEPARTED: ['ARRIVED'],
  ARRIVED: ['CLOSED'],
};
const STATUS_LABEL: Record<string, string> = { BOARDING: 'trips.toBoarding', DEPARTED: 'trips.toDeparted', ARRIVED: 'trips.toArrived', CLOSED: 'trips.toClosed', CANCELLED: 'trips.toCancelled' };

export default function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, err } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const trip = useQuery({ queryKey: ['trip', id], queryFn: () => api<Trip>(`/trips/${id}`) });
  const seats = useQuery({ queryKey: ['trip', id, 'seats'], queryFn: () => api<SeatMapData>(`/trips/${id}/seats`), refetchInterval: 15_000, enabled: user?.role !== 'DRIVER' });
  const [selected, setSelected] = useState<SeatState | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState('');
  const [statusModal, setStatusModal] = useState<TripStatus | null>(null);
  const [moving, setMoving] = useState(false);
  const [editing, setEditing] = useState(false);
  const boot = useBootstrap();
  const driver = user?.role === 'DRIVER';
  // kursiga la hayo — marka bogga laga baxo waa la sii daayaa (qof kale ha sugin 3 daqiiqo)
  const heldRef = useRef<string | null>(null);
  useEffect(() => {
    heldRef.current = selected?.seatNo ?? null;
  }, [selected]);
  useEffect(
    () => () => {
      if (heldRef.current) void api(`/trips/${id}/seats/${encodeURIComponent(heldRef.current)}/hold`, { method: 'DELETE' }).catch(() => undefined);
    },
    [id],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['trip', id] });
    qc.invalidateQueries({ queryKey: ['trips'] });
  };

  const hold = useMutation({
    mutationFn: (seatNo: string) => api<{ seatNo: string; expiresAt: string }>(`/trips/${id}/seats/${encodeURIComponent(seatNo)}/hold`, { method: 'POST' }),
    onSuccess: (h) => {
      setSelected({ seatNo: h.seatNo, state: 'HELD_BY_ME', expiresAt: h.expiresAt });
      qc.invalidateQueries({ queryKey: ['trip', id, 'seats'] });
    },
    onError: (e) => setError(err(e)),
  });

  const release = async () => {
    if (selected) await api(`/trips/${id}/seats/${encodeURIComponent(selected.seatNo)}/hold`, { method: 'DELETE' }).catch(() => undefined);
    setSelected(null);
    qc.invalidateQueries({ queryKey: ['trip', id, 'seats'] });
  };

  const pick = async (s: SeatState) => {
    setError('');
    if (s.state === 'AVAILABLE' || s.state === 'HELD_BY_ME') {
      if (!canSellHere) return;
      if (selected && selected.seatNo !== s.seatNo) await release();
      hold.mutate(s.seatNo);
    } else if ((s.state === 'BOOKED' || s.state === 'RESERVED') && s.booking) {
      try {
        setBooking(await api<Booking>(`/bookings/${s.booking.id}`));
      } catch (e) {
        setError(err(e));
      }
    }
  };

  const changeStatus = async (status: TripStatus, reason?: string) => {
    await api(`/trips/${id}/status`, { method: 'PATCH', body: { status, reason } });
    refresh();
  };

  if (trip.isLoading) return <Loading />;
  if (!trip.data) return <Alert>{err(trip.error)}</Alert>;
  const tr = trip.data;
  const open = tr.status === 'SCHEDULED' || tr.status === 'BOARDING';
  // Tigidh waxaa iibiya laamaha magaalada laga baxayo (Boorama 1 & 2); Wajaale safarka Boorama wuu arkaa oo keliya
  const myCity = boot.data?.branches.find((b) => b.id === user?.branchId)?.city;
  const canSellHere = can(user, 'sell') && (user?.role === 'SUPER_ADMIN' || (!!myCity && myCity === tr.route.fromBranch.city));
  if (driver) return <DriverManifest trip={tr} />;
  // backend: bixitaan/joojin/beddel = maamulaha laanta safarka leh; gaadhay/xir = maamule magaalada loo socdo
  const isSA = user?.role === 'SUPER_ADMIN';
  const ownsTrip = isSA || (user?.role === 'BRANCH_MANAGER' && user.branchId === tr.route.fromBranchId);
  const destManager = isSA || (user?.role === 'BRANCH_MANAGER' && !!myCity && myCity === tr.route.toBranch.city);
  const allowed = (NEXT_STATUS[tr.status] ?? []).filter((s) =>
    s === 'ARRIVED' || s === 'CLOSED' ? destManager : s === 'BOARDING' ? ownsTrip || (user?.role === 'CASHIER' && canSellHere) : ownsTrip,
  );

  return (
    <div>
      <PageHeader
        title={`${time(tr.departureAt)} · ${tr.route.fromBranch.name} → ${tr.route.toBranch.name}`}
        actions={
          <>
            <Link href={`/print/manifest/${id}`} target="_blank">
              <Button variant="secondary">🖨 {t('trips.manifest')}</Button>
            </Link>
            {ownsTrip && open && (
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  ✎ {t('trips.edit')}
                </Button>
                <Button variant="secondary" onClick={() => setMoving(true)}>
                  {t('trips.move')}
                </Button>
              </>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-gray-700">
        <TripStatusBadge s={tr.status} />
        <span>{dateTime(tr.departureAt)}</span>
        <span>🚐 {tr.vehicle.plate}</span>
        <span>👤 {tr.driver.name}</span>
        {allowed.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={s === 'CANCELLED' ? 'danger' : 'navy'}
            onClick={() => (s === 'CANCELLED' ? setStatusModal(s) : changeStatus(s).catch((e) => setError(err(e))))}
          >
            {t(STATUS_LABEL[s])}
          </Button>
        ))}
      </div>
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <Card title={t('trips.seats')}>
          {seats.error ? <ErrorAlert error={seats.error} /> : seats.isLoading || !seats.data ? <Loading /> : <SeatMap data={seats.data} onPick={pick} selected={selected?.seatNo} />}
        </Card>
        <div>
          {selected && open && canSellHere ? (
            <SellPanel trip={tr} seat={selected} onDone={() => setSelected(null)} onCancel={release} />
          ) : (
            <Card>
              <p className="text-sm text-gray-600">{!open ? t('errors.TRIP_CLOSED_FOR_SALE') : canSellHere ? t('seat.pick') : t('trips.viewOnly')}</p>
            </Card>
          )}
        </div>
      </div>

      <BookingModal booking={booking} onClose={() => setBooking(null)} />
      <ReasonModal open={statusModal === 'CANCELLED'} title={t('trips.toCancelled')} danger onClose={() => setStatusModal(null)} onSubmit={(reason) => changeStatus('CANCELLED', reason)} />
      <MoveModal open={moving} onClose={() => setMoving(false)} trip={tr} />
      <EditTripModal trip={tr} open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}

/** Darawalka: liiska rakaabka & alaabta (seat map ma iibiyo). */
function DriverManifest({ trip }: { trip: Trip }) {
  const { t } = useI18n();
  const m = useQuery({
    queryKey: ['trip', trip.id, 'manifest'],
    queryFn: () => api<{ passengers: { seatNo: string; passengerName: string; passengerPhone: string; status: string }[]; parcels: { trackingCode: string; receiverName: string; pieces: number }[]; totals: { passengers: number; parcels: number; pieces: number } }>(`/trips/${trip.id}/manifest`),
    refetchInterval: 30_000,
  });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={`${time(trip.departureAt)} · ${trip.route.fromBranch.name} → ${trip.route.toBranch.name}`} />
      <div className="flex flex-wrap gap-3 text-sm"><TripStatusBadge s={trip.status} /><span>🚐 {trip.vehicle.plate}</span></div>
      {m.error ? <ErrorAlert error={m.error} /> : m.isLoading ? <Loading /> : m.data && (
        <>
          <Card title={`${t('trips.passengers')} (${m.data.totals.passengers})`}>
            <ul className="divide-y divide-gray-100">
              {m.data.passengers.map((p) => (
                <li key={p.seatNo} className="flex justify-between py-2 text-sm"><span><b>{p.seatNo}</b> · {p.passengerName}</span><span className="text-gray-500">{t(`bookingStatus.${p.status}`)}</span></li>
              ))}
            </ul>
          </Card>
          <Card title={`${t('trips.parcels')} (${m.data.totals.parcels} · ${m.data.totals.pieces}×)`}>
            <ul className="divide-y divide-gray-100">
              {m.data.parcels.map((p) => <li key={p.trackingCode} className="py-2 text-sm font-mono">{p.trackingCode} · {p.receiverName} · {p.pieces}×</li>)}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

function SellPanel({ trip, seat, onDone, onCancel }: { trip: Trip; seat: SeatState; onDone: () => void; onCancel: () => void }) {
  const { t, err } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const boot = useBootstrap();
  const session = useCashSession();
  const [mode, setMode] = useState<'sell' | 'reserve'>('sell');
  const [party, setParty] = useState({ name: '', phone: '' });
  const [pay, setPay] = useState<PaymentInput>(CASH_USD);
  const [discount, setDiscount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);
  const key = useRef(newKey());

  useEffect(() => {
    key.current = newKey();
    setError('');
  }, [seat.seatNo, mode]);

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.round((new Date(seat.expiresAt ?? 0).getTime() - Date.now()) / 1000)));
    tick();
    const h = setInterval(tick, 1000);
    return () => clearInterval(h);
  }, [seat.expiresAt]);

  const isFront = (trip.vehicle.seatLayout.front ?? []).includes(seat.seatNo);
  const price = trip.route.ticketPriceCents + (isFront ? trip.route.frontSeatSurchargeCents : 0);
  const discountCents = discount ? parseUsd(discount) ?? 0 : 0;
  const cutoff = boot.data?.settings.reservationCutoffMinutes ?? 60;
  const until = new Date(new Date(trip.departureAt).getTime() - cutoff * 60_000);
  const canReserve = cutoff > 0 && until > new Date();
  const noSession = mode === 'sell' && !session.data && !session.isLoading;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const body = { tripId: trip.id, seatNo: seat.seatNo, passengerName: party.name.trim(), passengerPhone: party.phone.trim() };
      if (mode === 'sell') {
        const b = await api<Booking>('/bookings', { method: 'POST', idempotencyKey: key.current, body: { ...body, payment: pay, ...(discountCents > 0 && { discountCents }) } });
        window.open(`/print/ticket/${b.id}`, '_blank');
      } else {
        await api<Booking>('/bookings/reserve', { method: 'POST', idempotencyKey: key.current, body });
      }
      qc.invalidateQueries({ queryKey: ['trip', trip.id] });
      qc.invalidateQueries({ queryKey: ['trips'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
      onDone();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };

  const ready = party.name.trim().length >= 2 && party.phone.replace(/\s/g, '').length >= 6 && (mode === 'reserve' || paymentReady(pay));

  return (
    <Card title={`${t('booking.seat')} ${seat.seatNo}${isFront ? ` (${t('seat.front')})` : ''}`} actions={<span className="text-xs font-semibold text-amber-700">{t('seat.holdExpires', { s: left })}</span>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant={mode === 'sell' ? 'primary' : 'secondary'} onClick={() => setMode('sell')}>
            {t('booking.sell')}
          </Button>
          <Button type="button" variant={mode === 'reserve' ? 'navy' : 'secondary'} onClick={() => setMode('reserve')} disabled={!canReserve}>
            📞 {t('booking.reserve')}
          </Button>
        </div>
        {mode === 'reserve' && <Alert tone="blue">{t('booking.reserveHint', { until: dateTime(until) })}</Alert>}

        <PartyInput label={t('booking.passenger')} name={party.name} phone={party.phone} onChange={setParty} />

        {mode === 'sell' && (
          <>
            {can(user, 'discount') && (
              <Field label={`${t('booking.discount')} ($)`}>
                {(id) => <Input id={id} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" />}
              </Field>
            )}
            <PaymentPicker value={pay} onChange={setPay} />
            {noSession && (
              <Alert tone="yellow">
                {t('dashboard.noSession')}{' '}
                <Link href="/cash" className="font-bold underline">
                  {t('dashboard.openSession')}
                </Link>
              </Alert>
            )}
          </>
        )}

        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
          <span className="text-sm text-gray-600">{t('common.total')}</span>
          <span className="text-2xl font-black text-navy">{usd(Math.max(0, price - discountCents))}</span>
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button className="flex-1" size="lg" variant={mode === 'sell' ? 'primary' : 'navy'} onClick={submit} loading={busy} disabled={!ready || noSession || left === 0}>
            {mode === 'sell' ? `${t('booking.payNow')} ${usd(Math.max(0, price - discountCents))}` : t('booking.reserve')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function MoveModal({ open, onClose, trip }: { open: boolean; onClose: () => void; trip: Trip }) {
  const { t, err } = useI18n();
  const qc = useQueryClient();
  const trips = useUpcomingTrips(open);
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const options = (trips.data ?? []).filter((x) => x.id !== trip.id && x.route.fromBranch.city === trip.route.fromBranch.city && x.route.toBranch.city === trip.route.toBranch.city);

  return (
    <Modal open={open} onClose={onClose} title={t('trips.move')}>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await api(`/trips/${trip.id}/move-bookings`, { method: 'POST', body: { targetTripId: target, reason } });
            qc.invalidateQueries({ queryKey: ['trip'] });
            qc.invalidateQueries({ queryKey: ['trips'] });
            onClose();
          } catch (x) {
            setError(err(x));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={t('trips.moveTarget')} required>
          {(id) => (
            <Select id={id} value={target} onChange={(e) => setTarget(e.target.value)} required>
              <option value="">—</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {dateTime(o.departureAt)} · {o.vehicle.plate} · {o.seatsAvailable} {t('trips.free')}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('common.reason')} required>
          {(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} />}
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy} disabled={!target || reason.length < 3}>
          {t('common.confirm')}
        </Button>
      </form>
    </Modal>
  );
}
