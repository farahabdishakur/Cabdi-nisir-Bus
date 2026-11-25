'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, newKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useBootstrap, useCashSession } from '@/lib/queries';
import { parseUsd, usd } from '@/lib/format';
import type { Parcel, PaymentInput, PriceLine } from '@/lib/types';
import { Alert, Button, Card, Checkbox, Field, Input, PageHeader, Select, Textarea } from '@/components/ui';
import { CASH_USD, PartyInput, PaymentPicker, paymentReady } from '@/components/domain';

interface Quote {
  totalCents: number;
  lines: PriceLine[];
}

/** Alaab dir (UI_RULES flow): laanta → diraha/qaataha (autofill) → nooc/kg → qiimaha live → bixin → rasiid + label. */
export default function NewParcelPage() {
  const { t, err, lang } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const boot = useBootstrap();
  const session = useCashSession();
  const myCity = boot.data?.branches.find((b) => b.id === user?.branchId)?.city;
  const destinations = (boot.data?.branches ?? []).filter((b) => b.id !== user?.branchId && b.city !== myCity && b.isActive);

  const [toBranchId, setTo] = useState('');
  const [sender, setSender] = useState({ name: '', phone: '' });
  const [receiver, setReceiver] = useState({ name: '', phone: '' });
  const [categoryId, setCategory] = useState('');
  const [pieces, setPieces] = useState('1');
  const [weight, setWeight] = useState('');
  const [description, setDescription] = useState('');
  const [declared, setDeclared] = useState('');
  const [fragile, setFragile] = useState(false);
  const [insured, setInsured] = useState(false);
  const [packaging, setPackaging] = useState(true);
  const [payer, setPayer] = useState<'SENDER' | 'RECEIVER'>('SENDER');
  const [pay, setPay] = useState<PaymentInput>(CASH_USD);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Parcel | null>(null);
  const key = useRef(newKey());

  const category = boot.data?.categories.find((c) => c.id === categoryId);
  const weightKg = Number(weight);
  const declaredCents = declared ? parseUsd(declared) ?? 0 : 0;

  // qiimaha live (backend ayaa xisaabiya — CLAUDE.md §3.1)
  useEffect(() => {
    setQuote(null);
    setQuoteError('');
    if (!toBranchId || !categoryId || !(weightKg > 0)) return;
    const h = setTimeout(() => {
      api<Quote>('/parcels/quote', { method: 'POST', body: { toBranchId, categoryId, weightKg, isFragile: fragile, insured, ...(declaredCents && { declaredValueCents: declaredCents }) } })
        .then(setQuote)
        .catch((e) => setQuoteError(err(e)));
    }, 300);
    return () => clearTimeout(h);
  }, [toBranchId, categoryId, weightKg, fragile, insured, declaredCents, err]);

  const reset = () => {
    setDone(null);
    setSender({ name: '', phone: '' });
    setReceiver({ name: '', phone: '' });
    setWeight('');
    setDescription('');
    setDeclared('');
    setFragile(false);
    setInsured(false);
    setPieces('1');
    setPay(CASH_USD);
    key.current = newKey();
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const p = await api<Parcel>('/parcels', {
        method: 'POST',
        idempotencyKey: key.current,
        body: {
          toBranchId, categoryId, weightKg, pieces: Number(pieces), description: description || undefined,
          senderName: sender.name.trim(), senderPhone: sender.phone.trim(), receiverName: receiver.name.trim(), receiverPhone: receiver.phone.trim(),
          isFragile: fragile, insured, packagingOk: packaging, payer,
          ...(declaredCents && { declaredValueCents: declaredCents }),
          ...(payer === 'SENDER' && { payment: pay }),
        },
      });
      setDone(p);
      qc.invalidateQueries({ queryKey: ['parcels'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
      if (p.pickupPin) sessionStorage.setItem(`pin:${p.id}`, p.pickupPin);
      window.open(`/print/parcel/${p.id}`, '_blank');
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="mx-auto max-w-lg">
        <Card title={t('parcel.registered')}>
          <div className="flex flex-col gap-3 text-center">
            <p className="font-mono text-3xl font-black text-navy">{done.trackingCode}</p>
            {done.pickupPin && (
              <div className="rounded-xl bg-amber-50 p-4">
                <p className="text-sm text-amber-900">{t('parcel.pin')}</p>
                <p className="font-mono text-4xl font-black tracking-widest text-amber-900">{done.pickupPin}</p>
                <p className="mt-1 text-xs text-amber-800">{t('parcel.pinHint')}</p>
              </div>
            )}
            <p className="text-lg font-bold">{usd(done.feeCents)} · {done.payer === 'SENDER' ? t('parcel.payerSender') : t('parcel.payerReceiver')}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" onClick={() => window.open(`/print/parcel/${done.id}`, '_blank')}>🖨 {t('common.print')}</Button>
              <Link href={`/parcels/${done.trackingCode}`}><Button variant="secondary">{t('parcel.tracking')}</Button></Link>
              <Button onClick={reset}>+ {t('parcel.newTitle')}</Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const ready =
    toBranchId && categoryId && weightKg > 0 && Number(pieces) >= 1 && quote && !category?.isProhibited &&
    sender.name.trim() && sender.phone.trim() && receiver.name.trim() && receiver.phone.trim() &&
    (payer === 'RECEIVER' || paymentReady(pay));
  const noSession = payer === 'SENDER' && !session.isLoading && !session.data;

  return (
    <div>
      <PageHeader title={t('parcel.newTitle')} />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <div className="flex flex-col gap-4">
            <Field label={t('parcel.to')} required>
              {(id) => (
                <Select id={id} value={toBranchId} onChange={(e) => setTo(e.target.value)}>
                  <option value="">—</option>
                  {destinations.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              )}
            </Field>
            <PartyInput label={t('parcel.sender')} name={sender.name} phone={sender.phone} onChange={setSender} />
            <PartyInput label={t('parcel.receiver')} name={receiver.name} phone={receiver.phone} onChange={setReceiver} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('parcel.category')} required>
                {(id) => (
                  <Select id={id} value={categoryId} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">—</option>
                    {boot.data?.categories.map((c) => (
                      <option key={c.id} value={c.id}>{lang === 'en' ? c.nameEn : c.nameSo}{c.isProhibited ? ' ⛔' : ''}</option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('parcel.pieces')} required>
                {(id) => <Input id={id} type="number" min={1} value={pieces} onChange={(e) => setPieces(e.target.value)} />}
              </Field>
              <Field label={t('parcel.weight')} required>
                {(id) => <Input id={id} type="number" min={0.1} step={0.1} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />}
              </Field>
            </div>
            {category?.isProhibited && <Alert>{t('parcel.prohibited')}</Alert>}
            <Field label={t('parcel.description')}>
              {(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} />}
            </Field>
            <div className="grid gap-x-4 sm:grid-cols-3">
              <Checkbox label={t('parcel.fragile')} checked={fragile} onChange={setFragile} />
              <Checkbox label={t('parcel.insured')} checked={insured} onChange={setInsured} />
              <Checkbox label={t('parcel.packaging')} checked={packaging} onChange={setPackaging} />
            </div>
            {insured && (
              <Field label={t('parcel.declared')} required>
                {(id) => <Input id={id} inputMode="decimal" value={declared} onChange={(e) => setDeclared(e.target.value)} />}
              </Field>
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card title={t('parcel.fee')}>
            {quote ? (
              <>
                <ul className="mb-2 text-sm text-gray-600">
                  {quote.lines.map((l) => (
                    <li key={l.label} className="flex justify-between"><span>{l.label}</span><span>{usd(l.cents)}</span></li>
                  ))}
                </ul>
                <p className="flex justify-between border-t pt-2 text-2xl font-black text-navy"><span>{t('common.total')}</span><span>{usd(quote.totalCents)}</span></p>
              </>
            ) : quoteError ? <Alert>{quoteError}</Alert> : <p className="text-sm text-gray-500">—</p>}
          </Card>
          <Card title={t('parcel.payer')}>
            <div className="mb-3 flex flex-col gap-2">
              <Button variant={payer === 'SENDER' ? 'navy' : 'secondary'} onClick={() => setPayer('SENDER')}>{t('parcel.payerSender')}</Button>
              <Button variant={payer === 'RECEIVER' ? 'navy' : 'secondary'} onClick={() => setPayer('RECEIVER')}>{t('parcel.payerReceiver')}</Button>
            </div>
            {payer === 'SENDER' && <PaymentPicker value={pay} onChange={setPay} />}
            {noSession && <div className="mt-3"><Alert tone="yellow">{t('dashboard.noSession')} <Link href="/cash" className="font-bold underline">{t('dashboard.openSession')}</Link></Alert></div>}
          </Card>
          {error && <Alert>{error}</Alert>}
          <Button size="lg" onClick={submit} loading={busy} disabled={!ready || noSession}>
            {t('parcel.register')} {quote ? usd(quote.totalCents) : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}
