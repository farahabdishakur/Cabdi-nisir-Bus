'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, newKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { can } from '@/lib/permissions';
import { dateTime, phone, usd } from '@/lib/format';
import type { Booking, PaymentInput } from '@/lib/types';
import { Alert, Button, Checkbox, Field, Input, Modal } from './ui';
import { BookingStatusBadge, CASH_USD, PaidVia, PaymentPicker, paymentReady, ReasonModal } from './domain';

/** Faahfaahinta tigidhka + ficillada (bixi ballan, jooji, void / codso void, sax, daabac). */
export function BookingModal({ booking, onClose }: { booking: Booking | null; onClose: () => void }) {
  const { t, err } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [pay, setPay] = useState<PaymentInput>(CASH_USD);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'' | 'cancel' | 'void' | 'request' | 'correct'>('');
  const [refund, setRefund] = useState(true);
  const [fix, setFix] = useState({ passengerName: '', passengerPhone: '' });
  const key = useRef(newKey());

  useEffect(() => {
    setPay(CASH_USD);
    setError('');
    setModal('');
    key.current = newKey();
    if (booking) setFix({ passengerName: booking.passengerName, passengerPhone: booking.passengerPhone });
  }, [booking]);

  if (!booking) return null;
  const b = booking;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['bookings'] });
    qc.invalidateQueries({ queryKey: ['trip', b.tripId] });
    qc.invalidateQueries({ queryKey: ['trips'] });
    qc.invalidateQueries({ queryKey: ['cash'] });
  };
  const open = b.status === 'RESERVED' || b.status === 'CONFIRMED';

  const confirm = async () => {
    setPaying(true);
    setError('');
    try {
      const done = await api<Booking>(`/bookings/${b.id}/confirm`, { method: 'POST', body: { payment: pay } });
      refresh();
      window.open(`/print/ticket/${done.id}`, '_blank');
      onClose();
    } catch (e) {
      setError(err(e));
    } finally {
      setPaying(false);
    }
  };

  return (
    <>
      <Modal open={!modal} onClose={onClose} title={`${t('booking.receipt')} ${b.receiptNo}`}>
        <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-500">{t('common.status')}</dt>
          <dd>
            <BookingStatusBadge s={b.status} />
          </dd>
          <dt className="text-gray-500">{t('booking.seat')}</dt>
          <dd className="font-bold">{b.seatNo}</dd>
          <dt className="text-gray-500">{t('booking.passenger')}</dt>
          <dd>{b.passengerName}</dd>
          <dt className="text-gray-500">{t('common.phone')}</dt>
          <dd>{phone(b.passengerPhone)}</dd>
          <dt className="text-gray-500">{t('booking.price')}</dt>
          <dd className="font-bold">{usd(b.priceCents)}</dd>
          {b.status === 'RESERVED' && (
            <>
              <dt className="text-gray-500">{t('booking.reservedUntil')}</dt>
              <dd className="font-semibold text-violet-700">{dateTime(b.reservedUntil)}</dd>
            </>
          )}
          {b.payments.length > 0 && (
            <>
              <dt className="text-gray-500">{t('payment.paidVia')}</dt>
              <dd className="flex flex-col gap-1">
                <PaidVia payments={b.payments} />
                {b.payments.filter((p) => p.reference).map((p) => (
                  <span key={p.id} className="text-xs text-gray-600">
                    {p.reference} · {phone(p.payerPhone)}
                  </span>
                ))}
              </dd>
            </>
          )}
        </dl>

        {b.status === 'RESERVED' && (
          <div className="mb-4 flex flex-col gap-3 rounded-lg bg-violet-50 p-3">
            <PaymentPicker value={pay} onChange={setPay} />
            {error && <Alert>{error}</Alert>}
            <Button size="lg" variant="success" onClick={confirm} loading={paying} disabled={!paymentReady(pay)}>
              {t('booking.payNow')} {usd(b.priceCents)}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {b.status !== 'RESERVED' && b.status !== 'EXPIRED' && (
            <Button variant="secondary" onClick={() => window.open(`/print/ticket/${b.id}`, '_blank')}>
              🖨 {t('common.print')}
            </Button>
          )}
          {b.status === 'RESERVED' && (
            <Button variant="secondary" onClick={() => setModal('cancel')}>
              {t('booking.cancelReservation')}
            </Button>
          )}
          {open && (
            <Button variant="secondary" onClick={() => setModal('correct')}>
              {t('booking.correct')}
            </Button>
          )}
          {b.status === 'CONFIRMED' && (can(user, 'void') ? (
            <Button variant="danger" onClick={() => setModal('void')}>
              {t('booking.void')}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setModal('request')}>
              {t('booking.requestVoid')}
            </Button>
          ))}
          {b.status === 'CONFIRMED' && (
            <Button
              variant="navy"
              onClick={async () => {
                try {
                  await api(`/bookings/${b.id}/board`, { method: 'POST' });
                  refresh();
                  onClose();
                } catch (e) {
                  setError(err(e));
                }
              }}
            >
              ✓ {t('booking.board')}
            </Button>
          )}
        </div>
        {error && b.status !== 'RESERVED' && <div className="mt-3"><Alert>{error}</Alert></div>}
      </Modal>

      <ReasonModal
        open={modal === 'cancel'}
        title={t('booking.cancelReservation')}
        onClose={() => setModal('')}
        onSubmit={async (reason) => {
          await api(`/bookings/${b.id}/cancel-reservation`, { method: 'POST', body: { reason } });
          refresh();
          onClose();
        }}
      />
      <ReasonModal
        open={modal === 'void'}
        title={`${t('booking.void')} ${b.receiptNo}`}
        danger
        onClose={() => setModal('')}
        onSubmit={async (reason) => {
          await api(`/bookings/${b.id}/void`, { method: 'POST', body: { reason, refund } });
          refresh();
          onClose();
        }}
      >
        <Checkbox label={`${t('booking.refund')} (${usd(b.priceCents)})`} checked={refund} onChange={setRefund} />
      </ReasonModal>
      <ReasonModal
        open={modal === 'request'}
        title={t('booking.requestVoid')}
        onClose={() => setModal('')}
        onSubmit={async (reason) => {
          await api('/void-requests', { method: 'POST', body: { entity: 'BOOKING', entityId: b.id, reason, refund } });
          qc.invalidateQueries({ queryKey: ['void-requests'] });
          onClose();
        }}
      >
        <Checkbox label={t('booking.refund')} checked={refund} onChange={setRefund} />
      </ReasonModal>
      <ReasonModal
        open={modal === 'correct'}
        title={t('booking.correct')}
        onClose={() => setModal('')}
        onSubmit={async (reason) => {
          await api(`/bookings/${b.id}`, { method: 'PATCH', body: { ...fix, reason } });
          refresh();
          onClose();
        }}
      >
        <Field label={t('booking.passenger')}>{(id) => <Input id={id} value={fix.passengerName} onChange={(e) => setFix({ ...fix, passengerName: e.target.value })} />}</Field>
        <Field label={t('common.phone')}>{(id) => <Input id={id} value={fix.passengerPhone} onChange={(e) => setFix({ ...fix, passengerPhone: e.target.value })} />}</Field>
      </ReasonModal>
    </>
  );
}
