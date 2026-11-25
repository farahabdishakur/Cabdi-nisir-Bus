'use client';

import { use, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useBootstrap } from '@/lib/queries';
import { dateTime, money, phone, usd } from '@/lib/format';
import type { Parcel } from '@/lib/types';
import { Hr, PrintShell, Qr, Row } from '@/components/print';

/**
 * Rasiidka alaabta (80mm) + label/sticker xabbad kasta (QR + laanta loo dirayo far waaweyn).
 * PIN-ka kaliya marka la diiwaangeliyo (sessionStorage — tab-kan) — dib u daabac PIN ma muujiyo.
 */
export default function ParcelPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const { user } = useAuth();
  const boot = useBootstrap();
  const q = useQuery({ queryKey: ['print', 'parcel', id], queryFn: () => api<Parcel>(`/parcels/${id}`), enabled: !!user });
  const [pin, setPin] = useState<string | null>(null);
  useEffect(() => {
    try {
      const v = sessionStorage.getItem(`pin:${id}`);
      if (v) {
        setPin(v);
        sessionStorage.removeItem(`pin:${id}`);
      }
    } catch {
      /* ignore */
    }
  }, [id]);

  const p = q.data;
  const c = boot.data?.company;
  const from = boot.data?.branches.find((b) => b.id === p?.fromBranchId);
  const income = p?.payments.filter((x) => x.amount > 0) ?? [];
  const cod = p && p.payer === 'RECEIVER' && !p.paidAt;

  return (
    <PrintShell ready={!!p && !!c}>
      {p && c && (
        <>
          <div className="receipt">
            <p className="text-center text-base font-bold">{c.name}</p>
            <p className="text-center">{from?.name} · {from?.phones.join(' / ')}</p>
            <Hr />
            <p className="text-center text-lg font-bold">📦 {p.trackingCode}</p>
            <p className="text-center">{t('booking.receipt')} {p.receiptNo}</p>
            <Hr />
            <Row k={t('parcel.to')} v={p.toBranch.name} bold />
            <Row k={t('parcel.sender')} v={`${p.senderName} ${phone(p.senderPhone)}`} />
            <Row k={t('parcel.receiver')} v={`${p.receiverName} ${phone(p.receiverPhone)}`} />
            <Row k={t('parcel.category')} v={p.category.nameSo} />
            <Row k={t('parcel.pieces')} v={`${p.pieces}× · ${String(p.weightKg)} kg${p.isFragile ? ' · ⚠️' : ''}`} />
            {p.declaredValueCents ? <Row k={t('parcel.declared')} v={usd(p.declaredValueCents)} /> : null}
            <Hr />
            {p.priceBreakdown.lines.map((l) => <Row key={l.label} k={l.label} v={usd(l.cents)} />)}
            <Row k={t('common.total')} v={usd(p.feeCents)} bold />
            {cod ? <p className="text-center text-sm font-bold">COD — {t('parcel.payerReceiver')}</p> : income.map((x) => (
              <div key={x.id}>
                <Row k={`${t(`method.${x.method}`)}${x.method !== 'CASH' ? ' ✓' : ''}`} v={money(x.amount, x.currency)} />
                {x.reference && <Row k={t('payment.reference')} v={x.reference} />}
              </div>
            ))}
            {p.status === 'DELIVERED' && <Row k={t('parcel.receivedBy')} v={`${p.deliveredToName} ${dateTime(p.deliveredAt)}`} />}
            {pin && (
              <>
                <Hr />
                <p className="text-center">{t('parcel.pin')}</p>
                <p className="text-center text-2xl font-bold tracking-widest">{pin}</p>
              </>
            )}
            <Row k={t('common.date')} v={dateTime(p.offlineCreatedAt ?? p.createdAt)} />
            <Hr />
            <div className="flex justify-center py-1"><Qr value={p.trackingCode} /></div>
            <p className="text-[10px]">{c.parcelRules.map((r, i) => `${i + 1}. ${r}`).join(' ')}</p>
            <p className="text-center">{c.receiptFooter}</p>
          </div>

          {/* label xabbad kasta */}
          {Array.from({ length: p.pieces }, (_, i) => (
            <div key={i} className="receipt mt-4 border border-black p-2" style={{ breakBefore: 'page' }}>
              <div className="flex items-center gap-2">
                <Qr value={p.trackingCode} size={80} />
                <div>
                  <p className="text-2xl font-black leading-tight">{p.toBranch.name.toUpperCase()}</p>
                  <p className="font-bold">{p.trackingCode}</p>
                  <p>{i + 1}/{p.pieces}{p.isFragile ? ' · ⚠️ FRAGILE' : ''}</p>
                </div>
              </div>
              <p className="mt-1 font-bold">{p.receiverName} · {phone(p.receiverPhone)}</p>
              {cod && <p className="font-bold">COD {usd(p.feeCents)}</p>}
            </div>
          ))}
        </>
      )}
    </PrintShell>
  );
}
