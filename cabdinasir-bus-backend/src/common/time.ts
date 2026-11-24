/**
 * Waqtiga ganacsiga: Africa/Mogadishu = UTC+3 (DST ma leh).
 * DB-ga waa UTC; "maalinta" warbixinada waxaa loo xisaabiyaa UTC+3.
 */
export const BUSINESS_UTC_OFFSET_HOURS = 3;
const OFFSET_MS = BUSINESS_UTC_OFFSET_HOURS * 3600_000;

/** 'YYYY-MM-DD' ee maalinta ganacsiga ee waqti la siiyay. */
export function businessDate(d: Date = new Date()): string {
  return new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** [start, end) UTC ee maalin ganacsi ('YYYY-MM-DD'). */
export function businessDayRange(date: string): { start: Date; end: Date } {
  const start = new Date(new Date(`${date}T00:00:00.000Z`).getTime() - OFFSET_MS);
  return { start, end: new Date(start.getTime() + 86400_000) };
}

/** [start, end) UTC ee muddo maalmo ganacsi ah (labadaba ku jiraan). */
export function businessRange(from: string, to: string): { start: Date; end: Date } {
  return { start: businessDayRange(from).start, end: businessDayRange(to).end };
}

/** "24/11 14:30" — waqtiga ganacsiga (SMS). */
export function formatBusinessTime(d: Date): string {
  const x = new Date(d.getTime() + OFFSET_MS).toISOString();
  return `${x.slice(8, 10)}/${x.slice(5, 7)} ${x.slice(11, 16)}`;
}
