'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useBootstrap, useMyBranch } from '@/lib/queries';
import type { BookingStatus, Method, ParcelStatus, Payment, PaymentInput, TripStatus } from '@/lib/types';
import { Alert, Badge, Button, Field, Input, Modal, Select, Textarea } from './ui';

// ------------------------------------------------------------------ status badges

const TRIP_TONE: Record<TripStatus, 'blue' | 'yellow' | 'navy' | 'green' | 'gray' | 'red'> = {
  SCHEDULED: 'blue', BOARDING: 'yellow', DEPARTED: 'navy', ARRIVED: 'green', CLOSED: 'gray', CANCELLED: 'red',
};
const BOOKING_TONE: Record<BookingStatus, 'purple' | 'green' | 'navy' | 'red' | 'gray'> = {
  RESERVED: 'purple', CONFIRMED: 'green', BOARDED: 'navy', VOIDED: 'red', EXPIRED: 'gray',
};
const PARCEL_TONE: Record<ParcelStatus, 'blue' | 'yellow' | 'navy' | 'green' | 'gray' | 'red'> = {
  REGISTERED: 'blue', LOADED: 'yellow', IN_TRANSIT: 'navy', ARRIVED: 'green', DELIVERED: 'gray', VOIDED: 'red', MISSING: 'red', DAMAGED: 'red',
};

export function TripStatusBadge({ s }: { s: TripStatus }) {
  const { t } = useI18n();
  return <Badge tone={TRIP_TONE[s]}>{t(`tripStatus.${s}`)}</Badge>;
}
export function BookingStatusBadge({ s }: { s: BookingStatus }) {
  const { t } = useI18n();
  return <Badge tone={BOOKING_TONE[s]}>{t(`bookingStatus.${s}`)}</Badge>;
}
export function ParcelStatusBadge({ s }: { s: ParcelStatus }) {
  const { t } = useI18n();
  return <Badge tone={PARCEL_TONE[s]}>{t(`parcelStatus.${s}`)}</Badge>;
}

/** Calaamadda "Zaad ✓ / eDahab ✓ / Cash" — habka lacagta (lacag macmiil oo keliya) */
export function PaidVia({ payments }: { payments: Payment[] }) {
  const { t } = useI18n();
  const income = payments.filter((p) => p.amount > 0 && ['TICKET', 'PARCEL', 'STORAGE', 'TRANSFER_DIFF'].includes(p.kind));
  if (!income.length) return null;
  const methods = [...new Set(income.map((p) => p.method))];
  return (
    <span className="inline-flex flex-wrap gap-1">
      {methods.map((m) => (
        <Badge key={m} tone={m === 'CASH' ? 'gray' : m === 'ZAAD' ? 'green' : 'blue'}>
          {t(`method.${m}`)}
          {m !== 'CASH' && ' ✓'}
        </Badge>
      ))}
    </span>
  );
}

// ------------------------------------------------------------------ payment picker

/**
 * Habka lacagta: Cash / Zaad / eDahab. Zaad/eDahab → transaction + taleefanka laga soo diray (waajib)
 * + badhanka "Hubi" (transaction-ka hore ma loo isticmaalay?).
 */
