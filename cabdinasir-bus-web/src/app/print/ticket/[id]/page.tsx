'use client';

import { use, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useBootstrap } from '@/lib/queries';
import { date, dateTime, money, phone, time, usd } from '@/lib/format';
import type { Booking } from '@/lib/types';
import { PrintShell, VAmount, VField, VFooter, Voucher } from '@/components/print';

/** Rasiidka tigidhka — 80mm thermal (UI_RULES §5). */
export default function TicketPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const { user } = useAuth();
  const boot = useBootstrap();
  // ?reprint=1 → dib u daabac: waa la tiriyaa + audit (rasiid nuqul ah khiyaano looguma isticmaali karo)
  const [mode, setMode] = useState<'first' | 'reprint' | null>(null);
  useEffect(() => setMode(new URLSearchParams(window.location.search).get('reprint') ? 'reprint' : 'first'), []);
  const b = useQuery({
    queryKey: ['print', 'ticket', id, mode],
    queryFn: () => (mode === 'reprint' ? api<Booking>(`/bookings/${id}/reprint`, { method: 'POST' }) : api<Booking>(`/bookings/${id}`)),
    enabled: !!user && !!mode,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false, // dib u daabac hal mar oo keliya ha la tiriyo
  });
  const bk = b.data;
  const branch = boot.data?.branches.find((x) => x.id === bk?.branchId);
  const c = boot.data?.company;
  const income = bk?.payments.filter((p) => p.amount > 0) ?? [];

  return (
    <PrintShell ready={!!bk && !!c}>
      {bk && c && (
        <Voucher title={t('voucher.receipt')} no={bk.receiptNo} company={c} phones={branch?.phones} copy={bk.printCount > 0 ? t('voucher.copy', { n: bk.printCount }) : undefined}>
          {bk.trip && (
            <div className="my-1 flex items-center justify-between gap-2">
              <span className="text-[15px] font-black leading-tight">{bk.trip.route.fromBranch.city.toUpperCase()} → {bk.trip.route.toBranch.city.toUpperCase()}</span>
              <span className="rounded border-2 border-current px-2 text-center leading-none">
                <span className="block text-[9px] font-bold">{t('voucher.seat').toUpperCase()}</span>
                <span className="block text-2xl font-black">{bk.seatNo}</span>
              </span>
            </div>
          )}
          <VField k={t('voucher.date')} v={date(bk.trip?.departureAt ?? bk.createdAt)} />
          <VField k={t('voucher.customer')} v={bk.passengerName} />
          <VField k={t('voucher.phone')} v={phone(bk.passengerPhone)} />
          {bk.trip && (
            <>
              <VField k={t('voucher.time')} v={time(bk.trip.departureAt)} big />
              <VField k={t('voucher.vehicle')} v={bk.trip.vehicle.plate} />
              <VField k={t('voucher.to')} v={bk.trip.route.toBranch.name} />
            </>
          )}
          <VAmount
            label={t('voucher.amount')}
            value={usd(bk.priceCents)}
            sub={[
              bk.discountCents > 0 ? `${t('booking.discount')} ${usd(bk.discountCents)}` : '',
              ...income.map((p) => `${t(`method.${p.method}`)}${p.method !== 'CASH' ? ' ✓' : ''} ${money(p.amount, p.currency)}${p.reference ? ` · ${p.reference}` : ''}`),
            ].filter(Boolean).join(' · ')}
          />
          <VFooter qr={bk.receiptNo} signLabel={t('voucher.signature')} extra={<p className="text-[9px] leading-tight">{dateTime(bk.createdAt)} · {c.passengerRules.map((r, i) => `${i + 1}. ${r}`).join(' ')}</p>} />
          <p className="mt-1 text-center text-[10px] font-bold">{c.receiptFooter}</p>
        </Voucher>
      )}
    </PrintShell>
  );
}
