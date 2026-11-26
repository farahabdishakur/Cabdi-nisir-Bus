'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { dateTime } from '@/lib/format';
import { Alert, Badge, Button, Field, Modal, Textarea } from './ui';

/** Xaaladda: firfircoon ama 🚫 la xannibay + sababta (BUSINESS_RULES §33) */
export function BlockStatus({ isActive, blockReason, blockedAt }: { isActive: boolean; blockReason?: string | null; blockedAt?: string | null }) {
  const { t } = useI18n();
  if (isActive) return <Badge tone="green">{t('common.active')}</Badge>;
  return (
    <div className="flex flex-col gap-0.5">
      <Badge tone="red">🚫 {t('block.blocked')}</Badge>
      {blockReason && <span className="max-w-48 whitespace-normal text-xs text-red-700">{blockReason}</span>}
      {blockedAt && <span className="text-[10px] text-gray-500">{dateTime(blockedAt)}</span>}
    </div>
  );
}

/** Badhanka xannib (sabab waajib) / fur — PATCH {isActive, blockReason} */
export function BlockButton({ name, isActive, endpoint, queryKeys }: { name: string; isActive: boolean; endpoint: string; queryKeys: string[][] }) {
  const { t, err } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = async (body: object) => {
    setBusy(true);
    setError('');
    try {
      await api(endpoint, { method: 'PATCH', body });
      queryKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      setOpen(false);
      setReason('');
    } catch (e) {
      setError(err(e));
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };
  if (!isActive) {
    return (
      <>
        <Button size="sm" variant="secondary" loading={busy} onClick={() => send({ isActive: true })}>🔓 {t('block.unblock')}</Button>
        {error && !open && <span className="text-xs text-red-700">{error}</span>}
        <Modal open={open} onClose={() => setOpen(false)} title={t('block.unblock')}><Alert>{error}</Alert></Modal>
      </>
    );
  }
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => { setOpen(true); setError(''); }}>🚫 {t('block.block')}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`🚫 ${t('block.block')}: ${name}`}>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void send({ isActive: false, blockReason: reason.trim() }); }}>
          <Alert tone="yellow">{t('block.hint')}</Alert>
          <Field label={t('block.reason')} required>{(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('block.reasonPh')} required minLength={3} maxLength={200} />}</Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" variant="danger" loading={busy} disabled={reason.trim().length < 3}>🚫 {t('block.confirm')}</Button>
        </form>
      </Modal>
    </>
  );
}
