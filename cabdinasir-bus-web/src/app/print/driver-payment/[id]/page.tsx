'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useBootstrap } from '@/lib/queries';
import { dateTime, money, phone, usd } from '@/lib/format';
import type { Currency, Method } from '@/lib/types';
import { PrintShell, VAmount, VField, VFooter, Voucher } from '@/components/print';

interface DriverVoucher {
  id: string; kind: 'ADVANCE' | 'PAYOUT' | 'DEDUCTION'; amountCents: number; note: string | null; createdAt: string; voided: boolean; voidReason: string | null;
  driver: { id: string; name: string; phone: string }; branchId: string | null; method: Method | null; currency: Currency; paidAmount: number | null; reference: string | null; createdBy: string | null;
  earnedTotalCents: number; paidTotalCents: number; balanceBeforeCents: number; balanceAfterCents: number;
}

/** Rasiidka bixinta darawalka: inta la siiyay + wadarta kasbashada / bixinta + inta weli lagu leeyahay. Laba saxeex. */
export default function DriverPaymentPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const { user } = useAuth();
  const boot = useBootstrap();
  const q = useQuery({ queryKey: ['print', 'driver-payment', id], queryFn: () => api<DriverVoucher>(`/driver-pay/payments/${id}/voucher`), enabled: !!user, staleTime: Infinity });
  const v = q.data;
  const c = boot.data?.company;
  const branch = boot.data?.branches.find((b) => b.id === (v?.branchId ?? user?.branchId));
  const owed = v ? v.balanceAfterCents : 0;

  return (
    <PrintShell ready={!!v && !!c}>
      {v && c && (
        <Voucher title={t('voucher.payment')} no={v.id.slice(0, 8).toUpperCase()} company={c} phones={branch?.phones}>
          {v.voided && <p className="text-center text-base font-black">✕ {t('voucher.voided')} — {v.voidReason}</p>}
          <VField k={t('voucher.date')} v={dateTime(v.createdAt)} />
          <VField k={t('voucher.driver')} v={v.driver.name} big />
          <VField k={t('voucher.phone')} v={phone(v.driver.phone)} />
          <VField k={t('voucher.kind')} v={t(`books.pk.${v.kind}`)} />
          {v.note && <VField k={t('voucher.note')} v={v.note} />}
          <VAmount
            label={t(`books.pk.${v.kind}`)}
            value={usd(v.amountCents)}
            sub={v.method && v.paidAmount !== null ? `${t(`method.${v.method}`)} ${money(v.paidAmount, v.currency)}${v.reference ? ` · ${v.reference}` : ''}` : undefined}
          />
          <div className="mt-1 flex flex-col gap-0.5 text-[11px]">
            <VField k={t('voucher.earnedTotal')} v={usd(v.earnedTotalCents)} />
            <VField k={t('voucher.paidTotal')} v={usd(v.paidTotalCents)} />
            <VField k={t('voucher.before')} v={usd(v.balanceBeforeCents)} />
          </div>
          <div className="mt-1 flex items-center justify-between rounded bg-current/10 px-2 py-1">
            <span className="text-[11px] font-black uppercase">{owed >= 0 ? t('voucher.owed') : t('voucher.overpaid')}</span>
            <span className="text-lg font-black">{usd(Math.abs(owed))}</span>
          </div>
          {v.createdBy && <div className="mt-1"><VField k={t('voucher.cashier')} v={v.createdBy} /></div>}
          <VFooter signLabel={[t('voucher.driverSign'), t('voucher.cashierSign')]} />
          <p className="mt-1 text-center text-[10px] font-bold">{c.receiptFooter}</p>
        </Voucher>
      )}
    </PrintShell>
  );
}
