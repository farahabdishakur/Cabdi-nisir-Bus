'use client';

import { useI18n } from '@/lib/i18n';
import { cx, time } from '@/lib/format';
import type { SeatMapData, SeatState } from '@/lib/types';

/**
 * Khariidadda kuraasta (UI_RULES §4): u eg gaariga dhabta ah.
 * 🟩 bannaan · 🟥 la iibiyay · 🟪 ballan · 🟨 adiga (hold) · ⬜ qof kale ayaa iibinaya.
 * Midab kaliya laguma kalsoona — qoraal/icon ayaa la socda.
 */
export function SeatMap({ data, onPick, selected }: { data: SeatMapData; onPick: (seat: SeatState) => void; selected?: string | null }) {
  const { t } = useI18n();
  const byNo = new Map(data.seats.map((s) => [s.seatNo, s]));
  const front = new Set(data.layout.front ?? []);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="inline-flex flex-col gap-2 rounded-3xl border-4 border-gray-300 bg-gray-50 p-3 sm:p-4">
        {data.layout.rows.map((row, ri) => (
          <div key={ri} className="flex gap-2">
            {row.map((cell, ci) => {
              if (cell === null) return <div key={ci} className="h-14 w-12 sm:h-16 sm:w-14" />;
              if (cell === 'D')
                return (
                  <div key={ci} className="flex h-14 w-12 flex-col items-center justify-center rounded-xl bg-gray-300 text-xs font-bold text-gray-700 sm:h-16 sm:w-14" title={t('seat.driver')}>
                    🛞
                    <span className="text-[10px]">{t('seat.driver')}</span>
                  </div>
                );
              const s = byNo.get(cell) ?? { seatNo: cell, state: 'AVAILABLE' as const };
              return <Seat key={ci} seat={s} isFront={front.has(cell)} selected={selected === cell} onClick={() => onPick(s)} />;
            })}
          </div>
        ))}
      </div>
      <Legend />
    </div>
  );
}

const STYLE: Record<SeatState['state'], string> = {
  AVAILABLE: 'bg-emerald-500 hover:bg-emerald-600 text-white',
  BOOKED: 'bg-red-600 text-white',
  RESERVED: 'bg-violet-600 text-white',
  HELD_BY_ME: 'bg-amber-400 text-gray-900',
  HELD: 'bg-gray-300 text-gray-600 cursor-not-allowed',
};

function Seat({ seat, isFront, selected, onClick }: { seat: SeatState; isFront: boolean; selected: boolean; onClick: () => void }) {
  const { t } = useI18n();
  const label =
    seat.state === 'AVAILABLE' ? t('seat.available')
    : seat.state === 'BOOKED' ? t('seat.booked')
    : seat.state === 'RESERVED' ? t('seat.reserved')
    : seat.state === 'HELD_BY_ME' ? t('seat.mine')
    : t('seat.held');
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={seat.state === 'HELD'}
      aria-label={`${t('booking.seat')} ${seat.seatNo}: ${label}`}
      title={seat.booking ? `${seat.booking.passengerName} · ${seat.booking.receiptNo}` : label}
      className={cx(
        'relative flex h-14 w-12 flex-col items-center justify-center rounded-xl text-base font-bold shadow-sm transition sm:h-16 sm:w-14',
        STYLE[seat.state],
        selected && 'ring-4 ring-navy ring-offset-2',
      )}
    >
      {seat.seatNo}
      <span className="text-[9px] font-medium leading-tight">
        {seat.state === 'RESERVED' && seat.reservedUntil ? time(seat.reservedUntil) : isFront ? t('seat.front') : ''}
      </span>
    </button>
  );
}

function Legend() {
  const { t } = useI18n();
  const items: [string, string][] = [
    ['bg-emerald-500', t('seat.available')],
    ['bg-red-600', t('seat.booked')],
    ['bg-violet-600', t('seat.reserved')],
    ['bg-amber-400', t('seat.mine')],
    ['bg-gray-300', t('seat.held')],
  ];
  return (
    <ul className="flex flex-wrap justify-center gap-3 text-xs text-gray-600">
      {items.map(([c, l]) => (
        <li key={l} className="flex items-center gap-1">
          <span className={cx('h-3 w-3 rounded', c)} /> {l}
        </li>
      ))}
    </ul>
  );
}
