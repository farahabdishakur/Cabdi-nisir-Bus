'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, newKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { can, isSuperAdmin } from '@/lib/permissions';
import { useCashSession } from '@/lib/queries';
import { dateTime, money, parseInteger, parseUsd, slsh, todayISO, usd } from '@/lib/format';
import type { CashSession, Currency, Method } from '@/lib/types';
import { Alert, Badge, Button, Card, Field, Input, Loading, Modal, PageHeader, Select, Stat, Table, Td } from '@/components/ui';
import { ReasonModal, ErrorAlert } from '@/components/domain';

interface Expense { id: string; category: string; description: string; voidedAt: string | null; createdAt: string; attachmentUrl?: string | null; payment: { amount: number; currency: Currency; method: Method } }
interface Deposit { id: string; target: string; note: string | null; confirmedAt: string | null; createdAt: string; branch?: { name: string }; payment: { amount: number; currency: Currency } }

export default function CashPage() {
  const { t, err } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const session = useCashSession();
  const [opening, setOpening] = useState({ usd: '', slsh: '' });
  const [counted, setCounted] = useState({ usd: '', slsh: '', note: '' });
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [closedResult, setClosedResult] = useState<CashSession | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['cash'] });

  const open = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/cash-sessions/open', { method: 'POST', body: { openingUsdCents: parseUsd(opening.usd || '0') ?? 0, openingSlsh: parseInteger(opening.slsh || '0') ?? 0 } });
      setClosedResult(null);
      refresh();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    if (!session.data) return;
    setBusy(true);
    setError('');
    try {
      const r = await api<CashSession>(`/cash-sessions/${session.data.id}/close`, {
        method: 'POST',
        body: { countedUsdCents: parseUsd(counted.usd || '0') ?? 0, countedSlsh: parseInteger(counted.slsh || '0') ?? 0, note: counted.note || undefined },
      });
      setClosedResult(r);
      setClosing(false);
      setCounted({ usd: '', slsh: '', note: '' });
      refresh();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };

  const s = session.data;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('cash.title')} />
      {error && <Alert>{error}</Alert>}
      {closedResult?.variance && (
        <Alert tone={closedResult.variance.USD === 0 && closedResult.variance.SLSH === 0 ? 'green' : 'yellow'}>
          {t('cash.closed')} — {t('cash.variance')}: {usd(closedResult.variance.USD)} · {slsh(closedResult.variance.SLSH)}
        </Alert>
      )}

      {session.error ? <ErrorAlert error={session.error} /> : session.isLoading ? <Loading /> : !s ? (
        user?.branchId && (
          <Card title={t('cash.open')}>
            <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
              <Field label={t('cash.openingUsd')}>{(id) => <Input id={id} inputMode="decimal" placeholder="0.00" value={opening.usd} onChange={(e) => setOpening({ ...opening, usd: e.target.value })} />}</Field>
              <Field label={t('cash.openingSlsh')}>{(id) => <Input id={id} inputMode="numeric" placeholder="0" value={opening.slsh} onChange={(e) => setOpening({ ...opening, slsh: e.target.value })} />}</Field>
              <Button size="lg" onClick={open} loading={busy}>💵 {t('cash.open')}</Button>
            </div>
          </Card>
        )
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={`${t('cash.expected')} USD`} value={usd(s.summary?.expectedCash.USD)} />
            <Stat label={`${t('cash.expected')} SLSH`} value={slsh(s.summary?.expectedCash.SLSH)} />
            <Stat label={t('common.total')} value={usd(s.summary?.totalUsdCents)} />
            <div className="flex items-stretch">
              <Button className="w-full" size="lg" variant="navy" onClick={() => setClosing(true)}>🔒 {t('cash.closeTitle')}</Button>
            </div>
          </div>
          <Card title={t('cash.byMethod')} actions={<span className="text-xs text-gray-500">{dateTime(s.openedAt)}</span>}>
            <Table head={[t('payment.method'), t('common.currency'), '#', t('common.amount')]} empty={!s.summary?.byMethod.length}>
              {s.summary?.byMethod.map((m) => (
                <tr key={`${m.method}${m.currency}`}><Td>{t(`method.${m.method}`)}</Td><Td>{m.currency}</Td><Td>{m.count}</Td><Td className="font-semibold">{money(m.amount, m.currency)}</Td></tr>
              ))}
            </Table>
          </Card>
          <Expenses hasSession />
          <Deposits hasSession />
        </>
      )}

      {can(user, 'approveCash') && <BranchSessions />}
      {isSuperAdmin(user) && <Deposits hasSession={false} pendingOnly />}

      <Modal open={closing} onClose={() => setClosing(false)} title={t('cash.closeTitle')}>
        <div className="flex flex-col gap-3">
          <Alert tone="blue">{t('cash.expected')}: {usd(s?.summary?.expectedCash.USD)} · {slsh(s?.summary?.expectedCash.SLSH)}</Alert>
          <Field label={t('cash.countedUsd')} required>{(id) => <Input id={id} inputMode="decimal" value={counted.usd} onChange={(e) => setCounted({ ...counted, usd: e.target.value })} />}</Field>
          <Field label={t('cash.countedSlsh')} required>{(id) => <Input id={id} inputMode="numeric" value={counted.slsh} onChange={(e) => setCounted({ ...counted, slsh: e.target.value })} />}</Field>
          <Field label={t('common.note')}>{(id) => <Input id={id} value={counted.note} onChange={(e) => setCounted({ ...counted, note: e.target.value })} />}</Field>
          {error && <Alert>{error}</Alert>}
          <Button size="lg" variant="navy" onClick={close} loading={busy} disabled={counted.usd === '' || counted.slsh === ''}>{t('cash.closeTitle')}</Button>
        </div>
      </Modal>
    </div>
  );
}

