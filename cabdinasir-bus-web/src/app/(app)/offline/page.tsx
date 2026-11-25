'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/lib/i18n';
import { removeItem, syncQueue, useOfflineQueue, useOnline, type OfflineItem } from '@/lib/offline';
import { OfflineReceipt } from '@/components/offline-receipt';
import { dateTime, phone, usd } from '@/lib/format';
import { Alert, Badge, Button, Card, PageHeader, Table, Td } from '@/components/ui';

/** Alaabta offline lagu diiwaangeliyay: sugaya → la diray (koodh dhab ah) · khalad (sabab + isku day mar kale). */
export default function OfflinePage() {
  const { t, err, codeText } = useI18n();
  const qc = useQueryClient();
  const online = useOnline();
  const queue = useOfflineQueue();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [printing, setPrinting] = useState<OfflineItem | null>(null);
  const print = (i: OfflineItem) => {
    setPrinting(i);
    setTimeout(() => window.print(), 200);
  };

  const sync = async () => {
    setBusy(true);
    setMsg('');
    try {
      const r = await syncQueue();
      if (r) setMsg(t('offline.syncResult', { synced: r.synced, failed: r.failed }));
      else setMsg(t('errors.NETWORK_ERROR'));
      qc.invalidateQueries({ queryKey: ['parcels'] });
    } catch (e) {
      setMsg(err(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('offline.title')} actions={<Button onClick={sync} loading={busy} disabled={!online}>⟳ {t('offline.syncNow')}</Button>} />
      <Alert tone={online ? 'blue' : 'yellow'}>{online ? t('offline.hintOnline') : t('offline.banner')}</Alert>
      {msg && <Alert tone="green">{msg}</Alert>}
      <Card>
        <Table head={[t('common.date'), t('common.status'), t('parcel.receiver'), t('parcel.to'), t('parcel.fee'), t('parcel.pin'), '']} empty={!queue.length}>
          {queue.map((i) => (
            <tr key={i.idempotencyKey}>
              <Td>{dateTime(i.offlineCreatedAt)}</Td>
              <Td>
                {i.status === 'synced' ? (
                  <Link href={`/parcels/${i.trackingCode}`}><Badge tone="green">✓ {i.trackingCode}</Badge></Link>
                ) : i.status === 'error' ? (
                  <span className="flex flex-col gap-1"><Badge tone="red">✕</Badge><span className="text-xs text-red-700 whitespace-normal">{codeText(i.error?.code ?? 'UNKNOWN', i.error?.message)}</span></span>
                ) : (
                  <Badge tone="yellow">⏳ {t('offline.pending')}</Badge>
                )}
              </Td>
              <Td>{i.parcel.receiverName}<br /><span className="text-xs text-gray-500">{phone(i.parcel.receiverPhone)}</span></Td>
              <Td>{i.toBranchName}</Td>
              <Td>≈ {usd(i.estimateCents)}</Td>
              <Td className="font-mono">{i.pickupPin}</Td>
              <Td>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => (i.status === 'synced' && i.parcelId ? window.open(`/print/parcel/${i.parcelId}?reprint=1`, '_blank') : print(i))}>🖨</Button>
                  {i.status !== 'pending' && <Button size="sm" variant="ghost" onClick={() => removeItem(i.idempotencyKey)}>✕</Button>}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
      {printing && <OfflineReceipt item={printing} />}
    </div>
  );
}