export function PaymentPicker({ value, onChange }: { value: PaymentInput; onChange: (p: PaymentInput) => void }) {
  const { t } = useI18n();
  const branch = useMyBranch();
  const boot = useBootstrap();
  const rate = boot.data?.exchangeRate?.usdToSlsh;
  const [check, setCheck] = useState<{ used: boolean; usedOn?: string } | null>(null);
  const mobile = value.method !== 'CASH';
  const number = value.method === 'ZAAD' ? branch?.zaadNumber : value.method === 'EDAHAB' ? branch?.edahabNumber : null;

  useEffect(() => setCheck(null), [value.reference, value.method]);

  const doCheck = async () => {
    if (!value.reference) return;
    const r = await api<{ used: boolean; usedOn?: string }>('/payments/lookup', { query: { method: value.method, reference: value.reference } });
    setCheck(r);
  };

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-gray-200 p-3">
      <legend className="px-1 text-sm font-semibold text-gray-700">{t('payment.title')}</legend>
      <div className="grid grid-cols-3 gap-2" role="radiogroup">
        {(['CASH', 'ZAAD', 'EDAHAB'] as Method[]).map((m) => (
          <button
            type="button"
            key={m}
            role="radio"
            aria-checked={value.method === m}
            onClick={() => onChange({ ...value, method: m, ...(m === 'CASH' && { reference: undefined, payerPhone: undefined }) })}
            className={`min-h-11 rounded-lg border text-sm font-semibold ${value.method === m ? 'border-navy bg-navy text-white' : 'border-gray-300 bg-white text-gray-700'}`}
          >
            {t(`method.${m}`)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(['USD', 'SLSH'] as const).map((c) => (
          <button
            type="button"
            key={c}
            onClick={() => onChange({ ...value, currency: c })}
            className={`min-h-9 rounded-lg border text-xs font-semibold ${value.currency === c ? 'border-brand bg-red-50 text-brand' : 'border-gray-300 bg-white text-gray-600'}`}
          >
            {c}
          </button>
        ))}
      </div>
      {value.currency === 'SLSH' && (rate ? <p className="text-xs text-gray-600">1 USD = {rate.toLocaleString('en-US')} SLSH</p> : <Alert>{t('errors.NO_EXCHANGE_RATE')}</Alert>)}
      {mobile && (
        <>
          {number && <Alert tone="blue">{t('payment.sendTo', { number })}</Alert>}
          <Field label={t('payment.reference')} required>
            {(id) => (
              <div className="flex gap-2">
                <Input id={id} value={value.reference ?? ''} onChange={(e) => onChange({ ...value, reference: e.target.value })} autoComplete="off" />
                <Button type="button" variant="secondary" onClick={doCheck} disabled={!value.reference}>
                  {t('payment.check')}
                </Button>
              </div>
            )}
          </Field>
          {check && (check.used ? <Alert>{t('payment.used', { usedOn: check.usedOn ?? '' })}</Alert> : <Alert tone="green">{t('payment.unused')}</Alert>)}
          <Field label={t('payment.payerPhone')} required>
            {(id) => <Input id={id} inputMode="tel" value={value.payerPhone ?? ''} onChange={(e) => onChange({ ...value, payerPhone: e.target.value })} />}
          </Field>
        </>
      )}
    </fieldset>
  );
}

export const CASH_USD: PaymentInput = { method: 'CASH', currency: 'USD' };

export function paymentReady(p: PaymentInput) {
  return p.method === 'CASH' || (!!p.reference?.trim() && !!p.payerPhone?.trim());
}

// ------------------------------------------------------------------ name + phone with autofill

export function PartyInput({
  label,
  name,
  phone,
  onChange,
}: {
  label: string;
  name: string;
  phone: string;
  onChange: (v: { name: string; phone: string }) => void;
}) {
  const { t } = useI18n();
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const p = phone.replace(/\s/g, '');
    if (p.length < 9) {
      setSuggestions([]);
      return;
    }
    const h = setTimeout(() => {
      api<{ names: { name: string }[] }>('/customers/lookup', { query: { phone: p } })
        .then((r) => {
          const names = r.names.map((n) => n.name);
          setSuggestions(names);
          if (names.length && !name) onChange({ name: names[0], phone });
        })
        .catch(() => setSuggestions([]));
    }, 350);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-1 text-sm font-semibold text-gray-700">{label}</legend>
      <Field label={t('common.phone')} required>
        {(id) => <Input id={id} inputMode="tel" placeholder="063 4500038" value={phone} onChange={(e) => onChange({ name, phone: e.target.value })} />}
      </Field>
      <Field label={t('common.name')} required>
        {(id) => (
          <>
            <Input id={id} list={`${id}-list`} value={name} onChange={(e) => onChange({ name: e.target.value, phone })} />
            <datalist id={`${id}-list`}>
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </>
        )}
      </Field>
    </fieldset>
  );
}

// ------------------------------------------------------------------ confirm with reason

export function ReasonModal({
  open,
  title,
  onClose,
  onSubmit,
  confirmLabel,
  danger,
  children,
  reasonOptional,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
  confirmLabel?: string;
  danger?: boolean;
  children?: React.ReactNode;
  /** Xaqiijin kaliya (sabab looma baahna) */
  reasonOptional?: boolean;
}) {
  const { t, err } = useI18n();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setReason('');
      setError('');
    }
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await onSubmit(reason.trim());
            onClose();
          } catch (x) {
            setError(err(x));
          } finally {
            setBusy(false);
          }
        }}
      >
        {children}
        {!reasonOptional && (
          <Field label={t('common.reason')} required>
            {(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} />}
          </Field>
        )}
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant={danger ? 'danger' : 'navy'} loading={busy} disabled={!reasonOptional && reason.trim().length < 3}>
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function BranchSelect({ value, onChange, branches, allLabel, id }: { value: string; onChange: (v: string) => void; branches: { id: string; name: string }[]; allLabel?: string; id?: string }) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {allLabel !== undefined && <option value="">{allLabel}</option>}
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </Select>
  );
}

export function isApiError(e: unknown, code: string) {
  return e instanceof ApiError && e.code === code;
}

/** Khaladka query-ga (server / internet) — fariin la fahmi karo halkii bog madhan. */
export function ErrorAlert({ error }: { error: unknown }) {
  const { err } = useI18n();
  return <Alert>{err(error)}</Alert>;
}

/** Sharraxaadda qiimaha (backend: base_fee, weight_12kg, fragile …) → qoraal la fahmi karo. */
export function usePriceLabel() {
  const { t } = useI18n();
  return (label: string) => {
    const w = /^weight_(\d+)kg$/.exec(label);
    if (w) return t('priceLine.weight', { kg: w[1] });
    const key = `priceLine.${label}`;
    const v = t(key);
    return v === key ? label : v;
  };
}