function Expenses({ hasSession }: { hasSession: boolean }) {
  const { t, err } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['cash', 'expenses'], queryFn: () => api<Expense[]>('/expenses', { query: { from: todayISO() } }) });
  const [open, setOpen] = useState(false);
  const [voiding, setVoiding] = useState<Expense | null>(null);
  const attach = async (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    await api(`/expenses/${id}/attachment`, { method: 'POST', form });
    qc.invalidateQueries({ queryKey: ['cash', 'expenses'] });
  };
  const [form, setForm] = useState({ category: 'FUEL', description: '', amount: '', currency: 'USD' as Currency });
  const [error, setError] = useState('');
  const key = useRef(newKey());

  const submit = async () => {
    setError('');
    const amount = form.currency === 'USD' ? parseUsd(form.amount) : parseInteger(form.amount);
    if (!amount) return setError(t('errors.VALIDATION_ERROR'));
    try {
      await api('/expenses', { method: 'POST', idempotencyKey: key.current, body: { category: form.category, description: form.description, amount, currency: form.currency } });
      key.current = newKey();
      setOpen(false);
      setForm({ ...form, description: '', amount: '' });
      qc.invalidateQueries({ queryKey: ['cash'] });
    } catch (e) {
      setError(err(e));
    }
  };

  return (
    <Card title={t('cash.expenses')} actions={hasSession && <Button size="sm" onClick={() => setOpen(true)}>+ {t('cash.newExpense')}</Button>}>
      <Table head={[t('common.date'), t('common.status'), t('common.note'), t('common.amount'), '']} empty={!list.data?.length}>
        {list.data?.map((e) => (
          <tr key={e.id} className={e.voidedAt ? 'text-gray-400 line-through' : ''}>
            <Td>{dateTime(e.createdAt)}</Td>
            <Td><Badge>{t(`expenseCategory.${e.category}`)}</Badge></Td>
            <Td>{e.description}</Td>
            <Td className="font-semibold">{money(-e.payment.amount, e.payment.currency)}</Td>
            <Td>
              <div className="flex items-center gap-1">
                {!e.voidedAt && (
                  <label className="cursor-pointer rounded-lg px-2 py-1 text-sm hover:bg-gray-100" title={t('books.attach')}>
                    {e.attachmentUrl ? '📎✓' : '📎'}
                    <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(ev) => ev.target.files?.[0] && attach(e.id, ev.target.files[0])} />
                  </label>
                )}
                {!e.voidedAt && can(user, 'void') && <Button size="sm" variant="ghost" onClick={() => setVoiding(e)}>{t('booking.void')}</Button>}
              </div>
            </Td>
          </tr>
        ))}
      </Table>
      <Modal open={open} onClose={() => setOpen(false)} title={t('cash.newExpense')}>
        <div className="flex flex-col gap-3">
          <Field label={t('parcel.category')}>{(id) => (
            <Select id={id} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {['FUEL', 'DRIVER_ALLOWANCE', 'MAINTENANCE', 'RENT', 'UTILITIES', 'SALARY', 'OTHER'].map((c) => <option key={c} value={c}>{t(`expenseCategory.${c}`)}</option>)}
            </Select>
          )}</Field>
          <Field label={t('parcel.description')} required>{(id) => <Input id={id} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.amount')} required>{(id) => <Input id={id} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />}</Field>
            <Field label={t('common.currency')}>{(id) => <Select id={id} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}><option>USD</option><option>SLSH</option></Select>}</Field>
          </div>
          {error && <Alert>{error}</Alert>}
          <Button onClick={submit} disabled={form.description.length < 3 || !form.amount}>{t('common.save')}</Button>
        </div>
      </Modal>
      <ReasonModal open={!!voiding} title={t('booking.void')} danger onClose={() => setVoiding(null)} onSubmit={async (reason) => { await api(`/expenses/${voiding!.id}/void`, { method: 'POST', body: { reason } }); qc.invalidateQueries({ queryKey: ['cash'] }); }} />
    </Card>
  );
}

