'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { dateTime, money, phone, todayISO, usd } from '@/lib/format';
import type { Currency, Method } from '@/lib/types';
import { Alert, Badge, Button, Card, Checkbox, Input, Loading, PageHeader, Select, Stat, Table, Td } from '@/components/ui';
import { ErrorAlert } from '@/components/domain';

interface MobileItem {
  id: string; createdAt: string; method: Method; kind: string; reference: string; payerPhone: string | null;
  amount: number; currency: Currency; amountUsdCents: number; receipt: string | null; customer: string | null; cashier: string;
  reconciledAt: string | null;
}
interface MobileList { totals: { ZAAD: number; EDAHAB: number; count: number; unreconciled: number }; items: MobileItem[] }

/** Barbar dhigga Zaad/eDahab: liiska maanta ↔ bayaanka → calaamadee "la hubiyay". */
export default function ZaadPage() {
  const { t, err } = useI18n();
  const qc = useQueryClient();
  const [day, setDay] = useState(todayISO());
  const [method, setMethod] = useState<'' | 'ZAAD' | 'EDAHAB'>('');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useQuery({
    queryKey: ['zaad', day, method, onlyOpen],
    queryFn: () => api<MobileList>('/payments/mobile', { query: { from: day, method, ...(onlyOpen && { reconciled: false }) } }),
  });
  const ids = Object.keys(checked).filter((k) => checked[k]);

  const reconcile = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/payments/reconcile', { method: 'POST', body: { ids, note: `Bayaan ${day}` } });
      setChecked({});
      qc.invalidateQueries({ queryKey: ['zaad'] });
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('zaad.title')} />
      <Alert tone="blue">{t('zaad.hint')}</Alert>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="max-w-44" />
        <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="max-w-40">
          <option value="">Zaad + eDahab</option>
          <option value="ZAAD">Zaad</option>
          <option value="EDAHAB">eDahab</option>
        </Select>
        <Checkbox label={t('zaad.onlyUnreconciled')} checked={onlyOpen} onChange={setOnlyOpen} />
      </div>
      {list.data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Zaad" value={usd(list.data.totals.ZAAD)} />
          <Stat label="eDahab" value={usd(list.data.totals.EDAHAB)} />
          <Stat label="#" value={list.data.totals.count} />
          <Stat label={t('zaad.onlyUnreconciled')} value={list.data.totals.unreconciled} tone={list.data.totals.unreconciled ? 'red' : 'green'} />
        </div>
      )}
      {error && <Alert>{error}</Alert>}
      <Card actions={<Button variant="success" onClick={reconcile} loading={busy} disabled={!ids.length}>✓ {t('zaad.reconcileSelected')} ({ids.length})</Button>}>
        {list.error ? <ErrorAlert error={list.error} /> : list.isLoading ? <Loading /> : (
          <Table head={['', t('common.date'), t('payment.method'), t('payment.reference'), t('payment.payerPhone'), t('common.amount'), t('zaad.receipt'), t('zaad.cashier'), t('common.status')]} empty={!list.data?.items.length}>
            {list.data?.items.map((i) => (
              <tr key={i.id} className={i.amount < 0 ? 'bg-red-50' : ''}>
                <Td>{!i.reconciledAt && <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={!!checked[i.id]} onChange={(e) => setChecked({ ...checked, [i.id]: e.target.checked })} aria-label={i.reference} />}</Td>
                <Td>{dateTime(i.createdAt)}</Td>
                <Td><Badge tone={i.method === 'ZAAD' ? 'green' : 'blue'}>{t(`method.${i.method}`)}</Badge></Td>
                <Td className="font-mono font-semibold">{i.reference}</Td>
                <Td>{phone(i.payerPhone)}</Td>
                <Td className="font-semibold">{money(i.amount, i.currency)}</Td>
                <Td className="font-mono">{i.receipt ?? '—'}{i.customer ? ` · ${i.customer}` : ''}</Td>
                <Td>{i.cashier}</Td>
                <Td>{i.reconciledAt ? <Badge tone="green">✓ {t('zaad.reconciled')}</Badge> : <Badge tone="yellow">…</Badge>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
