'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useBootstrap } from '@/lib/queries';
import { dateTime, money, phone, usd } from '@/lib/format';
import type { Booking } from '@/lib/types';
import { Hr, PrintShell, Qr, Row } from '@/components/print';

/** Rasiidka tigidhka — 80mm thermal (UI_RULES §5). */
export default function TicketPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const { user } = useAuth();
  const boot = useBootstrap();
  const b = useQuery({ queryKey: ['print', 'ticket', id], queryFn: () => api<Booking>(`/bookings/${id}`), enabled: !!user });
  const bk = b.data;
  const branch = boot.data?.branches.find((x) => x.id === bk?.branchId);
  const c = boot.data?.company;
  const income = bk?.payments.filter((p) => p.amount > 0) ?? [];

  return (
    <PrintShell ready={!!bk && !!c}>
      {bk && c && (
        <div className="receipt">
          <p className="text-center text-base font-bold">{c.name}</p>
          <p className="text-center">{c.tagline}</p>
          {branch && <p className="text-center">{branch.name} · {branch.phones.join(' / ')}</p>}
          <Hr />
          <p className="text-center text-sm font-bold">🎫 {t('booking.receipt')} {bk.receiptNo}</p>
          {bk.printCount > 0 && <p className="text-center">({t('common.reprint')} #{bk.printCount})</p>}
          <Hr />
          {bk.trip && (
            <>
              <Row k={t('trips.route')} v={`${bk.trip.route.fromBranch.city} → ${bk.trip.route.toBranch.city}`} bold />
              <Row k={t('trips.departure')} v={dateTime(bk.trip.departureAt)} bold />
              <Row k={t('trips.vehicle')} v={bk.trip.vehicle.plate} />
            </>
          )}
          <Row k={t('booking.seat')} v={<span className="text-lg">{bk.seatNo}</span>} bold />
          <Row k={t('booking.passenger')} v={bk.passengerName} />
          <Row k={t('common.phone')} v={phone(bk.passengerPhone)} />
          <Hr />
          {bk.discountCents > 0 && <Row k={t('booking.discount')} v={usd(-bk.discountCents)} />}
          <Row k={t('common.total')} v={usd(bk.priceCents)} bold />
          {income.map((p) => (
            <div key={p.id}>
              <Row k={`${t(`method.${p.method}`)}${p.method !== 'CASH' ? ' ✓' : ''}`} v={money(p.amount, p.currency)} />
              {p.reference && <Row k={t('payment.reference')} v={p.reference} />}
              {p.payerPhone && <Row k={t('payment.payerPhone')} v={phone(p.payerPhone)} />}
            </div>
          ))}
          <Row k={t('common.date')} v={dateTime(bk.createdAt)} />
          <Hr />
          <div className="flex justify-center py-1"><Qr value={bk.receiptNo} /></div>
          <p className="text-[10px]">{c.passengerRules.map((r, i) => `${i + 1}. ${r}`).join(' ')}</p>
          <Hr />
          <p className="text-center">{c.receiptFooter}</p>
        </div>
      )}
    </PrintShell>
  );
}
