'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { dateTime, parseUsd, phone, usd } from '@/lib/format';
import { busLabel, type Driver, type Vehicle } from '@/lib/types';
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Loading, Modal, Select, Table, Td, Textarea } from './ui';
import { ErrorAlert } from './domain';

interface FineRow {
  id: string;
  vehicleId: string;
  amountCents: number;
  reason: string;
  createdAt: string;
  driverPaymentId: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  vehicle: { plate: string; fleetNo: string | null };
  driver: { name: string; phone: string } | null;
}

/**
 * Ganaaxyada baska (Super Admin — BUSINESS_RULES §33): diiwaan + ikhtiyaari darawalka mushaharkiisa laga jaro.
 * Ka laabasho → void + sabab (ka jaridda darawalkana waa la celiyaa).
 */
export function Fines() {
  const { t, err } = useI18n();
  const qc = useQueryClient();
  const fines = useQuery({ queryKey: ['vehicle-fines'], queryFn: () => api<FineRow[]>('/vehicle-fines') });
  const vehicles = useQuery({ queryKey: ['vehicles'], queryFn: () => api<Vehicle[]>('/vehicles') });
  const drivers = useQuery({ queryKey: ['drivers'], queryFn: () => api<Driver[]>('/drivers') });
  const [form, setForm] = useState<{ vehicleId: string; amount: string; reason: string; charge: boolean; driverId: string } | null>(null);
  const [undo, setUndo] = useState<FineRow | null>(null);
  const [undoReason, setUndoReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<unknown>, after: () => void) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      ['vehicle-fines', 'driver-pay'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      after();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };
  const pickVehicle = (id: string) => {
    const v = vehicles.data?.find((x) => x.id === id);
    setForm((f) => f && { ...f, vehicleId: id, driverId: v?.defaultDriverId ?? f.driverId });
  };
  const cents = form ? parseUsd(form.amount) : null;
  const ready = !!form && !!form.vehicleId && !!cents && cents > 0 && form.reason.trim().length >= 3 && (!form.charge || !!form.driverId);
  const live = fines.data?.filter((f) => !f.voidedAt) ?? [];

  return (
    <Card
      title={`🚫 ${t('fines.title')}`}
      actions={<Button size="sm" onClick={() => { setForm({ vehicleId: '', amount: '', reason: '', charge: true, driverId: '' }); setError(''); }}>+ {t('fines.add')}</Button>}
    >
      <p className="mb-3 text-sm text-gray-600">{t('fines.hint')}</p>
      {live.length > 0 && <p className="mb-2 text-sm font-semibold">{t('fines.total', { n: live.length, amount: usd(live.reduce((s, f) => s + f.amountCents, 0)) })}</p>}
      {fines.error ? <ErrorAlert error={fines.error} /> : fines.isLoading ? <Loading /> : (
        <Table head={[t('common.date'), t('fines.bus'), t('common.amount'), t('fines.reason'), t('fines.driver'), t('common.status'), '']} empty={!fines.data?.length}>
          {fines.data?.map((f) => (
            <tr key={f.id} className={f.voidedAt ? 'opacity-60' : ''}>
              <Td>{dateTime(f.createdAt)}</Td>
              <Td className="font-bold">{busLabel(f.vehicle)}</Td>
              <Td className="font-semibold">{usd(f.amountCents)}</Td>
              <Td className="whitespace-normal">{f.reason}</Td>
              <Td>{f.driver ? <span>{f.driver.name}<span className="block text-xs text-gray-500">{t('fines.deducted')} · {phone(f.driver.phone)}</span></span> : <span className="text-xs text-gray-500">{t('fines.recordOnly')}</span>}</Td>
              <Td>{f.voidedAt ? <span><Badge>↩ {t('fines.undone')}</Badge><span className="block max-w-40 whitespace-normal text-xs text-gray-500">{f.voidReason}</span></span> : <Badge tone="red">{t('fines.active')}</Badge>}</Td>
              <Td>{!f.voidedAt && <Button size="sm" variant="ghost" onClick={() => { setUndo(f); setUndoReason(''); setError(''); }}>↩ {t('fines.undo')}</Button>}</Td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={`🚫 ${t('fines.add')}`}>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (ready) void run(() => api('/vehicle-fines', { method: 'POST', body: { vehicleId: form!.vehicleId, amountCents: cents, reason: form!.reason.trim(), ...(form!.charge && { chargeDriverId: form!.driverId }) } }), () => setForm(null)); }}>
          <Field label={t('fines.bus')} required>{(id) => (
            <Select id={id} value={form?.vehicleId ?? ''} onChange={(e) => pickVehicle(e.target.value)} required>
              <option value="">—</option>
              {vehicles.data?.map((v) => <option key={v.id} value={v.id}>{busLabel(v)}{v.defaultDriver ? ` · ${v.defaultDriver.name}` : ''}</option>)}
            </Select>
          )}</Field>
          <Field label={`${t('common.amount')} ($)`} required>{(id) => <Input id={id} inputMode="decimal" value={form?.amount ?? ''} onChange={(e) => setForm({ ...form!, amount: e.target.value })} required />}</Field>
          <Field label={t('fines.reason')} required>{(id) => <Textarea id={id} value={form?.reason ?? ''} placeholder={t('fines.reasonPh')} onChange={(e) => setForm({ ...form!, reason: e.target.value })} required maxLength={200} />}</Field>
          <Checkbox label={t('fines.charge')} checked={!!form?.charge} onChange={(v) => setForm({ ...form!, charge: v })} />
          {form?.charge && (
            <Field label={t('fines.driver')} required>{(id) => (
              <Select id={id} value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })} required>
                <option value="">—</option>
                {drivers.data?.map((d) => <option key={d.id} value={d.id}>{d.name} · {phone(d.phone)}</option>)}
              </Select>
            )}</Field>
          )}
          {error && <Alert>{error}</Alert>}
          <Button type="submit" variant="danger" loading={busy} disabled={!ready}>{t('fines.save')}</Button>
        </form>
      </Modal>

      <Modal open={!!undo} onClose={() => setUndo(null)} title={`↩ ${t('fines.undo')}`}>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void run(() => api(`/vehicle-fines/${undo!.id}/void`, { method: 'POST', body: { reason: undoReason.trim() } }), () => setUndo(null)); }}>
          {undo && <Alert tone="blue">{busLabel(undo.vehicle)} · {usd(undo.amountCents)} · {undo.reason}{undo.driver ? ` → ${t('fines.undoRefund', { name: undo.driver.name })}` : ''}</Alert>}
          <Field label={t('fines.undoReason')} required>{(id) => <Textarea id={id} value={undoReason} onChange={(e) => setUndoReason(e.target.value)} required minLength={3} maxLength={200} />}</Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={busy} disabled={undoReason.trim().length < 3}>↩ {t('fines.undo')}</Button>
        </form>
      </Modal>
    </Card>
  );
}
