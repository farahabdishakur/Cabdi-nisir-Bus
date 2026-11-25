'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { isManager } from '@/lib/permissions';
import { cx, dateTime, parseUsd, phone, usd } from '@/lib/format';
import type { ParcelClaim, ParcelMedia, ParcelStatus } from '@/lib/types';
import { Alert, Button, Card, Field, Input, Loading, PageHeader, Textarea } from '@/components/ui';
import { ErrorAlert, ParcelStatusBadge } from '@/components/domain';
import { ClaimStatusBadge } from '@/components/claims';
import { EvidenceCapture, EvidenceGallery } from '@/components/evidence';

interface ClaimFile extends ParcelClaim {
  parcel: {
    id: string; trackingCode: string; status: ParcelStatus; senderName: string; senderPhone: string; receiverName: string; receiverPhone: string;
    weightKg: string; pieces: number; isFragile: boolean; feeCents: number; declaredValueCents: number | null; deliveredToName: string | null; deliveredAt: string | null;
    category: { nameSo: string }; fromBranch: { name: string }; toBranch: { name: string };
    history: { id: string; toStatus: ParcelStatus; createdAt: string; note: string | null }[];
  };
  media: ParcelMedia[];
  checks: { registerMedia: boolean; loadMedia: boolean; arriveMedia: boolean; deliverMedia: boolean; deliveredWithPin: boolean; deliveredToName: string | null; fragileDeclared: boolean; declaredValueCents: number | null; claimAfterDeliveryHours: number | null };
}

/**
 * Faylka cabashada: maamuluhu wuxuu arkaa caddaynta oo dhan meel keliya —
 * sawirka markii la diiwaangeliyay (xaaladda alaabta), rar, gaadhay, dhiibid (qaataha oo haysta), PIN, waqtiga cabashada.
 */
