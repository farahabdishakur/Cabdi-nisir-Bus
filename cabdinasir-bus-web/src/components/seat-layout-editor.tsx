'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { cx } from '@/lib/format';
import { Button } from './ui';

/** Qaabka backend-ka: rows (kursi = calaamad, 'D' = darawal, null = meel bannaan/waddo) + front (kuraasta hore, qiimo dheeri) */
export interface SeatLayoutValue {
  rows: (string | null)[][];
  front: string[];
}
type Cell = 'S' | 'D' | null;
type Tool = 'S' | null | 'D' | 'F';

/** Shax: bidix (kuraas) · waddo · midig (kuraas); safka hore: darawal + kuraas hore; safka dambe: buuxa */
export function grid(left: number, right: number, rows: number, frontSeats: number, fullBack: boolean): { cells: Cell[][]; front: Set<string> } {
  const cols = left + 1 + right;
  const cells: Cell[][] = [];
  const front = new Set<string>();
  const first: Cell[] = Array(cols).fill(null);
  first[0] = 'D';
  for (let i = 0; i < frontSeats; i++) {
    first[cols - 1 - i] = 'S';
    front.add(`0:${cols - 1 - i}`);
  }
  cells.push(first);
  for (let r = 0; r < rows; r++) {
    const last = fullBack && r === rows - 1;
    cells.push(Array.from({ length: cols }, (_, c) => (c === left && !last ? null : 'S')));
  }
  return { cells, front };
}

const TEMPLATES: { key: string; build: () => { cells: Cell[][]; front: Set<string> } }[] = [
  { key: 'hiace14', build: () => fromLayout({ rows: [['D', null, '1', '2'], ['3', '4', null, '5'], ['6', '7', null, '8'], ['9', '10', null, '11'], ['12', '13', '14', null]], front: ['1', '2'] }) },
  { key: 'noah7', build: () => fromLayout({ rows: [['D', null, '1'], ['2', '3', '4'], ['5', '6', '7']], front: ['1'] }) },
  { key: 'coaster29', build: () => grid(2, 2, 7, 0, true) },
  { key: 'bus45', build: () => grid(2, 2, 11, 0, true) },
];

export function fromLayout(l: SeatLayoutValue): { cells: Cell[][]; front: Set<string> } {
  const front = new Set<string>();
  const cells = l.rows.map((row, r) =>
    row.map((v, c) => {
      if (v === 'D') return 'D' as Cell;
      if (v === null) return null;
      if (l.front.includes(v)) front.add(`${r}:${c}`);
      return 'S' as Cell;
    }),
  );
  return { cells, front };
}

/** Lambarada: bidix → midig, kor → hoos (1, 2, 3 …) */
export function toLayout(cells: Cell[][], front: Set<string>): SeatLayoutValue {
  let n = 0;
  const frontLabels: string[] = [];
  const rows = cells.map((row, r) =>
    row.map((c, ci) => {
      if (c === 'D') return 'D';
      if (c !== 'S') return null;
      const label = String(++n);
      if (front.has(`${r}:${ci}`)) frontLabels.push(label);
      return label;
    }),
  );
  return { rows, front: frontLabels };
}

/**
 * Naqshadeeye kuraasta baabuurka: dooro nooc diyaar ah (Hiace, Noah, Coaster, Bus) ama samee mid gaar ah —
 * riix meel si aad u dhigto kursi / waddo / darawal / kursi hore. Lambaradu si toos ah ayay isu habeeyaan.
 */
