'use client';

import { useI18n } from '@/lib/i18n';
import { loadBootstrap, type OfflineItem } from '@/lib/offline';
import type { Bootstrap } from '@/lib/queries';
import { dateTime, phone, usd } from '@/lib/format';
import { Hr, Qr, Row } from './print';

/**
 * Rasiid OFFLINE (internet la'aan): koodh ku-meel-gaar ah + PIN + qiimaha (qiyaas) + label xabbad kasta.
 * Isla bogga ayaa lagu daabacaa (.print-area) — internet la'aan tab cusub lama furi karo.
 * Marka la sync-gareeyo koodhka dhabta ah (CB-…) ayaa SMS-ka qaataha loo diraa.
 */
export function OfflineReceipt({ item }: { item: OfflineItem }) {
  const { t } = useI18n();
  const c = loadBootstrap<Bootstrap>()?.company;
  const code = item.trackingCode ?? `OFFLINE-${item.idempotencyKey.slice(0, 8).toUpperCase()}`;
  return (
    <div className="print-area hidden print:block">
      <div className="receipt">
        <p className="text-center text-base font-bold">{c?.name ?? 'Cabdinasir Bus'}</p>
        <Hr />
        <p className="text-center text-lg font-bold">📦 {code}</p>
        {!item.trackingCode && <p className="text-center font-bold">📴 OFFLINE — {t('offline.receiptNote')}</p>}
        <Hr />
        <Row k={t('parcel.to')} v={item.toBranchName} bold />
        <Row k={t('parcel.sender')} v={`${item.parcel.senderName} ${phone(item.parcel.senderPhone)}`} />
        <Row k={t('parcel.receiver')} v={`${item.parcel.receiverName} ${phone(item.parcel.receiverPhone)}`} />
        <Row k={t('parcel.pieces')} v={`${item.parcel.pieces}× · ${item.parcel.weightKg} kg${item.parcel.isFragile ? ' · ⚠️' : ''}`} />
        <Row k={t('common.total')} v={`≈ ${usd(item.estimateCents)}`} bold />
        <Row k={t('parcel.payer')} v={item.parcel.payer === 'SENDER' ? t('parcel.payerSender') : t('parcel.payerReceiver')} />
        {item.parcel.payment?.reference && <Row k={t('payment.reference')} v={item.parcel.payment.reference} />}
        <Hr />
        <p className="text-center">{t('parcel.pin')}</p>
        <p className="text-center text-2xl font-bold tracking-widest">{item.pickupPin}</p>
        <Row k={t('common.date')} v={dateTime(item.offlineCreatedAt)} />
        <Hr />
        <div className="flex justify-center py-1"><Qr value={code} /></div>
        {c && <p className="text-[10px]">{c.parcelRules.map((r, i) => `${i + 1}. ${r}`).join(' ')}</p>}
      </div>
      {Array.from({ length: item.parcel.pieces }, (_, i) => (
        <div key={i} className="receipt mt-4 border border-black p-2" style={{ breakBefore: 'page' }}>
          <p className="text-2xl font-black leading-tight">{item.toBranchName.toUpperCase()}</p>
          <p className="font-bold">{code}</p>
          <p>{i + 1}/{item.parcel.pieces}{item.parcel.isFragile ? ' · ⚠️ FRAGILE' : ''}</p>
          <p className="mt-1 font-bold">{item.parcel.receiverName} · {phone(item.parcel.receiverPhone)}</p>
        </div>
      ))}
    </div>
  );
}