export default function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, err } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['claims', 'one', id], queryFn: () => api<ClaimFile>(`/claims/${id}`) });
  const [decision, setDecision] = useState<'ACCEPTED' | 'REJECTED' | null>(null);
  const [resolution, setResolution] = useState('');
  const [comp, setComp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (q.error) return <ErrorAlert error={q.error} />;
  if (!q.data) return <Loading />;
  const c = q.data;
  const p = c.parcel;
  const ck = c.checks;
  const items: [string, boolean | null, string?][] = [
    [t('claims.check.register'), ck.registerMedia, t('claims.check.registerWhy')],
    [t('claims.check.load'), ck.loadMedia || null],
    [t('claims.check.arrive'), ck.arriveMedia || null],
    [t('claims.check.deliver'), ck.deliverMedia, t('claims.check.deliverWhy')],
    [t('claims.check.pin'), p.status === 'DELIVERED' ? ck.deliveredWithPin : null, ck.deliveredToName ? `${ck.deliveredToName} · ${dateTime(p.deliveredAt)}` : undefined],
    [t('claims.check.fragile'), ck.fragileDeclared || null],
  ];

  const resolve = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/claims/${id}/resolve`, { method: 'POST', body: { decision, resolution, compensationCents: decision === 'ACCEPTED' && comp ? parseUsd(comp) ?? undefined : undefined } });
      setDecision(null);
      qc.invalidateQueries({ queryKey: ['claims'] });
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title={`⚖️ ${c.claimNo}`} actions={<ClaimStatusBadge s={c.status} />} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t('claims.complaint')} className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-500">{t('claims.type')}</dt><dd className="font-semibold">{t(`claims.types.${c.type}`)}</dd>
            <dt className="text-gray-500">{t('claims.claimant')}</dt><dd>{c.claimantName} · {phone(c.claimantPhone)}</dd>
            <dt className="text-gray-500">{t('common.date')}</dt><dd>{dateTime(c.createdAt)}{ck.claimAfterDeliveryHours !== null && <span className="text-amber-700"> · {t('claims.afterDelivery', { h: ck.claimAfterDeliveryHours })}</span>}</dd>
            {c.claimedAmountCents ? <><dt className="text-gray-500">{t('claims.claimedAmount')}</dt><dd className="font-semibold">{usd(c.claimedAmountCents)}</dd></> : null}
            <dt className="col-span-2 text-gray-500">{t('claims.description')}</dt><dd className="col-span-2 whitespace-pre-wrap rounded-lg bg-gray-50 p-2">{c.description}</dd>
            {c.resolution && <><dt className="col-span-2 text-gray-500">{t('claims.decision')}</dt><dd className="col-span-2 rounded-lg bg-gray-50 p-2">{c.resolution}{c.compensationCents ? ` · ${t('claims.compensation')}: ${usd(c.compensationCents)}` : ''} <span className="text-xs text-gray-500">({dateTime(c.resolvedAt)})</span></dd></>}
          </dl>
        </Card>
        <Card title={t('claims.checks')}>
          <ul className="flex flex-col gap-2 text-sm">
            {items.map(([label, ok, sub]) => (
              <li key={label} className="flex gap-2">
                <span className={cx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white', ok === null ? 'bg-gray-300' : ok ? 'bg-emerald-600' : 'bg-red-600')}>{ok === null ? '–' : ok ? '✓' : '✕'}</span>
                <span>{label}{sub && <span className="block text-xs text-gray-500">{sub}</span>}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={<span className="flex items-center gap-2"><Link href={`/parcels/${p.trackingCode}`} className="font-mono text-navy underline">{p.trackingCode}</Link> <ParcelStatusBadge s={p.status} /></span>}>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-gray-500">{t('parcel.to')}</dt><dd>{p.fromBranch.name} → {p.toBranch.name}</dd>
            <dt className="text-gray-500">{t('parcel.sender')}</dt><dd>{p.senderName}</dd>
            <dt className="text-gray-500">{t('parcel.receiver')}</dt><dd>{p.receiverName}</dd>
            <dt className="text-gray-500">{t('parcel.category')}</dt><dd>{p.category.nameSo} · {p.pieces}× · {p.weightKg} kg</dd>
            <dt className="text-gray-500">{t('parcel.fee')}</dt><dd>{usd(p.feeCents)}</dd>
            <dt className="text-gray-500">{t('parcel.declared')}</dt><dd>{p.declaredValueCents ? usd(p.declaredValueCents) : '—'}</dd>
          </dl>
          <ol className="mt-3 border-l-2 border-gray-200 pl-3 text-xs">
            {p.history.map((h) => <li key={h.id} className="mb-1"><b>{t(`parcelStatus.${h.toStatus}`)}</b> · {dateTime(h.createdAt)}{h.note ? ` · ${h.note}` : ''}</li>)}
          </ol>
        </Card>
        <Card title={`📷 ${t('evidence.title')} (${c.media.length})`} className="lg:col-span-2">
          <div className="flex flex-col gap-3">
            <EvidenceGallery media={c.media} empty={t('claims.noEvidence')} />
            {c.status === 'OPEN' && (
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="mb-2 text-sm text-gray-600">{t('claims.addEvidence')}</p>
                <EvidenceCapture parcelId={p.id} trackingCode={p.trackingCode} stage="CLAIM" claimId={c.id} onDone={() => qc.invalidateQueries({ queryKey: ['claims', 'one', id] })} />
              </div>
            )}
          </div>
        </Card>

        {c.status === 'OPEN' && isManager(user) && (
          <Card title={t('claims.decide')} className="lg:col-span-3">
            {!decision ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="success" onClick={() => setDecision('ACCEPTED')}>✓ {t('claims.accept')}</Button>
                <Button variant="danger" onClick={() => setDecision('REJECTED')}>✕ {t('claims.reject')}</Button>
              </div>
            ) : (
              <div className="flex max-w-xl flex-col gap-3">
                <Alert tone={decision === 'ACCEPTED' ? 'green' : 'yellow'}>{decision === 'ACCEPTED' ? t('claims.acceptHint') : t('claims.rejectHint')}</Alert>
                <Field label={t('claims.decisionReason')} required>{(fid) => <Textarea id={fid} rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} />}</Field>
                {decision === 'ACCEPTED' && <Field label={t('claims.compensation')} hint={t('claims.compensationHint')}>{(fid) => <Input id={fid} inputMode="decimal" value={comp} onChange={(e) => setComp(e.target.value)} placeholder="0.00" />}</Field>}
                {error && <Alert>{error}</Alert>}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setDecision(null)}>{t('common.cancel')}</Button>
                  <Button variant={decision === 'ACCEPTED' ? 'success' : 'danger'} loading={busy} disabled={resolution.trim().length < 5} onClick={resolve}>{t('common.save')}</Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
