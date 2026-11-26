'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { parseInteger, parseUsd } from '@/lib/format';
import { Alert, Button, Input } from './ui';

/**
 * Sanduuqa (khasnadda) oo xiran → isla meeshii iibka ayaa laga furaa (lacagta bilowga ah: ikhtiyaari, default 0).
 * Server-ka ayaa go'aamiya (hal sanduuq furan karraani kasta).
 */
export function QuickOpenSession() {
  const { t, err } = useI18n();
  const qc = useQueryClient();
  const [usd, setUsd] = useState('');
  const [slsh, setSlsh] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/cash-sessions/open', { method: 'POST', body: { openingUsdCents: parseUsd(usd || '0') ?? 0, openingSlsh: parseInteger(slsh || '0') ?? 0 } });
      await qc.invalidateQueries({ queryKey: ['cash'] });
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
      <p className="text-sm font-semibold text-amber-900">💵 {t('quickSession.title')}</p>
      <p className="text-xs text-amber-800">{t('quickSession.hint')}</p>
      <div className="grid grid-cols-2 gap-2">
        <Input inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} placeholder={t('quickSession.usd')} aria-label={t('quickSession.usd')} />
        <Input inputMode="numeric" value={slsh} onChange={(e) => setSlsh(e.target.value)} placeholder={t('quickSession.slsh')} aria-label={t('quickSession.slsh')} />
      </div>
      {error && <Alert>{error}</Alert>}
      <Button type="button" variant="success" loading={busy} onClick={open}>🔓 {t('quickSession.open')}</Button>
    </div>
  );
}
