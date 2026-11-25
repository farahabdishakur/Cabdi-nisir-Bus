'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { can } from '@/lib/permissions';
import { dateTime } from '@/lib/format';
import { Alert, Badge, Button, Card, Loading, PageHeader, Table, Td } from '@/components/ui';
import { ErrorAlert } from '@/components/domain';
import { BookingModal } from '@/components/booking-actions';
import type { Booking } from '@/lib/types';
import { useRouter } from 'next/navigation';

interface VoidRequest { id: string; entity: 'BOOKING' | 'PARCEL'; entityId: string; reason: string; refund: boolean; status: 'PENDING' | 'APPROVED' | 'REJECTED'; requestedById: string; createdAt: string; decisionNote: string | null }

/** Karraanigu void wuu codsadaa; Manager-ka laanta ayaa ansixiya / diida. */
export default function VoidRequestsPage() {
  const { t, err } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState<'PENDING' | ''>('PENDING');
  const list = useQuery({ queryKey: ['void-requests', status], queryFn: () => api<VoidRequest[]>('/void-requests', { query: { status } }) });
  const [error, setError] = useState('');
  const [booking, setBooking] = useState<Booking | null>(null);
  const router = useRouter();
  const openItem = async (r: VoidRequest) => {
    if (r.entity === 'PARCEL') return router.push(`/parcels/${r.entityId}`);
    try {
      setBooking(await api<Booking>(`/bookings/${r.entityId}`));
    } catch (e) {
      setError(err(e));
    }
  };

  const decide = async (id: string, action: 'approve' | 'reject') => {
    setError('');
    try {
      await api(`/void-requests/${id}/${action}`, { method: 'POST', body: {} });
      qc.invalidateQueries({ queryKey: ['void-requests'] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['parcels'] });
    } catch (e) {
      setError(err(e));
    }
  };

  return (
    <div>
      <PageHeader title={t('voidReq.title')} actions={
        <>
          <Button size="sm" variant={status === 'PENDING' ? 'navy' : 'secondary'} onClick={() => setStatus('PENDING')}>{t('voidReq.PENDING')}</Button>
          <Button size="sm" variant={status === '' ? 'navy' : 'secondary'} onClick={() => setStatus('')}>{t('booking.filterAll')}</Button>
        </>
      } />
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      <Card>
        {list.error ? <ErrorAlert error={list.error} /> : list.isLoading ? <Loading /> : (
          <Table head={[t('common.date'), '', t('common.reason'), t('booking.refund'), t('common.status'), '']} empty={!list.data?.length}>
            {list.data?.map((r) => (
              <tr key={r.id}>
                <Td>{dateTime(r.createdAt)}</Td>
                <Td><Button size="sm" variant="ghost" onClick={() => openItem(r)}>{r.entity === 'BOOKING' ? `🎫 ${t('booking.receipt')}` : `📦 ${t('parcel.tracking')}`} →</Button></Td>
                <Td className="whitespace-normal">{r.reason}</Td>
                <Td>{r.refund ? t('common.yes') : t('common.no')}</Td>
                <Td><Badge tone={r.status === 'PENDING' ? 'yellow' : r.status === 'APPROVED' ? 'green' : 'red'}>{t(`voidReq.${r.status}`)}</Badge></Td>
                <Td>
                  {r.status === 'PENDING' && can(user, 'void') && r.requestedById !== user?.id && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="success" onClick={() => decide(r.id, 'approve')}>{t('voidReq.approve')}</Button>
                      <Button size="sm" variant="secondary" onClick={() => decide(r.id, 'reject')}>{t('voidReq.reject')}</Button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <BookingModal booking={booking} onClose={() => setBooking(null)} />
    </div>
  );
}
