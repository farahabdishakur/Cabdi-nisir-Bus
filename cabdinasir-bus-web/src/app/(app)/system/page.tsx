'use client';

import { Fragment, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { isSuperAdmin } from '@/lib/permissions';
import { dateTime, phone } from '@/lib/format';
import type { Paged } from '@/lib/types';
import { Alert, Badge, Button, Card, Loading, PageHeader, Select, Stat, Table, Td } from '@/components/ui';
import { ErrorAlert } from '@/components/domain';

type Tab = 'audit' | 'sms' | 'health';

/** Nidaamka: audit log (cidda waxa samaysay), SMS-yada (fashilmay → dib u dir), xaaladda server-ka (Super Admin). */
export default function SystemPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('audit');
  const tabs: [Tab, boolean][] = [['audit', true], ['sms', true], ['health', isSuperAdmin(user)]];
  return (
    <div>
      <PageHeader title={t('system.title')} />
      <div className="mb-4 flex gap-2">
        {tabs.filter(([, s]) => s).map(([k]) => <Button key={k} size="sm" variant={tab === k ? 'navy' : 'secondary'} onClick={() => setTab(k)}>{t(`system.${k}`)}</Button>)}
      </div>
      {tab === 'audit' && <Audit />}
      {tab === 'sms' && <Sms />}
      {tab === 'health' && <Health />}
    </div>
  );
}

interface AuditRow { id: string; userId: string | null; action: string; entity: string; entityId: string | null; before: unknown; after: unknown; ip: string | null; createdAt: string }

const ENTITIES = ['', 'bookings', 'parcels', 'cash-sessions', 'expenses', 'deposits', 'payments', 'trips', 'users', 'auth', 'void-requests', 'routes', 'branches'];

function Audit() {
  const { t } = useI18n();
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['audit', entity, page], queryFn: () => api<Paged<AuditRow>>('/audit-logs', { query: { entity, page, limit: 50 } }) });
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api<{ id: string; name: string }[]>('/users') });
  const name = (id: string | null) => (id ? users.data?.find((u) => u.id === id)?.name ?? id.slice(0, 8) : '—');

  return (
    <Card actions={
      <Select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} className="max-w-52">
        {ENTITIES.map((e) => <option key={e} value={e}>{e || t('booking.filterAll')}</option>)}
      </Select>
    }>
      {list.error ? <ErrorAlert error={list.error} /> : list.isLoading ? <Loading /> : (
        <>
          <Table head={[t('common.date'), t('system.who'), t('system.action'), t('system.what'), '']} empty={!list.data?.data.length}>
            {list.data?.data.map((a) => (
              <Fragment key={a.id}>
                <tr className={/VOID|FORCE|PIN_FAILED|LOGIN_FAILED|REFUND|CANCEL|MOVE/.test(a.action) ? 'bg-amber-50' : ''}>
                  <Td>{dateTime(a.createdAt)}</Td>
                  <Td>{name(a.userId)}</Td>
                  <Td className="font-mono text-xs">{a.action}</Td>
                  <Td className="text-xs">{a.entity}{a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ''}</Td>
                  <Td><Button size="sm" variant="ghost" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? '▲' : '▼'}</Button></Td>
                </tr>
                {open === a.id && (
                  <tr>
                    <td colSpan={5} className="bg-gray-50 px-3 py-2">
                      <pre className="max-h-64 overflow-auto text-xs whitespace-pre-wrap">{JSON.stringify({ before: a.before, after: a.after, ip: a.ip }, null, 2)}</pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </Table>
          <div className="mt-3 flex items-center justify-end gap-2 text-sm">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</Button>
            <span>{page}</span>
            <Button size="sm" variant="secondary" disabled={!list.data || page * list.data.meta.limit >= list.data.meta.total} onClick={() => setPage(page + 1)}>→</Button>
          </div>
        </>
      )}
    </Card>
  );
}

interface SmsRow { id: string; to: string; template: string; body: string; status: 'PENDING' | 'SENT' | 'FAILED'; attempts: number; lastError: string | null; sentAt: string | null; parcelId: string | null; createdAt: string }

function Sms() {
  const { t, err } = useI18n();
  const qc = useQueryClient();
  const [status, setStatus] = useState<'' | 'FAILED' | 'PENDING' | 'SENT'>('FAILED');
  const list = useQuery({ queryKey: ['sms', status], queryFn: () => api<SmsRow[]>('/notifications', { query: { status } }) });
  const [error, setError] = useState('');
  const retry = async (id: string) => {
    setError('');
    try {
      await api(`/notifications/${id}/retry`, { method: 'POST' });
      qc.invalidateQueries({ queryKey: ['sms'] });
    } catch (e) {
      setError(err(e));
    }
  };
  return (
    <Card actions={
      <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="max-w-40">
        <option value="FAILED">FAILED</option><option value="PENDING">PENDING</option><option value="SENT">SENT</option><option value="">{t('booking.filterAll')}</option>
      </Select>
    }>
      {error && <div className="mb-2"><Alert>{error}</Alert></div>}
      {list.error ? <ErrorAlert error={list.error} /> : list.isLoading ? <Loading /> : (
        <Table head={[t('common.date'), t('common.phone'), t('system.message'), t('common.status'), '']} empty={!list.data?.length}>
          {list.data?.map((n) => (
            <tr key={n.id}>
              <Td>{dateTime(n.createdAt)}</Td>
              <Td>{phone(n.to)}</Td>
              <Td className="max-w-md whitespace-normal text-xs">{n.body}{n.lastError && <p className="text-red-700">{n.lastError}</p>}</Td>
              <Td><Badge tone={n.status === 'SENT' ? 'green' : n.status === 'FAILED' ? 'red' : 'yellow'}>{n.status} ({n.attempts})</Badge></Td>
              <Td>{n.status === 'FAILED' && <Button size="sm" variant="secondary" onClick={() => retry(n.id)}>{t('system.retry')}</Button>}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

interface HealthDetails { version: string; uptimeSeconds: number; memoryMb: number; db: { latencyMs: number; size: string }; sms: { pending: number; failed: number; oldestPendingAt: string | null }; openCashSessions: number; jobsEnabled: boolean }

function Health() {
  const { t } = useI18n();
  const h = useQuery({ queryKey: ['health'], queryFn: () => api<HealthDetails>('/health/details'), refetchInterval: 30_000 });
  if (h.error) return <ErrorAlert error={h.error} />;
  if (h.isLoading || !h.data) return <Loading />;
  const d = h.data;
  return (
    <div className="flex flex-col gap-3">
      {!d.jobsEnabled && <Alert tone="yellow">{t('system.jobsOff')}</Alert>}
      {d.sms.failed > 0 && <Alert>{t('system.smsFailed', { n: d.sms.failed })}</Alert>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Version" value={d.version} />
        <Stat label={t('system.uptime')} value={`${Math.floor(d.uptimeSeconds / 3600)}h ${Math.floor((d.uptimeSeconds % 3600) / 60)}m`} />
        <Stat label="DB" value={`${d.db.latencyMs} ms · ${d.db.size}`} />
        <Stat label="RAM" value={`${d.memoryMb} MB`} />
        <Stat label="SMS PENDING" value={d.sms.pending} tone={d.sms.pending > 20 ? 'red' : undefined} />
        <Stat label="SMS FAILED" value={d.sms.failed} tone={d.sms.failed ? 'red' : 'green'} />
        <Stat label={t('dashboard.openSessions')} value={d.openCashSessions} />
      </div>
    </div>
  );
}
