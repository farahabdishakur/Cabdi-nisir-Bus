'use client';

import { ReactNode, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Button, Spinner } from './ui';

/** Bogga daabacaadda: sug login + xogta, kadibna si toos ah u daabac (hal mar). */
export function PrintShell({ ready, children, autoPrint = true, error }: { ready: boolean; children: ReactNode; autoPrint?: boolean; error?: unknown }) {
  const { t, err } = useI18n();
  const { loading, user } = useAuth();
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    if (ready && autoPrint && !printed) {
      setPrinted(true);
      const h = setTimeout(() => window.print(), 400);
      return () => clearTimeout(h);
    }
  }, [ready, autoPrint, printed]);

  if (loading) return <div className="p-6"><Spinner /></div>;
  if (!user) return <p className="p-6">{t('errors.SESSION_REVOKED')}</p>;
  return (
    <div className="bg-white p-4">
      <div className="no-print mb-4 flex gap-2">
        <Button onClick={() => window.print()}>🖨 {t('common.print')}</Button>
        <Button variant="secondary" onClick={() => window.close()}>{t('common.close')}</Button>
      </div>
      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">{err(error)}</p> : ready ? children : <Spinner />}
    </div>
  );
}

export function Qr({ value, size = 96 }: { value: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 0, width: size * 2 }).then(setSrc).catch(() => setSrc(''));
  }, [value, size]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={value} width={size} height={size} /> : null;
}

export function Row({ k, v, bold }: { k: string; v: ReactNode; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{k}</span>
      <span className={bold ? 'font-bold' : ''}>{v}</span>
    </div>
  );
}

export const Hr = () => <div className="my-1 border-t border-dashed border-black" />;

/**
 * Rasiidka "Receipt Voucher" — qaabka warqadda shirkadda (sanduuq xariiq leh, magaca shirkadda far waaweyn,
 * taleefannada, kadibna meelo la buuxiyay). 72mm (thermal 80mm). Waa yar yahay oo habaysan.
 */
export function Voucher({ children, title, no, company, phones, copy }: { children: ReactNode; title: string; no?: string; company: { name: string; tagline?: string | null; logoUrl?: string | null }; phones?: string[]; copy?: string }) {
  return (
    <div className="voucher">
      <div className="text-center">
        {company.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={company.logoUrl} alt="" className="voucher-logo mx-auto mb-1 h-12 w-auto max-w-[40mm] object-contain" />
        )}
        <p className="voucher-brand">{company.name.toUpperCase()}</p>
        {company.tagline && <p className="voucher-tag">{company.tagline.toUpperCase()}</p>}
        {phones && phones.length > 0 && <p className="text-[10px] font-bold">Tel: {phones.join(' / ')}</p>}
        <p className="voucher-title">{title}</p>
        {no && <p className="font-mono text-[11px] font-bold">{no}</p>}
        {copy && <p className="text-[10px] italic">({copy})</p>}
      </div>
      <div className="mt-1.5 flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

/** "Magaca macmilka: ______" — summad + qiimaha xariiq hoose leh */
export function VField({ k, v, big }: { k: string; v: ReactNode; big?: boolean }) {
  return (
    <div className="flex items-end gap-1.5">
      <span className="shrink-0 text-[11px] font-bold">{k}:</span>
      <span className={`voucher-line ${big ? 'text-base font-black' : 'font-semibold'}`}>{v}</span>
    </div>
  );
}

/** Lacagta — sanduuq far waaweyn */
export function VAmount({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mt-1 flex items-center justify-between rounded border-2 border-current px-2 py-1">
      <span className="text-[11px] font-bold uppercase">{label}</span>
      <span className="text-right">
        <span className="block text-lg font-black leading-tight">{value}</span>
        {sub && <span className="block text-[10px]">{sub}</span>}
      </span>
    </div>
  );
}

/** Saxeexa + QR yar (dhinac) */
export function VFooter({ qr, signLabel, extra }: { qr?: string; signLabel: string | string[]; extra?: ReactNode }) {
  const labels = Array.isArray(signLabel) ? signLabel : [signLabel];
  return (
    <div className="mt-2 flex items-end gap-2">
      {qr && <Qr value={qr} size={52} />}
      <div className="flex flex-1 flex-col gap-2">
        {extra}
        {labels.map((l) => <VField key={l} k={l} v={' '} />)}
      </div>
    </div>
  );
}
