'use client';

import { useI18n } from '@/lib/i18n';
import { loadBootstrap, type OfflineItem } from '@/lib/offline';
import type { Bootstrap } from '@/lib/queries';
import { dateTime, phone, usd } from '@/lib/format';
import { VAmount, VField, VFooter, Voucher } from './print';

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
      <Voucher title={t('voucher.parcel')} no={code} company={c ?? { name: 'Cabdinasir Bus' }}>
        {!item.trackingCode && <p className="text-center text-[11px] font-black">📴 OFFLINE — {t('offline.receiptNote')}</p>}
        <VField k={t('voucher.date')} v={dateTime(item.offlineCreatedAt)} />
        <VField k={t('voucher.to')} v={item.toBranchName} big />
        <VField k={t('voucher.sender')} v={`${item.parcel.senderName} · ${phone(item.parcel.senderPhone)}`} />
        <VField k={t('voucher.receiver')} v={`${item.parcel.receiverName} · ${phone(item.parcel.receiverPhone)}`} />
        <VField k={t('voucher.goods')} v={`${item.parcel.pieces}× · ${item.parcel.weightKg} kg${item.parcel.isFragile ? ' · ⚠️' : ''}`} />
        <VAmount
          label={t('voucher.amount')}
          value={`≈ ${usd(item.estimateCents)}`}
          sub={[item.parcel.payer === 'SENDER' ? t('parcel.payerSender') : `COD — ${t('voucher.cod')}`, item.parcel.payment?.reference].filter(Boolean).join(' · ')}
        />
        <div className="mt-1 rounded border border-dashed border-current py-0.5 text-center">
          <span className="text-[10px] font-bold">{t('voucher.pin')}</span>
          <span className="ml-2 text-xl font-black tracking-[0.3em]">{item.pickupPin}</span>
        </div>
        <VFooter qr={code} signLabel={t('voucher.signature')} extra={c && <p className="text-[9px] leading-tight">{c.parcelRules.map((r, i) => `${i + 1}. ${r}`).join(' ')}</p>} />
      </Voucher>
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