export function SeatLayoutEditor({ value, onChange }: { value?: SeatLayoutValue | null; onChange: (v: SeatLayoutValue) => void }) {
  const { t } = useI18n();
  const init = useMemo(() => (value?.rows?.length ? fromLayout(value) : TEMPLATES[0].build()), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [cells, setCells] = useState<Cell[][]>(init.cells);
  const [front, setFront] = useState<Set<string>>(init.front);
  const [tool, setTool] = useState<Tool>('S');
  const layout = useMemo(() => toLayout(cells, front), [cells, front]);
  useEffect(() => onChange(layout), [layout]); // eslint-disable-line react-hooks/exhaustive-deps

  const seats = layout.rows.flat().filter((x) => x && x !== 'D').length;
  const cols = cells[0]?.length ?? 0;

  const apply = (r: number, c: number) => {
    const key = `${r}:${c}`;
    if (tool === 'F') {
      if (cells[r][c] !== 'S') return;
      const next = new Set(front);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setFront(next);
      return;
    }
    setCells(cells.map((row, ri) => row.map((v, ci) => {
      if (ri === r && ci === c) return v === tool ? null : tool;
      if (tool === 'D' && v === 'D') return null; // hal darawal
      return v;
    })));
    if (tool !== 'S' && front.has(key)) {
      const next = new Set(front);
      next.delete(key);
      setFront(next);
    }
  };
  const resize = (dr: number, dc: number) => {
    const nr = Math.min(16, Math.max(1, cells.length + dr));
    const nc = Math.min(7, Math.max(2, cols + dc));
    setCells(Array.from({ length: nr }, (_, r) => Array.from({ length: nc }, (_, c) => cells[r]?.[c] ?? (r === 0 ? null : 'S'))));
    setFront(new Set([...front].filter((k) => { const [r, c] = k.split(':').map(Number); return r < nr && c < nc; })));
  };
  const applyTemplate = (k: string) => {
    const tpl = TEMPLATES.find((x) => x.key === k)!.build();
    setCells(tpl.cells);
    setFront(tpl.front);
  };

  const tools: { k: Tool; icon: string; label: string }[] = [
    { k: 'S', icon: '🪑', label: t('seatEditor.seat') },
    { k: null, icon: '⬜', label: t('seatEditor.aisle') },
    { k: 'D', icon: '🛞', label: t('seatEditor.driver') },
    { k: 'F', icon: '⭐', label: t('seatEditor.front') },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-1 text-xs font-semibold text-gray-600">{t('seatEditor.templates')}</p>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map((x) => <Button key={x.key} type="button" size="sm" variant="secondary" onClick={() => applyTemplate(x.key)}>{t(`seatEditor.tpl.${x.key}`)}</Button>)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tools.map((x) => (
          <button key={String(x.k)} type="button" onClick={() => setTool(x.k)}
            className={cx('min-h-9 rounded-lg border px-2.5 text-sm font-semibold', tool === x.k ? 'border-navy bg-navy text-white' : 'border-gray-300 bg-white hover:bg-gray-50')}>
            {x.icon} {x.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="rounded-2xl border-2 border-gray-300 bg-gray-50 p-2" role="grid" aria-label={t('admin.seatLayout')}>
          <div className="mb-1 text-center text-[10px] font-semibold uppercase text-gray-400">▲ {t('seatEditor.frontOfBus')}</div>
          {cells.map((row, r) => (
            <div key={r} className="flex gap-1 py-0.5" role="row">
              {row.map((c, ci) => {
                const label = layout.rows[r][ci];
                const isFront = front.has(`${r}:${ci}`);
                return (
                  <button key={ci} type="button" role="gridcell" onClick={() => apply(r, ci)}
                    aria-label={c === 'S' ? `${t('seatEditor.seat')} ${label}` : c === 'D' ? t('seatEditor.driver') : t('seatEditor.aisle')}
                    className={cx('flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold transition',
                      c === 'S' && (isFront ? 'bg-amber-400 text-amber-950 ring-2 ring-amber-600' : 'bg-white text-navy ring-1 ring-gray-300 hover:ring-navy'),
                      c === 'D' && 'bg-gray-700 text-white',
                      c === null && 'border border-dashed border-gray-300 text-gray-300 hover:border-gray-400')}>
                    {c === 'S' ? label : c === 'D' ? '🛞' : ''}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-2xl font-black text-navy">{seats} <span className="text-sm font-semibold text-gray-600">{t('seatEditor.seats')}</span></p>
          {layout.front.length > 0 && <p className="text-amber-700">⭐ {t('seatEditor.frontCount', { n: layout.front.length })}</p>}
          <div className="grid grid-cols-[auto_auto_auto] items-center gap-1 text-xs">
            <span className="text-gray-600">{t('seatEditor.rows')}</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => resize(-1, 0)} aria-label="−">−</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => resize(1, 0)} aria-label="+">+</Button>
            <span className="text-gray-600">{t('seatEditor.cols')}</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => resize(0, -1)} aria-label="−">−</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => resize(0, 1)} aria-label="+">+</Button>
          </div>
          <p className="max-w-56 text-xs text-gray-500">{t('seatEditor.hint')}</p>
        </div>
      </div>
    </div>
  );
}
