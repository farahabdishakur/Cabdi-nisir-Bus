'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useBootstrap } from '@/lib/queries';
import { date, money, phone, time, usd } from '@/lib/format';
import type { Booking } from '@/lib/types';
import { Button, Field, Input, Modal } from './ui';

/**
 * Tigidhka warqadda (gacanta lagu qoro): kombiyuutarka xogta buuxda ayuu hayaa; karraanigu warqadda wuxuu ku qoraa
 * xogta kooban — isla kala horreynta warqadda (Taariikh, Magac, Taleefan, Ka, Ku, Gaadhi, Waqti, Kursi, Lacag).
 */
type Listener = (b: Booking | null) => void;
let listener: Listener | null = null;
export function showPaperCopy(b: Booking) {
  listener?.(b);
}

/** Dejinta: 0 printer · 1 warqad (lambar waajib) · 2 labadaba (lambar ikhtiyaari) */
export function useTicketMode() {
  const boot = useBootstrap();
  return boot.data?.settings.ticketMode ?? 1;
}

/** Lambarka tigidhka warqadda (buugga) — iibka iyo bixinta ballanta */
export function PaperNoField({ value, onChange, required }: { value: string; onChange: (v: string) => void; required: boolean }) {
  const { t } = useI18n();
  return (
    <Field label={t('paper.no')} hint={t('paper.noHint')} required={required}>
      {(id) => <Input id={id} value={value} onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} placeholder="BO1-1001" className="font-mono text-lg font-bold tracking-wider" autoComplete="off" />}
    </Field>
  );
}

function Line({ k, v, big }: { k: string; v: React.ReactNode; big?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-gray-300 py-1.5">
      <span className="text-sm text-gray-600">{k}</span>
      <span className={big ? 'text-2xl font-black text-navy' : 'text-base font-bold'}>{v}</span>
    </div>
  );
}

export function PaperCopyHost() {
  const { t } = useI18n();
  const [b, setB] = useState<Booking | null>(null);
  useEffect(() => {
    listener = setB;
    return () => {
      listener = null;
    };
  }, []);
  if (!b) return null;
  const paid = b.payments.filter((p) => p.amount > 0);
  return (
    <Modal open onClose={() => setB(null)} title={`✍️ ${t('paper.copyTitle')}`}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-600">{t('paper.copyHint')}</p>
        <div className="rounded-xl border-2 border-navy p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-gray-500">{t('paper.no')}</span>
            <span className="font-mono text-xl font-black text-red-700">{b.paperTicketNo ?? '—'}</span>
          </div>
          <Line k={t('voucher.date')} v={date(b.trip?.departureAt ?? b.createdAt)} />
          <Line k={t('voucher.customer')} v={b.passengerName} />
          <Line k={t('voucher.phone')} v={phone(b.passengerPhone)} />
          {b.trip && (
            <>
              <Line k={t('voucher.from')} v={b.trip.route.fromBranch.name} />
              <Line k={t('voucher.to')} v={b.trip.route.toBranch.name} />
              <Line k={t('voucher.vehicle')} v={<span className="font-mono">{b.trip.vehicle.plate}</span>} />
              <Line k={t('voucher.time')} v={time(b.trip.departureAt)} />
            </>
          )}
          <Line k={t('voucher.seat')} v={b.seatNo} big />
          <Line k={t('voucher.amount')} v={<>{usd(b.priceCents)}{paid.length > 0 && <span className="ml-1 text-xs font-semibold text-gray-500">({paid.map((p) => `${t(`method.${p.method}`)} ${money(p.amount, p.currency)}`).join(', ')})</span>}</>} />
        </div>
        <div className="flex gap-2">
          {!b.id.startsWith('offline:') && <Button variant="secondary" onClick={() => window.open(`/print/ticket/${b.id}`, '_blank')}>🖨 {t('paper.printAnyway')}</Button>}
          <Button className="flex-1" size="lg" variant="success" onClick={() => setB(null)}>✓ {t('paper.done')}</Button>
        </div>
      </div>
    </Modal>
  );
}
