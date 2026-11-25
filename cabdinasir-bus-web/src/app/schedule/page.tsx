'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { time, todayISO, usd } from '@/lib/format';
import { Alert, Card, Input, Loading } from '@/components/ui';
import { ErrorAlert } from '@/components/domain';
import { PublicShell } from '@/components/public-shell';

interface PublicTrip { departureAt: string; from: string; to: string; priceCents: number; seatsAvailable: number; status: string }

/** Jadwalka safarada + kuraasta bannaan (macmiilku wuu arkaa ka hor intuu iman / wici). Online booking ma jiro. */
export default function SchedulePage() {
  const { t } = useI18n();
  const [day, setDay] = useState(todayISO());
  const trips = useQuery({ queryKey: ['public', 'trips', day], queryFn: () => api<PublicTrip[]>('/public/trips', { query: { date: day } }), refetchInterval: 60_000 });

  return (
    <PublicShell>
      <Card title={t('public.schedule')} actions={<Input type="date" value={day} min={todayISO()} onChange={(e) => setDay(e.target.value)} className="max-w-44" />}>
        {trips.error ? <ErrorAlert error={trips.error} /> : trips.isLoading ? <Loading /> : !trips.data?.length ? (
          <p className="text-sm text-gray-500">{t('public.noTrips')}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {trips.data.map((x, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-xl font-black text-navy">{time(x.departureAt)}</p>
                  <p className="font-semibold">{x.from} → {x.to}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{usd(x.priceCents)}</p>
                  <p className={x.seatsAvailable > 0 ? 'text-sm font-semibold text-emerald-700' : 'text-sm font-semibold text-red-700'}>
                    {x.seatsAvailable > 0 ? t('public.seatsLeft', { n: x.seatsAvailable }) : t('public.full')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="mt-4"><Alert tone="blue">{t('public.howToBook')}</Alert></div>
    </PublicShell>
  );
}
