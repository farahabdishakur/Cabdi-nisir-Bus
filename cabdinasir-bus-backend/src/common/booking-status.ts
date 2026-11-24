import { BookingStatus, Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';

/** Kursiga waa la qabtay: ballan (lacag la'aan) + la bixiyay + la fuulay. */
export const SEAT_TAKEN: BookingStatus[] = ['RESERVED', 'CONFIRMED', 'BOARDED'];
/** Tigidh dhab ah (lacag la bixiyay) — warbixinada & dakhliga. */
export const SOLD: BookingStatus[] = ['CONFIRMED', 'BOARDED'];

export const seatTaken = { in: SEAT_TAKEN } satisfies Prisma.EnumBookingStatusFilter;
export const sold = { in: SOLD } satisfies Prisma.EnumBookingStatusFilter;

/**
 * Ballamaha wakhtigoodu dhacay → EXPIRED (kursigu wuu furmayaa).
 * Waxaa la wacaa ka hor hawl kasta oo kursi (seat map, hold, iib, ballan) + job daqiiqad kasta —
 * sidaa darteed kursigu isla markiiba wuu furmaa xitaa haddii job-ku daaho.
 */
export async function expireReservations(db: Tx | PrismaService, where: Prisma.BookingWhereInput = {}) {
  const due = await db.booking.findMany({
    where: { ...where, status: 'RESERVED', reservedUntil: { lte: new Date() } },
    select: { id: true, tripId: true, branchId: true },
  });
  if (!due.length) return [];
  await db.booking.updateMany({ where: { id: { in: due.map((d) => d.id) }, status: 'RESERVED' }, data: { status: 'EXPIRED' } });
  return due;
}
