'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { dateTime, phone, usd } from '@/lib/format';
import type { Paged, Parcel, ParcelStatus } from '@/lib/types';
import { Button, Card, Input, Loading, PageHeader, Select, Table, Td } from '@/components/ui';
import { PaidVia, ParcelStatusBadge, ErrorAlert } from '@/components/domain';

const STATUSES: ParcelStatus[] = ['REGISTERED', 'LOADED', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'MISSING', 'DAMAGED', 'VOIDED'];

export default function ParcelsPage() {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [status, setStatus] = useState<ParcelStatus | ''>('');
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['parcels', 'list', search, direction, status, page],
    queryFn: () => api<Paged<Parcel>>('/parcels', { query: { q: search, direction, status, page, limit: 30 } }),
  });

  return (
    <div>
      <PageHeader title={t('nav.parcels')} actions={<Link href="/parcels/new"><Button>+ {t('parcel.newTitle')}</Button></Link>} />
      <div className="mb-3 flex flex-wrap gap-2">
        <Select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)} className="max-w-44">
          <option value="all">{t('booking.filterAll')}</option>
          <option value="incoming">{t('nav.incoming')}</option>
          <option value="outgoing">{t('nav.outgoing')}</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as ParcelStatus | '')} className="max-w-48">
          <option value="">{t('common.status')}: —</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`parcelStatus.${s}`)}</option>)}
        </Select>
        <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(q); setPage(1); }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('parcel.deliverSearch')} />
          <Button type="submit" variant="secondary">{t('common.search')}</Button>
        </form>
      </div>
      <Card>
        {list.error ? <ErrorAlert error={list.error} /> : list.isLoading ? <Loading /> : (
          <Table head={[t('parcel.tracking'), t('common.status'), t('parcel.sender'), t('parcel.receiver'), t('parcel.to'), t('parcel.fee'), t('payment.paidVia'), t('common.date')]} empty={!list.data?.data.length}>
            {list.data?.data.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <Td><Link className="font-mono font-semibold text-navy hover:underline" href={`/parcels/${p.trackingCode}`}>{p.trackingCode}</Link></Td>
                <Td><ParcelStatusBadge s={p.status} /></Td>
                <Td>{p.senderName}<br /><span className="text-xs text-gray-500">{phone(p.senderPhone)}</span></Td>
                <Td>{p.receiverName}<br /><span className="text-xs text-gray-500">{phone(p.receiverPhone)}</span></Td>
                <Td>{p.fromBranch.name} → {p.toBranch.name}</Td>
                <Td>{usd(p.feeCents)} {p.payer === 'RECEIVER' && !p.paidAt && <span className="text-xs font-bold text-amber-700">COD</span>}</Td>
                <Td><PaidVia payments={p.payments} /></Td>
                <Td>{dateTime(p.createdAt)}</Td>
              </tr>
            ))}
          </Table>
        )}
        {list.data && list.data.meta.total > list.data.meta.limit && (
          <div className="mt-3 flex items-center justify-end gap-2 text-sm">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</Button>
            <span>{page}</span>
            <Button size="sm" variant="secondary" disabled={page * list.data.meta.limit >= list.data.meta.total} onClick={() => setPage(page + 1)}>→</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
