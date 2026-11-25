'use client';

import { ReactNode, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Button, Spinner } from './ui';

/** Bogga daabacaadda: sug login + xogta, kadibna si toos ah u daabac (hal mar). */
export function PrintShell({ ready, children, autoPrint = true }: { ready: boolean; children: ReactNode; autoPrint?: boolean }) {
  const { t } = useI18n();
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
      {ready ? children : <Spinner />}
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
