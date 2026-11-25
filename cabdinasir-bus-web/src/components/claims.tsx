'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { parseUsd } from '@/lib/format';
import type { ClaimStatus, ClaimType, ParcelClaim } from '@/lib/types';
import { Alert, Badge, Button, Field, Input, Modal, Select, Textarea } from './ui';

export const CLAIM_TYPES: ClaimType[] = ['DAMAGED', 'MISSING', 'INCOMPLETE', 'WRONG_ITEM', 'LATE', 'OTHER'];

export function ClaimStatusBadge({ s }: { s: ClaimStatus }) {
  const { t } = useI18n();
  return <Badge tone={s === 'OPEN' ? 'yellow' : s === 'ACCEPTED' ? 'green' : 'red'}>{t(`claims.status.${s}`)}</Badge>;
}

/** Cabasho cusub: macmiilka (diraha ama qaataha) ayaa sheegaya — caddaynta ayaa lagu go'aamiyaa */
export function OpenClaimModal({ parcel, open, onClose, onDone }: { parcel: { id: string; receiverName: string; receiverPhone: string }; open: boolean; onClose: () => void; onDone: (c: ParcelClaim) => void }) {
  const { t, err } = useI18n();
  const qc = useQueryClient();
  const [f, setF] = useState({ type: 'DAMAGED' as ClaimType, description: '', claimantName: '', claimantPhone: '', amount: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setF({ type: 'DAMAGED', description: '', claimantName: parcel.receiverName, claimantPhone: parcel.receiverPhone, amount: '' });
      setError('');
    }
  }, [open, parcel.receiverName, parcel.receiverPhone]);
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const c = await api<ParcelClaim>(`/parcels/${parcel.id}/claims`, {
        method: 'POST',
        body: { type: f.type, description: f.description, claimantName: f.claimantName, claimantPhone: f.claimantPhone, claimedAmountCents: f.amount ? parseUsd(f.amount) ?? undefined : undefined },
      });
      qc.invalidateQueries({ queryKey: ['claims'] });
      onDone(c);
      onClose();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('claims.new')}>
      <div className="flex flex-col gap-3">
        <Alert tone="blue">{t('claims.newHint')}</Alert>
        <Field label={t('claims.type')} required>{(id) => (
          <Select id={id} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as ClaimType })}>
            {CLAIM_TYPES.map((x) => <option key={x} value={x}>{t(`claims.types.${x}`)}</option>)}
          </Select>
        )}</Field>
        <Field label={t('claims.description')} required>{(id) => <Textarea id={id} rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('claims.claimant')} required>{(id) => <Input id={id} value={f.claimantName} onChange={(e) => setF({ ...f, claimantName: e.target.value })} />}</Field>
          <Field label={t('common.phone')} required>{(id) => <Input id={id} inputMode="tel" value={f.claimantPhone} onChange={(e) => setF({ ...f, claimantPhone: e.target.value })} />}</Field>
        </div>
        <Field label={t('claims.claimedAmount')} hint={t('common.optional')}>{(id) => <Input id={id} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0.00" />}</Field>
        {error && <Alert>{error}</Alert>}
        <Button onClick={save} loading={busy} disabled={f.description.trim().length < 5 || f.claimantName.trim().length < 2 || !f.claimantPhone}>{t('claims.open')}</Button>
      </div>
    </Modal>
  );
}
