'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { dateTime, usd } from '@/lib/format';
import type { Booking, PaymentInput, SeatMapData } from '@/lib/types';
import { useUpcomingTrips } from '@/lib/queries';
import { Alert, Button, Field, Modal, Select } from './ui';
import { CASH_USD, PaymentPicker, paymentReady } from './domain';

/**
 * Beddel kursi / safar (ka hor bixitaanka). Farqiga qiimaha: kordhay → lacag la qaado (backend wuxuu soo celiyaa diffCents);
 * dhimay → lacag celin (Manager kaliya — backend ayaa diida karraaniga).
 */
export function TransferModal({ booking, open, onClose, onDone }: { booking: Booking; open: boolean; onClose: () => void; onDone: () => void }) {
  const { t, err } = useI18n();
  const qc = useQueryClient();
  const [tripId, setTripId] = useState(booking.tripId);
  const [seatNo, setSeatNo] = useState('');
  const [diff, setDiff] = useState<number | null>(null);
  const [pay, setPay] = useState<PaymentInput>(CASH_USD);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const fromCity = booking.trip?.route.fromBranch.city;
  const trips = useUpcomingTrips(open);
  const options = (trips.data ?? []).filter((x) => x.route.fromBranch.city === fromCity);
  const seats = useQuery({ queryKey: ['trip', tripId, 'seats'], queryFn: () => api<SeatMapData>(`/trips/${tripId}/seats`), enabled: open && !!tripId });
  const free = (seats.data?.seats ?? []).filter((s) => s.state === 'AVAILABLE').map((s) => s.seatNo);

  useEffect(() => {
    if (open) {
      setTripId(booking.tripId);
      setSeatNo('');
      setDiff(null);
      setError('');
      setPay(CASH_USD);
    }
  }, [open, booking.tripId]);
  useEffect(() => {
    setSeatNo('');
    setDiff(null);
  }, [tripId]);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/bookings/${booking.id}/transfer`, { method: 'POST', body: { tripId, seatNo, ...(diff && diff > 0 && { payment: pay }) } });
      qc.invalidateQueries({ queryKey: ['trip'] });
      qc.invalidateQueries({ queryKey: ['trips'] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PAYMENT_REQUIRED' && typeof e.details?.diffCents === 'number') {
        setDiff(e.details.diffCents);
        setError(`${t('booking.diffDue')}: ${usd(e.details.diffCents)}`);
      } else setError(err(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`${t('booking.transfer')} — ${booking.receiptNo}`}>
      <div className="flex flex-col gap-3">
        <Field label={t('trips.title')}>
          {(id) => (
            <Select id={id} value={tripId} onChange={(e) => setTripId(e.target.value)}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {dateTime(o.departureAt)} · {o.route.fromBranch.name} → {o.route.toBranch.name} · {o.vehicle.plate}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('booking.seat')} required>
          {(id) => (
            <Select id={id} value={seatNo} onChange={(e) => { setSeatNo(e.target.value); setDiff(null); }}>
              <option value="">—</option>
              {free.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          )}
        </Field>
        {diff !== null && diff > 0 && <PaymentPicker value={pay} onChange={setPay} />}
        {error && <Alert tone={diff && diff > 0 ? 'yellow' : 'red'}>{error}</Alert>}
        <Button onClick={submit} loading={busy} disabled={!seatNo || (diff !== null && diff > 0 && !paymentReady(pay))}>
          {diff && diff > 0 ? `${t('booking.payNow')} ${usd(diff)}` : t('common.confirm')}
        </Button>
      </div>
    </Modal>
  );
}
