'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, download, newKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { isSuperAdmin } from '@/lib/permissions';
import { useBootstrap } from '@/lib/queries';
import { cx, dateTime, money, parseInteger, parseUsd, todayISO, usd } from '@/lib/format';
import type { Currency, Vehicle } from '@/lib/types';
import { Alert, Badge, Button, Card, Field, Input, Loading, Modal, PageHeader, Select, Stat, Table, Td } from '@/components/ui';
import { BranchSelect, ErrorAlert, ReasonModal } from '@/components/domain';

type Tab = 'branch' | 'office' | 'pnl' | 'drivers';
type Range = { from: string; to: string };

/**
 * Xisaabaadka (CashBook, si toos ah): lacag kasta oo nidaamka gasha (tigidh, alaab, kharash, wareejin, darawal)
 * buugga ayay si toos ah u gashaa — waxba gacan lagu qori maayo. Gacan: kaliya buugga xafiiska (Super Admin).
 */
export default function BooksPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const sa = isSuperAdmin(user);
  const boot = useBootstrap();
  const [tab, setTab] = useState<Tab>(sa ? 'pnl' : 'branch');
  const [range, setRange] = useState<Range>({ from: `${todayISO().slice(0, 8)}01`, to: todayISO() });
  const [branchId, setBranchId] = useState('');
  useEffect(() => {
    if (sa && !branchId && boot.data?.branches[0]) setBranchId(boot.data.branches[0].id);
  }, [sa, branchId, boot.data]);

  const tabs: [Tab, boolean][] = [['branch', true], ['office', sa], ['pnl', true], ['drivers', true]];
  const preset = (p: 'today' | 'week' | 'month') => {
    const to = todayISO();
    const from = p === 'today' ? to : p === 'week' ? todayISO(-6) : `${to.slice(0, 8)}01`;
    setRange({ from, to });
  };

  return (
    <div>
      <PageHeader title={t('books.title')} />
      <div className="mb-3 flex flex-wrap gap-2">
        {tabs.filter(([, s]) => s).map(([k]) => <Button key={k} size="sm" variant={tab === k ? 'navy' : 'secondary'} onClick={() => setTab(k)}>{t(`books.${k}`)}</Button>)}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['today', 'week', 'month'] as const).map((p) => <Button key={p} size="sm" variant="ghost" onClick={() => preset(p)}>{t(`books.${p}`)}</Button>)}
        <Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="max-w-40" />
        <span>→</span>
        <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="max-w-40" />
        {sa && (tab === 'branch' || tab === 'pnl') && (
          <div className="w-56"><BranchSelect value={branchId} onChange={setBranchId} branches={boot.data?.branches ?? []} allLabel={tab === 'pnl' ? t('common.allBranches') : undefined} /></div>
        )}
      </div>
      {tab === 'branch' && <BranchBook range={range} branchId={sa ? branchId : undefined} />}
      {tab === 'office' && sa && <OfficeBook range={range} />}
      {tab === 'pnl' && <ProfitLoss range={range} branchId={sa ? branchId : undefined} />}
      {tab === 'drivers' && <Drivers range={range} />}
    </div>
  );
}

// ------------------------------------------------------------------ branch cashbook (automatic)

const ACCOUNTS = ['CASH_USD', 'CASH_SLSH', 'ZAAD', 'EDAHAB'] as const;
type Account = (typeof ACCOUNTS)[number];
const accountCurrency = (a: Account): Currency => (a === 'CASH_SLSH' ? 'SLSH' : 'USD');

interface BookLine { id: string; at: string; kind: string; account: Account; currency: Currency; inAmount: number; outAmount: number; balance: number; ref: string | null; description: string | null; reference: string | null; category: string | null; expenseId: string | null; hasAttachment: boolean }
interface BranchBookData { opening: Record<Account, number>; closing: Record<Account, number>; totals: { inUsdCents: number; outUsdCents: number; netUsdCents: number }; lines: BookLine[] }

