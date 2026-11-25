'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { dateTime, phone, usd } from '@/lib/format';
import type { Booking, Paged, Parcel } from '@/lib/types';
import { Button, Card, Input, Loading, PageHeader } from '@/components/ui';
import { BookingStatusBadge, ErrorAlert, ParcelStatusBadge } from '@/components/domain';
import { BookingModal } from '@/components/booking-actions';

/** Raadin guud (topbar / "/"): rasiid, koodh alaab, taleefan ama magac → tigidho + alaab. */
export default function SearchPage() {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState<Booking | null>(null);

  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('q') ?? '';
    setQ(v);
    setTerm(v);
  }, []);

  const bookings = useQuery({ queryKey: ['bookings', 'search', term], queryFn: () => api<Paged<Booking>>('/bookings', { query: { q: term, limit: 20 } }), enabled: term.length >= 2 });
  const parcels = useQuery({ queryKey: ['parcels', 'search', term], queryFn: () => api<Paged<Parcel>>('/parcels', { query: { q: term, limit: 20 } }), enabled: term.length >= 2 });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('common.search')} />
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()); window.history.replaceState(null, '', `/search?q=${encodeURIComponent(q.trim())}`); }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search.placeholder')} autoFocus />
        <Button type="submit" variant="navy">{t('common.search')}</Button>
      </form>
      {term.length >= 2 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={`🎫 ${t('nav.bookings')} (${bookings.data?.meta.total ?? 0})`}>
            {bookings.error ? <ErrorAlert error={bookings.error} /> : bookings.isLoading ? <Loading /> : (
              <ul className="divide-y divide-gray-100">
                {bookings.data?.data.map((b) => (
                  <li key={b.id}>
                    <button className="flex w-full items-center justify-between gap-2 py-2 text-left hover:bg-gray-50" onClick={() => setOpen(b)}>
                      <span>
                        <span className="font-mono font-semibold">{b.receiptNo}</span> · {b.passengerName} · {phone(b.passengerPhone)}
                        <br />
                        <span className="text-xs text-gray-500">{b.trip ? `${dateTime(b.trip.departureAt)} ${b.trip.route.fromBranch.name} → ${b.trip.route.toBranch.name}` : ''} · {t('booking.seat')} {b.seatNo} · {usd(b.priceCents)}</span>
                      </span>
                      <BookingStatusBadge s={b.status} />
                    </button>
                  </li>
                ))}
                {!bookings.data?.data.length && <li className="py-2 text-sm text-gray-500">{t('common.empty')}</li>}
              </ul>
            )}
          </Card>
          <Card title={`📦 ${t('nav.parcels')} (${parcels.data?.meta.total ?? 0})`}>
            {parcels.error ? <ErrorAlert error={parcels.error} /> : parcels.isLoading ? <Loading /> : (
              <ul className="divide-y divide-gray-100">
                {parcels.data?.data.map((p) => (
                  <li key={p.id}>
                    <Link href={`/parcels/${p.trackingCode}`} className="flex items-center justify-between gap-2 py-2 hover:bg-gray-50">
                      <span>
                        <span className="font-mono font-semibold">{p.trackingCode}</span> · {p.receiverName} · {phone(p.receiverPhone)}
                        <br />
                        <span className="text-xs text-gray-500">{p.fromBranch.name} → {p.toBranch.name} · {dateTime(p.createdAt)}</span>
                      </span>
                      <ParcelStatusBadge s={p.status} />
                    </Link>
                  </li>
                ))}
                {!parcels.data?.data.length && <li className="py-2 text-sm text-gray-500">{t('common.empty')}</li>}
              </ul>
            )}
          </Card>
        </div>
      )}
      <BookingModal booking={open} onClose={() => setOpen(null)} />
    </div>
  );
}
