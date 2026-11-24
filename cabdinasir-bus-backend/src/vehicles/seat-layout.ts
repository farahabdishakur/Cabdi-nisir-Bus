import { Errors } from '../common/errors';

/**
 * Qaabka kuraasta gaariga.
 * rows: saf kasta waa array; "D" = darawalka, null = meel bannaan (marin), string kale = lambarka kursiga.
 * front: kuraasta hore (front seat surcharge).
 */
export interface SeatLayout {
  rows: (string | null)[][];
  front?: string[];
}

export function parseSeatLayout(raw: unknown): { layout: SeatLayout; seats: string[] } {
  const l = raw as SeatLayout;
  if (!l || !Array.isArray(l.rows) || l.rows.length === 0) throw Errors.bad('INVALID_SEAT_LAYOUT', 'rows is required');
  const seats: string[] = [];
  for (const row of l.rows) {
    if (!Array.isArray(row)) throw Errors.bad('INVALID_SEAT_LAYOUT', 'each row must be an array');
    for (const cell of row) {
      if (cell === null || cell === 'D') continue;
      if (typeof cell !== 'string' || !/^[A-Za-z0-9]{1,4}$/.test(cell)) {
        throw Errors.bad('INVALID_SEAT_LAYOUT', `invalid seat label: ${String(cell)}`);
      }
      if (seats.includes(cell)) throw Errors.bad('INVALID_SEAT_LAYOUT', `duplicate seat: ${cell}`);
      seats.push(cell);
    }
  }
  if (seats.length === 0) throw Errors.bad('INVALID_SEAT_LAYOUT', 'layout has no seats');
  for (const f of l.front ?? []) {
    if (!seats.includes(f)) throw Errors.bad('INVALID_SEAT_LAYOUT', `front seat ${f} not in layout`);
  }
  return { layout: { rows: l.rows, front: l.front ?? [] }, seats };
}

/** Toyota Hiace caadi ah: darawal + 14 kursi. */
export const HIACE_14: SeatLayout = {
  rows: [
    ['D', null, '1', '2'],
    ['3', '4', null, '5'],
    ['6', '7', null, '8'],
    ['9', '10', null, '11'],
    ['12', '13', '14', null],
  ],
  front: ['1', '2'],
};