function Deposits({ hasSession, pendingOnly }: { hasSession: boolean; pendingOnly?: boolean }) {
  const { t, err } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['cash', 'deposits', pendingOnly], queryFn: () => api<Deposit[]>('/deposits', { query: pendingOnly ? { unconfirmed: true } : { from: todayISO() } }) });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ target: 'HEAD_OFFICE', amount: '', currency: 'USD' as Currency, note: '' });
  const [error, setError] = useState('');
  const key = useRef(newKey());

  const submit = async () => {
    setError('');
    const amount = form.currency === 'USD' ? parseUsd(form.amount) : parseInteger(form.amount);
    if (!amount) return setError(t('errors.VALIDATION_ERROR'));
    try {
      await api('/deposits', { method: 'POST', idempotencyKey: key.current, body: { target: form.target, amount, currency: form.currency, note: form.note || undefined } });
      key.current = newKey();
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['cash'] });
    } catch (e) {
      setError(err(e));
    }
  };

  const confirm = async (id: string) => {
    try {
      await api(`/deposits/${id}/confirm`, { method: 'POST' });
      qc.invalidateQueries({ queryKey: ['cash'] });
    } catch (e) {
      setError(err(e));
    }
  };

  if (pendingOnly && !list.data?.length) return null;
  return (
    <Card title={pendingOnly ? `${t('cash.deposits')} — ${t('cash.confirmReceived')}?` : t('cash.deposits')} actions={hasSession && <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>+ {t('cash.newDeposit')}</Button>}>
      <Table head={[t('common.date'), t('common.branch'), t('common.to'), t('common.amount'), t('common.status')]} empty={!list.data?.length}>
        {list.data?.map((d) => (
          <tr key={d.id}>
            <Td>{dateTime(d.createdAt)}</Td>
            <Td>{d.branch?.name ?? ''}</Td>
            <Td>{t(`depositTarget.${d.target}`)}</Td>
            <Td className="font-semibold">{money(-d.payment.amount, d.payment.currency)}</Td>
            <Td>{d.confirmedAt ? <Badge tone="green">✓ {t('cash.confirmReceived')}</Badge> : isSuperAdmin(user) ? <Button size="sm" variant="success" onClick={() => confirm(d.id)}>{t('cash.confirmReceived')}</Button> : <Badge tone="yellow">…</Badge>}</Td>
          </tr>
        ))}
      </Table>
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
      <Modal open={open} onClose={() => setOpen(false)} title={t('cash.newDeposit')}>
        <div className="flex flex-col gap-3">
          <Field label={t('common.to')}>{(id) => (
            <Select id={id} value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}>
              {['HEAD_OFFICE', 'BANK', 'MOBILE_MONEY'].map((c) => <option key={c} value={c}>{t(`depositTarget.${c}`)}</option>)}
            </Select>
          )}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.amount')} required>{(id) => <Input id={id} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />}</Field>
            <Field label={t('common.currency')}>{(id) => <Select id={id} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}><option>USD</option><option>SLSH</option></Select>}</Field>
          </div>
          <Field label={t('common.note')}>{(id) => <Input id={id} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />}</Field>
          {error && <Alert>{error}</Alert>}
          <Button onClick={submit} disabled={!form.amount}>{t('common.save')}</Button>
        </div>
      </Modal>
    </Card>
  );
}

