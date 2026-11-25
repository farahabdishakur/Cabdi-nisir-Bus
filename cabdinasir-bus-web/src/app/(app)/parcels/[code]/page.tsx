'use client';

import { use, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { can, isManager } from '@/lib/permissions';
import { dateTime, phone, usd } from '@/lib/format';
import type { Parcel, ParcelClaim } from '@/lib/types';
import { Alert, Button, Card, Checkbox, Field, Input, Loading, PageHeader } from '@/components/ui';
import { PaidVia, ParcelStatusBadge, ReasonModal } from '@/components/domain';
import { EvidencePanel } from '@/components/evidence';
import { ClaimStatusBadge, OpenClaimModal } from '@/components/claims';

export default function ParcelPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const { t, err } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const q = useQuery({ queryKey: ['parcels', 'one', code], queryFn: () => api<Parcel>(`/parcels/${encodeURIComponent(code)}`) });
  const [modal, setModal] = useState<'' | 'void' | 'request' | 'missing' | 'damaged' | 'pin' | 'correct'>('');
  const [newPin, setNewPin] = useState('');
  const [refund, setRefund] = useState(true);
  const [fix, setFix] = useState({ receiverName: '', receiverPhone: '', senderName: '', senderPhone: '' });
  const [claimOpen, setClaimOpen] = useState(false);

  const p = q.data;
  useEffect(() => {
    if (p) setFix({ receiverName: p.receiverName, receiverPhone: p.receiverPhone, senderName: p.senderName, senderPhone: p.senderPhone });
  }, [p]);

  if (q.isLoading) return <Loading />;
  if (!p) return <Alert>{err(q.error)}</Alert>;
  const refresh = () => qc.invalidateQueries({ queryKey: ['parcels'] });
  const isFrom = user?.role === 'SUPER_ADMIN' || user?.branchId === p.fromBranchId;
  const closed = p.status === 'DELIVERED' || p.status === 'VOIDED';

  return (
    <div>
      <PageHeader
        title={p.trackingCode}
        actions={
          <>
            <Button variant="secondary" onClick={() => window.open(`/print/parcel/${p.id}?reprint=1`, '_blank')}>🖨 {t('common.print')}</Button>
            {!closed && (isManager(user) || (isFrom && ['REGISTERED', 'LOADED'].includes(p.status))) && <Button variant="secondary" onClick={() => setModal('correct')}>{t('booking.correct')}</Button>}
            {!closed && <Button variant="secondary" onClick={() => setModal('pin')}>{t('parcel.resetPin')}</Button>}
            {p.status === 'REGISTERED' && isFrom && (can(user, 'void')
              ? <Button variant="danger" onClick={() => setModal('void')}>{t('booking.void')}</Button>
              : <Button variant="secondary" onClick={() => setModal('request')}>{t('booking.requestVoid')}</Button>)}
            {can(user, 'markParcel') && ['IN_TRANSIT', 'ARRIVED'].includes(p.status) && (
              <>
                <Button variant="secondary" onClick={() => setModal('missing')}>{t('parcel.markMissing')}</Button>
                <Button variant="secondary" onClick={() => setModal('damaged')}>{t('parcel.markDamaged')}</Button>
              </>
            )}
          </>
        }
      />
      {newPin && <div className="mb-3"><Alert tone="yellow">{t('parcel.newPin', { pin: newPin })}</Alert></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2">{p.fromBranch.name} → {p.toBranch.name} <ParcelStatusBadge s={p.status} /></span>}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-500">{t('parcel.sender')}</dt><dd>{p.senderName} · {phone(p.senderPhone)}</dd>
            <dt className="text-gray-500">{t('parcel.receiver')}</dt><dd>{p.receiverName} · {phone(p.receiverPhone)}</dd>
            <dt className="text-gray-500">{t('parcel.category')}</dt><dd>{p.category.nameSo}</dd>
            <dt className="text-gray-500">{t('parcel.pieces')}</dt><dd>{p.pieces}× · {String(p.weightKg)} kg{p.isFragile ? ' · ⚠️' : ''}</dd>
            {p.description && (<><dt className="text-gray-500">{t('parcel.description')}</dt><dd>{p.description}</dd></>)}
            <dt className="text-gray-500">{t('parcel.fee')}</dt><dd className="font-bold">{usd(p.feeCents)} {p.payer === 'RECEIVER' && !p.paidAt && <span className="text-amber-700">COD</span>}</dd>
            {(p.storageFeeCents ?? 0) > 0 && (<><dt className="text-gray-500">{t('parcel.storageFee')}</dt><dd className="font-bold text-amber-700">{usd(p.storageFeeCents)}</dd></>)}
            <dt className="text-gray-500">{t('payment.paidVia')}</dt><dd><PaidVia payments={p.payments} /></dd>
            {p.trip && (<><dt className="text-gray-500">{t('trips.vehicle')}</dt><dd>{p.trip.vehicle.plate} · {dateTime(p.trip.departureAt)}</dd></>)}
            {p.deliveredAt && (<><dt className="text-gray-500">{t('parcel.receivedBy')}</dt><dd>{p.deliveredToName} · {dateTime(p.deliveredAt)}</dd></>)}
            <dt className="text-gray-500">{t('booking.receipt')}</dt><dd className="font-mono">{p.receiptNo}</dd>
          </dl>
        </Card>
        <Card title={t('parcel.history')}>
          <ol className="relative border-l-2 border-gray-200 pl-4">
            {p.history?.map((h) => (
              <li key={h.id} className="mb-3">
                <span className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full bg-navy" />
                <p className="text-sm font-semibold">{t(`parcelStatus.${h.toStatus}`)}</p>
                <p className="text-xs text-gray-500">{dateTime(h.createdAt)}{h.note ? ` · ${h.note}` : ''}</p>
              </li>
            ))}
          </ol>
        </Card>
        <Card title={`📷 ${t('evidence.title')}`} className="lg:col-span-2">
          <EvidencePanel parcel={p} />
        </Card>
        <Card title={`⚖️ ${t('claims.title')}`} className="lg:col-span-2" actions={p.status !== 'VOIDED' && <Button size="sm" variant="secondary" onClick={() => setClaimOpen(true)}>+ {t('claims.new')}</Button>}>
          <ParcelClaims parcelId={p.id} />
        </Card>
      </div>

      <OpenClaimModal parcel={p} open={claimOpen} onClose={() => setClaimOpen(false)} onDone={(c) => router.push(`/claims/${c.id}`)} />
      <ReasonModal open={modal === 'void'} title={t('booking.void')} danger onClose={() => setModal('')} onSubmit={async (reason) => { await api(`/parcels/${p.id}/void`, { method: 'POST', body: { reason, refund } }); refresh(); }}>
        <Checkbox label={t('booking.refund')} checked={refund} onChange={setRefund} />
      </ReasonModal>
      <ReasonModal open={modal === 'request'} title={t('booking.requestVoid')} onClose={() => setModal('')} onSubmit={async (reason) => { await api('/void-requests', { method: 'POST', body: { entity: 'PARCEL', entityId: p.id, reason, refund } }); }}>
        <Checkbox label={t('booking.refund')} checked={refund} onChange={setRefund} />
      </ReasonModal>
      <ReasonModal open={modal === 'missing'} title={t('parcel.markMissing')} danger onClose={() => setModal('')} onSubmit={async (note) => { await api(`/parcels/${p.id}/mark-missing`, { method: 'POST', body: { note } }); refresh(); }} />
      <ReasonModal open={modal === 'damaged'} title={t('parcel.markDamaged')} danger onClose={() => setModal('')} onSubmit={async (note) => { await api(`/parcels/${p.id}/mark-damaged`, { method: 'POST', body: { note } }); refresh(); }} />
      <ReasonModal open={modal === 'pin'} title={t('parcel.resetPin')} onClose={() => setModal('')} onSubmit={async (note) => { const r = await api<{ pickupPin: string }>(`/parcels/${p.id}/reset-pin`, { method: 'POST', body: { note } }); setNewPin(r.pickupPin); refresh(); }}>
        <Alert tone="yellow">{t('parcel.resetPinConfirm')}</Alert>
      </ReasonModal>
      <ReasonModal open={modal === 'correct'} title={t('booking.correct')} onClose={() => setModal('')} onSubmit={async (reason) => { await api(`/parcels/${p.id}`, { method: 'PATCH', body: { ...fix, reason } }); refresh(); }}>
        <div className="grid grid-cols-2 gap-2">
          <Field label={`${t('parcel.receiver')} — ${t('common.name')}`}>{(id) => <Input id={id} value={fix.receiverName} onChange={(e) => setFix({ ...fix, receiverName: e.target.value })} />}</Field>
          <Field label={t('common.phone')}>{(id) => <Input id={id} value={fix.receiverPhone} onChange={(e) => setFix({ ...fix, receiverPhone: e.target.value })} />}</Field>
          <Field label={`${t('parcel.sender')} — ${t('common.name')}`}>{(id) => <Input id={id} value={fix.senderName} onChange={(e) => setFix({ ...fix, senderName: e.target.value })} />}</Field>
          <Field label={t('common.phone')}>{(id) => <Input id={id} value={fix.senderPhone} onChange={(e) => setFix({ ...fix, senderPhone: e.target.value })} />}</Field>
        </div>
      </ReasonModal>
    </div>
  );
}

function ParcelClaims({ parcelId }: { parcelId: string }) {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['claims', 'parcel', parcelId], queryFn: () => api<{ data: ParcelClaim[] }>('/claims', { query: { parcelId, limit: 50 } }) });
  const list = q.data?.data ?? [];
  if (!list.length) return <p className="text-sm text-gray-500">{t('claims.noneForParcel')}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {list.map((c) => (
        <li key={c.id}>
          <Link href={`/claims/${c.id}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-2 text-sm hover:bg-gray-50">
            <span className="font-mono font-semibold">{c.claimNo}</span>
            <ClaimStatusBadge s={c.status} />
            <span>{t(`claims.types.${c.type}`)}</span>
            <span className="text-gray-500">· {dateTime(c.createdAt)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
