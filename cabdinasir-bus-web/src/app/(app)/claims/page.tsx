'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { dateTime, phone, usd } from '@/lib/format';
import type { ClaimStatus, ParcelClaim } from '@/lib/types';
import { Button, Card, Loading, PageHeader, Table, Td } from '@/components/ui';
import { ErrorAlert } from '@/components/domain';
import { ClaimStatusBadge } from '@/components/claims';

/** Cabashooyinka macmiilka — kuwa furan marka hore */
export default function ClaimsPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState<ClaimStatus | ''>('OPEN');
  const q = useQuery({ queryKey: ['claims', 'list', status], queryFn: () => api<{ data: ParcelClaim[]; meta: { total: number } }>('/claims', { query: { status: status || undefined, limit: 100 } }) });
  return (
    <div>
      <PageHeader title={t('claims.title')} />
      <div className="mb-3 flex flex-wrap gap-2">
        {(['OPEN', 'ACCEPTED', 'REJECTED', ''] as const).map((s) => (
          <Button key={s || 'all'} size="sm" variant={status === s ? 'navy' : 'secondary'} onClick={() => setStatus(s)}>{s ? t(`claims.status.${s}`) : t('claims.all')}</Button>
        ))}
      </div>
      {q.error ? <ErrorAlert error={q.error} /> : !q.data ? <Loading /> : (
        <Card>
          <Table head={[t('claims.no'), t('common.date'), t('nav.parcels'), t('claims.type'), t('claims.claimant'), t('claims.claimedAmount'), t('common.status')]} empty={!q.data.data.length}>
            {q.data.data.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <Td><Link href={`/claims/${c.id}`} className="font-mono font-semibold text-navy underline">{c.claimNo}</Link></Td>
                <Td className="text-xs">{dateTime(c.createdAt)}</Td>
                <Td className="font-mono">{c.parcel?.trackingCode}</Td>
                <Td>{t(`claims.types.${c.type}`)}</Td>
                <Td>{c.claimantName}<br /><span className="text-xs text-gray-500">{phone(c.claimantPhone)}</span></Td>
                <Td>{c.claimedAmountCents ? usd(c.claimedAmountCents) : '—'}</Td>
                <Td><ClaimStatusBadge s={c.status} /></Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