/** Manager: sanduuqyada laanta — ansixi, ama xir kuwa karraanigu ka tagay. */
function BranchSessions() {
  const { t, err } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  // maanta + kuwa weli furan (karraani ka tagay maalin hore)
  const list = useQuery({
    queryKey: ['cash', 'sessions'],
    queryFn: async () => {
      const [today, open] = await Promise.all([
        api<(CashSession & { cashierId: string })[]>('/cash-sessions', { query: { date: todayISO() } }),
        api<(CashSession & { cashierId: string })[]>('/cash-sessions', { query: { open: true } }),
      ]);
      const all = new Map([...open, ...today].map((s) => [s.id, s]));
      return [...all.values()].sort((a, b) => b.openedAt.localeCompare(a.openedAt));
    },
  });
  const [force, setForce] = useState<CashSession | null>(null);
  const [counted, setCounted] = useState({ usd: '', slsh: '' });
  const [error, setError] = useState('');

  const approve = async (id: string) => {
    try {
      await api(`/cash-sessions/${id}/approve`, { method: 'POST', body: {} });
      qc.invalidateQueries({ queryKey: ['cash'] });
    } catch (e) {
      setError(err(e));
    }
  };

  return (
    <Card title={t('cash.sessions')}>
      {error && <div className="mb-2"><Alert>{error}</Alert></div>}
      <Table head={[t('common.date'), t('cash.expected'), t('cash.variance'), t('common.status'), '']} empty={!list.data?.length}>
        {list.data?.map((s) => (
          <tr key={s.id}>
            <Td>{dateTime(s.openedAt)}{s.closedAt ? ` → ${dateTime(s.closedAt)}` : ''}</Td>
            <Td>{s.expected ? `${usd(s.expected.USD)} · ${slsh(s.expected.SLSH)}` : '—'}</Td>
            <Td className={s.variance && (s.variance.USD !== 0 || s.variance.SLSH !== 0) ? 'font-bold text-red-700' : ''}>{s.variance ? `${usd(s.variance.USD)} · ${slsh(s.variance.SLSH)}` : '—'}</Td>
            <Td>{s.approvedAt ? <Badge tone="green">{t('cash.approved')}</Badge> : s.closedAt ? <Badge tone="yellow">{t('cash.closed')}</Badge> : <Badge tone="blue">{t('dashboard.sessionOpen')}</Badge>}</Td>
            <Td>
              {s.closedAt && !s.approvedAt && s.cashierId !== user?.id && <Button size="sm" variant="success" onClick={() => approve(s.id)}>{t('cash.approve')}</Button>}
              {!s.closedAt && s.cashierId !== user?.id && <Button size="sm" variant="secondary" onClick={() => setForce(s)}>{t('cash.forceClose')}</Button>}
            </Td>
          </tr>
        ))}
      </Table>
      <ReasonModal
        open={!!force}
        title={t('cash.forceClose')}
        onClose={() => setForce(null)}
        onSubmit={async (note) => {
          await api(`/cash-sessions/${force!.id}/force-close`, { method: 'POST', body: { countedUsdCents: parseUsd(counted.usd || '0') ?? 0, countedSlsh: parseInteger(counted.slsh || '0') ?? 0, note } });
          qc.invalidateQueries({ queryKey: ['cash'] });
        }}
      >
        <Field label={t('cash.countedUsd')}>{(id) => <Input id={id} value={counted.usd} onChange={(e) => setCounted({ ...counted, usd: e.target.value })} />}</Field>
        <Field label={t('cash.countedSlsh')}>{(id) => <Input id={id} value={counted.slsh} onChange={(e) => setCounted({ ...counted, slsh: e.target.value })} />}</Field>
      </ReasonModal>
    </Card>
  );
}
