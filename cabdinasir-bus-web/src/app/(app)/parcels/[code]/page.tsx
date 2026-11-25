'use client';

import { use, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getAccessToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { can, isManager } from '@/lib/permissions';
import { dateTime, phone, usd } from '@/lib/format';
import type { Parcel } from '@/lib/types';
import { Alert, Button, Card, Checkbox, Field, Input, Loading, PageHeader } from '@/components/ui';
import { PaidVia, ParcelStatusBadge, ReasonModal } from '@/components/domain';

export default function ParcelPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const { t, err } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['parcels', 'one', code], queryFn: () => api<Parcel>(`/parcels/${encodeURIComponent(code)}`) });
  const [modal, setModal] = useState<'' | 'void' | 'request' | 'missing' | 'damaged' | 'pin' | 'correct'>('');
  const [newPin, setNewPin] = useState('');
  const [refund, setRefund] = useState(true);
  const [fix, setFix] = useState({ receiverName: '', receiverPhone: '', senderName: '', senderPhone: '' });
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState('');

  const p = q.data;
  useEffect(() => {
    if (p) setFix({ receiverName: p.receiverName, receiverPhone: p.receiverPhone, senderName: p.senderName, senderPhone: p.senderPhone });
  }, [p]);

  // sawirka: token-ka header-ka ayuu u baahan yahay → blob URL
  useEffect(() => {
    if (!p?.photoUrl) return;
    let url = '';
    fetch(`/api/v1/parcels/${p.id}/photo`, { headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (b) {
          url = URL.createObjectURL(b);
          setPhoto(url);
        }
      })
      .catch(() => undefined);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [p?.id, p?.photoUrl]);

  if (q.isLoading) return <Loading />;
  if (!p) return <Alert>{err(q.error)}</Alert>;
  const refresh = () => qc.invalidateQueries({ queryKey: ['parcels'] });
  const isFrom = user?.role === 'SUPER_ADMIN' || user?.branchId === p.fromBranchId;
  const closed = p.status === 'DELIVERED' || p.status === 'VOIDED';

  const upload = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    try {
      await api(`/parcels/${p.id}/photo`, { method: 'POST', form });
      refresh();
    } catch (e) {
      setError(err(e));
    }
  };

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
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}

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
        <Card title={t('parcel.photo')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photo ? <img src={photo} alt={p.trackingCode} className="mb-3 max-h-72 rounded-lg" /> : <p className="mb-3 text-sm text-gray-500">—</p>}
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-gray-300 px-4 text-sm font-semibold hover:bg-gray-50">
            📷 {t('parcel.uploadPhoto')}
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        </Card>
      </div>

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
