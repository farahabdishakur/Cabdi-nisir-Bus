'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { dateTime, phone, time, usd } from '@/lib/format';
import type { Booking, BookingStatus, Method, Paged } from '@/lib/types';
import { Button, Card, Input, Loading, PageHeader, Select, Table, Td } from '@/components/ui';
import { BookingStatusBadge, PaidVia } from '@/components/domain';
import { BookingModal } from '@/components/booking-actions';

export default function BookingsPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState<BookingStatus | ''>('RESERVED');
  const [paidVia, setPaidVia] = useState<Method | ''>('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Booking | null>(null);

  const list = useQuery({
    queryKey: ['bookings', status, paidVia, search, page],
    queryFn: () => api<Paged<Booking>>('/bookings', { query: { status, paidVia, q: search, page, limit: 30 } }),
    refetchInterval: status === 'RESERVED' ? 30_000 : false,
  });

  const tabs: [BookingStatus | '', string][] = [
    ['RESERVED', t('booking.reservations')],
    ['CONFIRMED', t('bookingStatus.CONFIRMED')],
    ['', t('booking.filterAll')],
  ];

  return (
    <div>
      <PageHeader title={t('nav.bookings')} />
      <div className="mb-3 flex flex-wrap gap-2">
        {tabs.map(([s, label]) => (
          <Button key={label} variant={status === s ? 'navy' : 'secondary'} size="sm" onClick={() => { setStatus(s); setPage(1); }}>
            {label}
          </Button>
        ))}
        <Select value={paidVia} onChange={(e) => setPaidVia(e.target.value as Method | '')} className="max-w-40">
          <option value="">{t('payment.paidVia')}: —</option>
          <option value="CASH">{t('method.CASH')}</option>
          <option value="ZAAD">{t('method.ZAAD')}</option>
          <option value="EDAHAB">{t('method.EDAHAB')}</option>
        </Select>
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q);
            setPage(1);
          }}
        >
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${t('booking.receipt')} / ${t('common.phone')} / ${t('common.name')}`} />
          <Button type="submit" variant="secondary">
            {t('common.search')}
          </Button>
        </form>
      </div>

      <Card>
        {list.isLoading ? (
          <Loading />
        ) : (
          <>
            <Table head={[t('booking.receipt'), t('common.status'), t('booking.passenger'), t('trips.route'), t('booking.seat'), t('booking.price'), t('payment.paidVia'), status === 'RESERVED' ? t('booking.reservedUntil') : t('common.date')]} empty={!list.data?.data.length}>
              {list.data?.data.map((b) => (
                <tr key={b.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setOpen(b)}>
                  <Td className="font-mono font-semibold">{b.receiptNo}{b.paperTicketNo && <span className="block text-xs text-red-700">✍️ {b.paperTicketNo}</span>}</Td>
                  <Td>
                    <BookingStatusBadge s={b.status} />
                  </Td>
                  <Td>
                    {b.passengerName}
                    <br />
                    <span className="text-xs text-gray-500">{phone(b.passengerPhone)}</span>
                  </Td>
                  <Td>
                    {b.trip ? `${time(b.trip.departureAt)} ${b.trip.route.fromBranch.name} → ${b.trip.route.toBranch.name}` : '—'}
                  </Td>
                  <Td className="font-bold">{b.seatNo}</Td>
                  <Td>{usd(b.priceCents)}</Td>
                  <Td>
                    <PaidVia payments={b.payments} />
                  </Td>
                  <Td className={b.status === 'RESERVED' ? 'font-semibold text-violet-700' : ''}>{dateTime(b.status === 'RESERVED' ? b.reservedUntil : b.createdAt)}</Td>
                </tr>
              ))}
            </Table>
            {list.data && list.data.meta.total > list.data.meta.limit && (
              <div className="mt-3 flex items-center justify-end gap-2 text-sm">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  ←
                </Button>
                <span>
                  {page} / {Math.ceil(list.data.meta.total / list.data.meta.limit)}
                </span>
                <Button size="sm" variant="secondary" disabled={page * list.data.meta.limit >= list.data.meta.total} onClick={() => setPage(page + 1)}>
                  →
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
      <BookingModal booking={open} onClose={() => setOpen(null)} />
    </div>
  );
}
