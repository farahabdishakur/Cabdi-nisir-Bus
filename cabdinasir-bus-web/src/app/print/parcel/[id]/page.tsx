'use client';

import { use, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useBootstrap } from '@/lib/queries';
import { dateTime, money, phone, usd } from '@/lib/format';
import type { Parcel } from '@/lib/types';
import { PrintShell, Qr, VAmount, VField, VFooter, Voucher } from '@/components/print';
import { usePriceLabel } from '@/components/domain';

/**
 * Rasiidka alaabta (80mm) + label/sticker xabbad kasta (QR + laanta loo dirayo far waaweyn).
 * PIN-ka kaliya marka la diiwaangeliyo (sessionStorage — tab-kan) — dib u daabac PIN ma muujiyo.
 */
export default function ParcelPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const { user } = useAuth();
  const boot = useBootstrap();
  // ?reprint=1 → dib u daabac: waa la tiriyaa + audit (rasiid nuqul ah khiyaano looguma isticmaali karo)
  const [mode, setMode] = useState<'first' | 'reprint' | null>(null);
  useEffect(() => setMode(new URLSearchParams(window.location.search).get('reprint') ? 'reprint' : 'first'), []);
  const q = useQuery({
    queryKey: ['print', 'parcel', id, mode],
    queryFn: () => (mode === 'reprint' ? api<Parcel>(`/parcels/${id}/reprint`, { method: 'POST' }) : api<Parcel>(`/parcels/${id}`)),
    enabled: !!user && !!mode,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false, // dib u daabac hal mar oo keliya ha la tiriyo
  });
  const [pin, setPin] = useState<string | null>(null);
  const priceLabel = usePriceLabel();
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
          <Voucher title={t('voucher.parcel')} no={p.trackingCode} company={c} phones={from?.phones} copy={p.printCount > 0 ? t('voucher.copy', { n: p.printCount }) : undefined}>
            <div className="my-1">
              <p className="text-[15px] font-black leading-tight">{(from?.city ?? '').toUpperCase()} → {p.toBranch.name.toUpperCase()}</p>
              <p className="text-[10px]">{t('booking.receipt')} {p.receiptNo}</p>
            </div>
            <VField k={t('voucher.date')} v={dateTime(p.offlineCreatedAt ?? p.createdAt)} />
            <VField k={t('voucher.sender')} v={`${p.senderName} · ${phone(p.senderPhone)}`} />
            <VField k={t('voucher.receiver')} v={`${p.receiverName} · ${phone(p.receiverPhone)}`} />
            <VField k={t('voucher.goods')} v={`${p.category.nameSo} · ${p.pieces}× · ${String(p.weightKg)} kg${p.isFragile ? ' · ⚠️' : ''}`} />
            {p.declaredValueCents ? <VField k={t('parcel.declared')} v={usd(p.declaredValueCents)} /> : null}
            {p.status === 'DELIVERED' && <VField k={t('parcel.receivedBy')} v={`${p.deliveredToName} ${dateTime(p.deliveredAt)}`} />}
            <VAmount
              label={t('voucher.amount')}
              value={usd(p.feeCents)}
              sub={cod ? `COD — ${t('voucher.cod')}` : income.map((x) => `${t(`method.${x.method}`)}${x.method !== 'CASH' ? ' ✓' : ''} ${money(x.amount, x.currency)}${x.reference ? ` · ${x.reference}` : ''}`).join(' · ')}
            />
            {p.priceBreakdown.lines.length > 1 && (
              <p className="text-[9px] leading-tight">{p.priceBreakdown.lines.map((l) => `${priceLabel(l.label)} ${usd(l.cents)}`).join(' · ')}</p>
            )}
            {pin && (
              <div className="mt-1 rounded border border-dashed border-current py-0.5 text-center">
                <span className="text-[10px] font-bold">{t('voucher.pin')}</span>
                <span className="ml-2 text-xl font-black tracking-[0.3em]">{pin}</span>
              </div>
            )}
            <VFooter
              qr={`${typeof window !== 'undefined' ? window.location.origin : ''}/track?code=${p.trackingCode}`}
              signLabel={t('voucher.signature')}
              extra={<p className="text-[9px] leading-tight"><b>{t('voucher.track')}: /track</b> · {c.parcelRules.map((r, i) => `${i + 1}. ${r}`).join(' ')}</p>}
            />
            <p className="mt-1 text-center text-[10px] font-bold">{c.receiptFooter}</p>
          </Voucher>

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