function BranchBook({ range, branchId }: { range: Range; branchId?: string }) {
  const { t } = useI18n();
  const [account, setAccount] = useState<Account | ''>('');
  const q = { ...range, branchId, account: account || undefined };
  const book = useQuery({ queryKey: ['books', 'branch', q], queryFn: () => api<BranchBookData>('/ledger/branch', { query: q }) });
  if (book.error) return <ErrorAlert error={book.error} />;
  if (book.isLoading || !book.data) return <Loading />;
  const d = book.data;
  return (
    <div className="flex flex-col gap-4">
      <Alert tone="blue">{t('books.autoHint')}</Alert>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ACCOUNTS.map((a) => (
          <button key={a} onClick={() => setAccount(account === a ? '' : a)} className={cx('rounded-xl border bg-white p-4 text-left', account === a ? 'border-navy ring-2 ring-navy' : 'border-gray-200')}>
            <p className="text-xs font-medium uppercase text-gray-500">{t(`books.account.${a}`)}</p>
            <p className="mt-1 text-xl font-bold text-navy">{money(d.closing[a], accountCurrency(a))}</p>
            <p className="text-xs text-gray-500">{t('books.opening')}: {money(d.opening[a], accountCurrency(a))}</p>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t('books.cashIn')} value={usd(d.totals.inUsdCents)} tone="green" />
        <Stat label={t('books.cashOut')} value={usd(d.totals.outUsdCents)} tone="red" />
        <Stat label={t('books.net')} value={usd(d.totals.netUsdCents)} />
      </div>
      <Card actions={<Button size="sm" variant="secondary" onClick={() => download('/ledger/branch', { ...q, format: 'csv' }, `cashbook-${range.from}.csv`)}>{t('common.downloadCsv')}</Button>}>
        <Table head={[t('common.date'), t('books.entry'), t('books.account.title'), t('books.cashIn'), t('books.cashOut'), t('books.balance')]} empty={!d.lines.length}>
          {d.lines.map((l) => (
            <tr key={l.id}>
              <Td className="text-xs">{dateTime(l.at)}</Td>
              <Td className="whitespace-normal">
                <span className="font-semibold">{t(`paymentKind.${l.kind}`)}</span>
                {l.category && <span className="text-gray-600"> · {t(`expenseCategory.${l.category}`)}</span>}
                {l.expenseId && (l.hasAttachment
                  ? <button className="ml-1 text-xs text-navy underline" onClick={() => download(`/expenses/${l.expenseId}/attachment`, {}, `bill-${l.expenseId}`)}>📎 {t('books.bill')}</button>
                  : <span className="ml-1 text-xs text-amber-700">· {t('books.noBill')}</span>)}
                <br />
                <span className="text-xs text-gray-500">{[l.ref, l.description, l.reference].filter(Boolean).join(' · ')}</span>
              </Td>
              <Td><Badge tone={l.account === 'ZAAD' ? 'green' : l.account === 'EDAHAB' ? 'blue' : 'gray'}>{t(`books.account.${l.account}`)}</Badge></Td>
              <Td className="font-semibold text-emerald-700">{l.inAmount ? money(l.inAmount, l.currency) : ''}</Td>
              <Td className="font-semibold text-red-700">{l.outAmount ? money(l.outAmount, l.currency) : ''}</Td>
              <Td className="font-mono">{money(l.balance, l.currency)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ head office book (manual + deposits)

interface OfficeLine { id: string; at: string; source: 'DEPOSIT' | 'ENTRY'; direction: 'IN' | 'OUT'; category: string; description: string; currency: Currency; amount: number; voided: boolean; hasAttachment: boolean; balance: number }
interface OfficeData { opening: Record<Currency, number>; closing: Record<Currency, number>; totals: { inUsdCents: number; outUsdCents: number }; lines: OfficeLine[] }

function OfficeBook({ range }: { range: Range }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const book = useQuery({ queryKey: ['books', 'office', range], queryFn: () => api<OfficeData>('/ledger/office', { query: range }) });
  const cats = useQuery({ queryKey: ['books', 'categories'], queryFn: () => api<{ IN: string[]; OUT: string[] }>('/ledger/categories') });
  const [entry, setEntry] = useState<'IN' | 'OUT' | null>(null);
  const [voiding, setVoiding] = useState<OfficeLine | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['books'] });

  const attach = async (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    await api(`/ledger/entries/${id}/attachment`, { method: 'POST', form });
    refresh();
  };

  if (book.error) return <ErrorAlert error={book.error} />;
  if (book.isLoading || !book.data) return <Loading />;
  const d = book.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`${t('books.balance')} USD`} value={usd(d.closing.USD)} />
        <Stat label={`${t('books.balance')} SLSH`} value={money(d.closing.SLSH, 'SLSH')} />
        <Stat label={t('books.cashIn')} value={usd(d.totals.inUsdCents)} tone="green" />
        <Stat label={t('books.cashOut')} value={usd(d.totals.outUsdCents)} tone="red" />
      </div>
      <div className="flex gap-2">
        <Button variant="success" size="lg" onClick={() => setEntry('IN')}>+ {t('books.cashIn')}</Button>
        <Button variant="danger" size="lg" onClick={() => setEntry('OUT')}>− {t('books.cashOut')}</Button>
        <Button variant="secondary" onClick={() => download('/ledger/office', { ...range, format: 'csv' }, `office-${range.from}.csv`)}>{t('common.downloadCsv')}</Button>
      </div>
      <Card>
        <Table head={[t('common.date'), t('books.entry'), t('books.cashIn'), t('books.cashOut'), t('books.balance'), '']} empty={!d.lines.length}>
          {d.lines.map((l) => (
            <tr key={l.id} className={l.voided ? 'text-gray-400 line-through' : ''}>
              <Td className="text-xs">{dateTime(l.at)}</Td>
              <Td className="whitespace-normal"><span className="font-semibold">{t(`books.cat.${l.category}`)}</span><br /><span className="text-xs text-gray-500">{l.description}</span></Td>
              <Td className="font-semibold text-emerald-700">{l.direction === 'IN' ? money(l.amount, l.currency) : ''}</Td>
              <Td className="font-semibold text-red-700">{l.direction === 'OUT' ? money(l.amount, l.currency) : ''}</Td>
              <Td className="font-mono">{money(l.balance, l.currency)}</Td>
              <Td>
                {l.source === 'ENTRY' && !l.voided && (
                  <div className="flex gap-1">
                    <label className="cursor-pointer rounded-lg px-2 py-1 text-sm hover:bg-gray-100" title={t('books.attach')}>
                      {l.hasAttachment ? '📎✓' : '📎'}
                      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && attach(l.id, e.target.files[0])} />
                    </label>
                    {l.category !== 'DRIVER_PAY' && <Button size="sm" variant="ghost" onClick={() => setVoiding(l)}>{t('booking.void')}</Button>}
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
      <EntryModal direction={entry} categories={entry ? cats.data?.[entry] ?? [] : []} onClose={() => setEntry(null)} onDone={refresh} />
      <ReasonModal open={!!voiding} title={t('booking.void')} danger onClose={() => setVoiding(null)} onSubmit={async (reason) => { await api(`/ledger/entries/${voiding!.id}/void`, { method: 'POST', body: { reason } }); refresh(); }} />
    </div>
  );
}

function EntryModal({ direction, categories, onClose, onDone }: { direction: 'IN' | 'OUT' | null; categories: string[]; onClose: () => void; onDone: () => void }) {
  const { t, err } = useI18n();
  const boot = useBootstrap();
  const vehicles = useQuery({ queryKey: ['vehicles'], queryFn: () => api<Vehicle[]>('/vehicles'), enabled: !!direction });
  const [f, setF] = useState({ category: '', description: '', amount: '', currency: 'USD' as Currency, entryDate: todayISO(), branchId: '', vehicleId: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const key = useRef(newKey());
  useEffect(() => {
    if (direction) {
      setF({ category: categories[0] ?? '', description: '', amount: '', currency: 'USD', entryDate: todayISO(), branchId: '', vehicleId: '' });
      setError('');
      key.current = newKey();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction]);
  const save = async () => {
    const amount = f.currency === 'USD' ? parseUsd(f.amount) : parseInteger(f.amount);
    if (!amount) return setError(t('errors.VALIDATION_ERROR'));
    setBusy(true);
    setError('');
    try {
      await api('/ledger/entries', {
        method: 'POST',
        idempotencyKey: key.current,
        body: { direction, category: f.category, description: f.description, amount, currency: f.currency, entryDate: new Date(`${f.entryDate}T12:00:00+03:00`).toISOString(), branchId: f.branchId || undefined, vehicleId: f.vehicleId || undefined },
      });
      onDone();
      onClose();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!direction} onClose={onClose} title={direction === 'IN' ? `+ ${t('books.cashIn')}` : `− ${t('books.cashOut')}`}>
      <div className="flex flex-col gap-3">
        <Field label={t('parcel.category')} required>{(id) => (
          <Select id={id} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {categories.map((c) => <option key={c} value={c}>{t(`books.cat.${c}`)}</option>)}
          </Select>
        )}</Field>
        <Field label={t('parcel.description')} required>{(id) => <Input id={id} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label={t('common.amount')} required>{(id) => <Input id={id} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />}</Field>
          <Field label={t('common.currency')}>{(id) => <Select id={id} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as Currency })}><option>USD</option><option>SLSH</option></Select>}</Field>
          <Field label={t('common.date')}>{(id) => <Input id={id} type="date" value={f.entryDate} onChange={(e) => setF({ ...f, entryDate: e.target.value })} />}</Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('books.forBranch')} hint={t('common.optional')}>{(id) => <BranchSelect id={id} value={f.branchId} onChange={(v) => setF({ ...f, branchId: v })} branches={boot.data?.branches ?? []} allLabel="—" />}</Field>
          <Field label={t('books.forVehicle')} hint={t('common.optional')}>{(id) => (
            <Select id={id} value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })}>
              <option value="">—</option>
              {vehicles.data?.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}
            </Select>
          )}</Field>
        </div>
        {error && <Alert>{error}</Alert>}
        <Button variant={direction === 'IN' ? 'success' : 'danger'} onClick={save} loading={busy} disabled={!f.category || f.description.length < 2 || !f.amount}>{t('common.save')}</Button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ profit & loss

interface PnL { income: { key: string; usdCents: number }[]; expenses: { key: string; usdCents: number }[]; driverPayUsdCents: number; totals: { incomeUsdCents: number; expensesUsdCents: number; driverPayUsdCents: number; netProfitUsdCents: number }; byVehicle: { vehicleId: string; plate: string; trips: number; incomeUsdCents: number; expensesUsdCents: number; driverPayUsdCents: number; profitUsdCents: number }[] }

function ProfitLoss({ range, branchId }: { range: Range; branchId?: string }) {
  const { t } = useI18n();
  const q = { ...range, branchId: branchId || undefined };
  const r = useQuery({ queryKey: ['books', 'pnl', q], queryFn: () => api<PnL>('/reports/profit-loss', { query: q }) });
  if (r.error) return <ErrorAlert error={r.error} />;
  if (r.isLoading || !r.data) return <Loading />;
  const d = r.data;
  const label = (k: string) => {
    for (const ns of ['paymentKind', 'expenseCategory', 'books.cat']) {
      const v = t(`${ns}.${k}`);
      if (v !== `${ns}.${k}`) return v;
    }
    return k;
  };
  const profit = d.totals.netProfitUsdCents;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('reports.income')} value={usd(d.totals.incomeUsdCents)} tone="green" />
        <Stat label={t('reports.expenses')} value={usd(d.totals.expensesUsdCents)} tone="red" />
        <Stat label={t('books.driverPay')} value={usd(d.totals.driverPayUsdCents)} tone="red" />
        <Stat label={profit >= 0 ? t('books.netProfit') : t('books.netLoss')} value={usd(profit)} tone={profit >= 0 ? 'green' : 'red'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('reports.income')}>
          <Table head={['', t('common.amount')]} empty={!d.income.length}>
            {d.income.map((x) => <tr key={x.key}><Td>{label(x.key)}</Td><Td className="font-semibold text-emerald-700">{usd(x.usdCents)}</Td></tr>)}
            <tr className="bg-gray-50 font-bold"><Td>{t('common.total')}</Td><Td>{usd(d.totals.incomeUsdCents)}</Td></tr>
          </Table>
        </Card>
        <Card title={t('reports.expenses')}>
          <Table head={['', t('common.amount')]}>
            {d.expenses.map((x) => <tr key={x.key}><Td>{label(x.key)}</Td><Td className="font-semibold text-red-700">{usd(x.usdCents)}</Td></tr>)}
            <tr><Td>{t('books.driverPay')}</Td><Td className="font-semibold text-red-700">{usd(d.driverPayUsdCents)}</Td></tr>
            <tr className="bg-gray-50 font-bold"><Td>{t('common.total')}</Td><Td>{usd(d.totals.expensesUsdCents + d.driverPayUsdCents)}</Td></tr>
          </Table>
        </Card>
      </div>
      <Card title={t('books.byVehicle')} actions={<Button size="sm" variant="secondary" onClick={() => download('/reports/profit-loss', { ...q, format: 'csv' }, `profit-loss-${range.from}.csv`)}>{t('common.downloadCsv')}</Button>}>
        <Table head={[t('trips.vehicle'), t('dashboard.trips'), t('reports.income'), t('reports.expenses'), t('books.driverPay'), t('reports.profit')]} empty={!d.byVehicle.length}>
          {d.byVehicle.map((v) => (
            <tr key={v.vehicleId} className={v.profitUsdCents < 0 ? 'bg-red-50' : ''}>
              <Td className="font-mono font-bold">{v.plate}</Td><Td>{v.trips}</Td><Td>{usd(v.incomeUsdCents)}</Td><Td>{usd(v.expensesUsdCents)}</Td><Td>{usd(v.driverPayUsdCents)}</Td>
              <Td className={cx('font-bold', v.profitUsdCents < 0 ? 'text-red-700' : 'text-emerald-700')}>{usd(v.profitUsdCents)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      <p className="text-xs text-gray-500">{t('books.pnlNote')}</p>
    </div>
  );
}

// ------------------------------------------------------------------ drivers pay

interface DriverRow { driverId: string; name: string; phone: string; isActive: boolean; rule: { type: string; amountCents: number; bps: number } | null; trips: number; earnedCents: number; paidCents: number; balanceCents: number }

function ruleText(t: (k: string, v?: Record<string, string | number>) => string, rule: DriverRow['rule']) {
  if (!rule) return t('books.noRule');
  return rule.type.startsWith('PERCENT') ? t(`books.rule.${rule.type}`, { pct: rule.bps / 100 }) : t(`books.rule.${rule.type}`, { amount: usd(rule.amountCents) });
}

function Drivers({ range }: { range: Range }) {
  const { t } = useI18n();
  const r = useQuery({ queryKey: ['books', 'drivers', range], queryFn: () => api<{ drivers: DriverRow[]; totals: { earnedCents: number; paidCents: number; owedCents: number } }>('/driver-pay', { query: range }) });
  const [open, setOpen] = useState<DriverRow | null>(null);
  const { user } = useAuth();
  const qc = useQueryClient();
  const [ran, setRan] = useState('');
  const runMonthly = async () => {
    const d = new Date(`${todayISO()}T12:00:00Z`);
    d.setUTCDate(0);
    const period = d.toISOString().slice(0, 7);
    const res = await api<{ period: string; created: number }>('/driver-pay/run-monthly', { method: 'POST', body: { period } });
    setRan(t('books.ranMonthly', { period: res.period, n: res.created }));
    qc.invalidateQueries({ queryKey: ['books'] });
  };
  if (r.error) return <ErrorAlert error={r.error} />;
  if (r.isLoading || !r.data) return <Loading />;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t('books.earned')} value={usd(r.data.totals.earnedCents)} />
        <Stat label={t('books.paid')} value={usd(r.data.totals.paidCents)} />
        <Stat label={t('books.owed')} value={usd(r.data.totals.owedCents)} tone="red" />
      </div>
      {isSuperAdmin(user) && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={runMonthly}>{t('books.runMonthly')}</Button>
          {ran && <span className="text-sm text-emerald-700">{ran}</span>}
        </div>
      )}
      <Card>
        <Table head={[t('trips.driver'), t('books.payRule'), t('dashboard.trips'), t('books.earned'), t('books.paid'), t('books.balance')]} empty={!r.data.drivers.length}>
          {r.data.drivers.map((d) => (
            <tr key={d.driverId} className="cursor-pointer hover:bg-gray-50" onClick={() => setOpen(d)}>
              <Td className="font-semibold">{d.name}</Td>
              <Td className={d.rule ? '' : 'text-amber-700'}>{ruleText(t, d.rule)}</Td>
              <Td>{d.trips}</Td>
              <Td>{usd(d.earnedCents)}</Td>
              <Td>{usd(d.paidCents)}</Td>
              <Td className={cx('font-bold', d.balanceCents > 0 ? 'text-red-700' : 'text-emerald-700')}>{usd(d.balanceCents)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      {open && <DriverStatement driver={open} range={range} onClose={() => setOpen(null)} />}
    </div>
  );
}

interface Statement { rule: { type: string; amountCents: number; bps: number } | null; openingCents: number; earnedCents: number; paidCents: number; closingCents: number; trips: number; lines: { id: string; at: string; type: string; description: string; inCents: number; outCents: number; voided: boolean; balanceCents: number; trip?: { route: string; vehicle: string; departureAt: string } }[] }

function DriverStatement({ driver, range, onClose }: { driver: DriverRow; range: Range; onClose: () => void }) {
  const { t, err } = useI18n();
  const qc = useQueryClient();
  const st = useQuery({ queryKey: ['books', 'driver', driver.driverId, range], queryFn: () => api<Statement>(`/driver-pay/${driver.driverId}/statement`, { query: range }) });
  const [action, setAction] = useState<'' | 'ADVANCE' | 'PAYOUT' | 'DEDUCTION' | 'BONUS' | 'RULE'>('');
  const [voiding, setVoiding] = useState<{ id: string; earning: boolean } | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [rule, setRule] = useState({ type: 'PER_TRIP', value: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const key = useRef(newKey());
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['books'] });
    qc.invalidateQueries({ queryKey: ['cash'] });
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (action === 'RULE') {
        const percent = rule.type.startsWith('PERCENT');
        const v = percent ? Math.round(Number(rule.value) * 100) : parseUsd(rule.value);
        if (!v) throw new Error('x');
        await api(`/driver-pay/${driver.driverId}/rule`, { method: 'PUT', body: { type: rule.type, ...(percent ? { bps: v } : { amountCents: v }) } });
      } else {
        const cents = parseUsd(amount);
        if (!cents) throw new Error('x');
        if (action === 'BONUS') await api(`/driver-pay/${driver.driverId}/bonus`, { method: 'POST', body: { amountCents: cents, note } });
        else {
          const res = await api<{ id: string }>(`/driver-pay/${driver.driverId}/payments`, { method: 'POST', idempotencyKey: key.current, body: { kind: action, amountCents: cents, note: note || undefined } });
          if (action !== 'DEDUCTION') window.open(`/print/driver-payment/${res.id}`, '_blank');
        }
      }
      key.current = newKey();
      setAction('');
      setAmount('');
      setNote('');
      refresh();
    } catch (e) {
      setError(e instanceof Error && e.message === 'x' ? t('errors.VALIDATION_ERROR') : err(e));
    } finally {
      setBusy(false);
    }
  };

  const s = st.data;
  return (
    <Modal open onClose={onClose} title={`${driver.name} — ${t('books.statement')}`} wide>
      {st.error ? <ErrorAlert error={st.error} /> : !s ? <Loading /> : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={s.rule ? 'navy' : 'yellow'}>{ruleText(t, s.rule)}</Badge>
            <Button size="sm" variant="ghost" onClick={() => setAction('RULE')}>✎ {t('books.payRule')}</Button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={t('books.opening')} value={usd(s.openingCents)} />
            <Stat label={t('books.earned')} value={usd(s.earnedCents)} tone="green" />
            <Stat label={t('books.paid')} value={usd(s.paidCents)} />
            <Stat label={t('books.balance')} value={usd(s.closingCents)} tone={s.closingCents > 0 ? 'red' : 'green'} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="navy" onClick={() => setAction('PAYOUT')}>💵 {t('books.pk.PAYOUT')}</Button>
            <Button size="sm" variant="secondary" onClick={() => setAction('ADVANCE')}>{t('books.pk.ADVANCE')}</Button>
            <Button size="sm" variant="secondary" onClick={() => setAction('DEDUCTION')}>{t('books.pk.DEDUCTION')}</Button>
            <Button size="sm" variant="secondary" onClick={() => setAction('BONUS')}>+ {t('books.pk.BONUS')}</Button>
          </div>
          {action && (
            <div className="flex flex-col gap-2 rounded-lg bg-gray-50 p-3">
              {action === 'RULE' ? (
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t('books.payRule')}>{(id) => (
                    <Select id={id} value={rule.type} onChange={(e) => setRule({ ...rule, type: e.target.value })}>
                      {['PER_TRIP', 'PERCENT_TICKETS', 'PERCENT_TRIP_INCOME', 'MONTHLY_SALARY'].map((x) => <option key={x} value={x}>{t(`books.ruleName.${x}`)}</option>)}
                    </Select>
                  )}</Field>
                  <Field label={rule.type.startsWith('PERCENT') ? '%' : '$'}>{(id) => <Input id={id} inputMode="decimal" value={rule.value} onChange={(e) => setRule({ ...rule, value: e.target.value })} placeholder={rule.type.startsWith('PERCENT') ? '10' : '5.00'} />}</Field>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Field label={`${t(`books.pk.${action}`)} ($)`} required>{(id) => <Input id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
                  <Field label={t('common.note')} required={action === 'BONUS'}>{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
                </div>
              )}
              {(action === 'ADVANCE' || action === 'PAYOUT') && <p className="text-xs text-gray-600">{t('books.fromDrawer')}</p>}
              {error && <Alert>{error}</Alert>}
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setAction('')}>{t('common.cancel')}</Button>
                <Button onClick={submit} loading={busy}>{t('common.save')}</Button>
              </div>
            </div>
          )}
          <Table head={[t('common.date'), t('books.entry'), t('books.earned'), t('books.paid'), t('books.balance'), '']} empty={!s.lines.length}>
            {s.lines.map((l) => (
              <tr key={l.id} className={l.voided ? 'text-gray-400 line-through' : ''}>
                <Td className="text-xs">{dateTime(l.at)}</Td>
                <Td className="whitespace-normal">
                  <span className="font-semibold">{t(`books.pk.${l.type}`)}</span>
                  {l.trip && <span className="text-xs text-gray-600"> · {l.trip.route} · {l.trip.vehicle}</span>}
                  {l.description && <span className="text-xs text-gray-600"> · {l.description}</span>}
                </Td>
                <Td className="text-emerald-700">{l.inCents ? usd(l.inCents) : ''}</Td>
                <Td className="text-red-700">{l.outCents ? usd(l.outCents) : ''}</Td>
                <Td className="font-mono">{usd(l.balanceCents)}</Td>
                <Td>
                  <div className="flex gap-1">
                    {l.outCents > 0 && <Button size="sm" variant="ghost" onClick={() => window.open(`/print/driver-payment/${l.id}`, '_blank')}>🖨</Button>}
                    {!l.voided && <Button size="sm" variant="ghost" onClick={() => setVoiding({ id: l.id, earning: l.inCents > 0 })}>{t('booking.void')}</Button>}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
      <ReasonModal
        open={!!voiding}
        title={t('booking.void')}
        danger
        onClose={() => setVoiding(null)}
        onSubmit={async (reason) => {
          await api(voiding!.earning ? `/driver-pay/earnings/${voiding!.id}/void` : `/driver-pay/payments/${voiding!.id}/void`, { method: 'POST', body: { reason } });
          refresh();
        }}
      />
    </Modal>
  );
}
