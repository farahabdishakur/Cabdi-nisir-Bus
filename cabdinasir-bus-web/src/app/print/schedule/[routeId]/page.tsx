'use client';

import { use } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { phone, time } from '@/lib/format';
import type { DispatchBoard, DispatchEntry } from '@/lib/types';
import { PrintShell } from '@/components/print';

/**
 * Jadwalka safarka maalinta (A4 / sawir la wadaago — sida boorka shirkadda):
 * kala horreynta 1…N · lambarka baska · darawalka + taleefankiisa → qof kasta wuu arkaa kan xiga.
 */
export default function SchedulePrint({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = use(params);
  const date = useSearchParams().get('date') ?? undefined;
  const { t } = useI18n();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['print', 'schedule', routeId, date], queryFn: () => api<DispatchBoard>(`/dispatch/${routeId}`, { query: date ? { date } : undefined }), enabled: !!user });
  const b = q.data;
  const day = b ? new Date(`${b.date}T12:00:00Z`) : null;
  const rows: DispatchEntry[] = b
    ? [
        ...b.entries.filter((e) => e.status === 'DEPARTED' && e.serviceDate === b.date).sort((x, y) => (x.departedAt ?? '').localeCompare(y.departedAt ?? '')),
        ...b.entries.filter((e) => e.status === 'LOADING'),
        ...b.entries.filter((e) => e.status === 'WAITING').sort((x, y) => x.position - y.position),
      ]
    : [];
  return (
    <PrintShell ready={!!b} error={q.error} autoPrint={false}>
      {b && day && (
        <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border-4 border-red-600 bg-white text-black [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
          <div className="flex items-center gap-4 bg-red-600 px-5 py-4 text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" className="h-16 w-16 rounded-full border-2 border-white bg-white" />
            <div>
              <p className="text-3xl font-black tracking-tight">Cabdinasir Bus</p>
              <p className="text-lg font-bold italic">{t('schedule.title')}</p>
            </div>
          </div>
          <div className="border-b-4 border-navy bg-navy px-5 py-2 text-center text-xl font-black text-white">
            📅 {b.date.slice(8, 10)}.{b.date.slice(5, 7)}.{b.date.slice(2, 4)} — {t(`schedule.d${day.getUTCDay()}`).toUpperCase()} · {b.route.from.name.toUpperCase()} → {b.route.to.name.toUpperCase()}
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 text-left text-xs uppercase text-gray-600">
                <th className="px-3 py-1.5">#</th><th className="px-3 py-1.5">{t('schedule.bus')}</th><th className="px-3 py-1.5">{t('trips.driver')}</th><th className="px-3 py-1.5">{t('common.phone')}</th><th className="px-3 py-1.5 text-right">{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <tr key={e.id} className="border-b border-red-100">
                  <td className="px-3 py-1.5"><span className="inline-flex h-8 w-10 items-center justify-center rounded-md bg-red-600 text-base font-black text-white">{i + 1}.</span></td>
                  <td className="px-3 py-1.5">
                    <span className="whitespace-nowrap text-2xl font-black text-navy">{e.vehicle.fleetNo ? `${e.vehicle.fleetNo}${/^\d+$/.test(e.vehicle.fleetNo) ? 'ka' : ''}` : e.vehicle.plate}</span>
                    {e.vehicle.fleetNo && <span className="ml-2 font-mono text-xs text-gray-500">{e.vehicle.plate}</span>}
                  </td>
                  <td className="px-3 py-1.5 font-semibold">{e.driver.name}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono">{phone(e.driver.phone)}</td>
                  <td className="px-3 py-1.5 text-right text-sm">
                    {e.status === 'DEPARTED' ? <span className="font-semibold text-emerald-700">✓ {time(e.departedAt)}</span> : e.status === 'LOADING' ? <span className="font-bold text-red-600">🟢 {t('schedule.loading')}</span> : <span className="text-gray-500">{t('schedule.waiting')}</span>}
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">{t('dispatch.queueEmpty')}</td></tr>}
            </tbody>
          </table>
          <div className="flex items-center justify-between bg-red-600 px-5 py-3 text-white">
            <p className="text-lg font-black italic">{t('schedule.slogan')}</p>
            <p className="text-sm font-bold">{b.route.from.phones?.join(' / ')}</p>
          </div>
        </div>
      )}
    </PrintShell>
  );
}
