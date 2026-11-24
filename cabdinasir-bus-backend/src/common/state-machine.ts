import { BookingStatus, ParcelStatus, TripStatus } from '@prisma/client';
import { Errors } from './errors';

/** State machines (BUSINESS_RULES §5). Status si toos ah looma beddelo — mar walba halkan ayaa la maraa. */
export const TRIP_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  SCHEDULED: ['BOARDING', 'DEPARTED', 'CANCELLED'],
  BOARDING: ['DEPARTED', 'CANCELLED'],
  DEPARTED: ['ARRIVED'],
  ARRIVED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  RESERVED: ['CONFIRMED', 'VOIDED', 'EXPIRED'],
  CONFIRMED: ['BOARDED', 'VOIDED'],
  BOARDED: [],
  VOIDED: [],
  EXPIRED: [],
};

export const PARCEL_TRANSITIONS: Record<ParcelStatus, ParcelStatus[]> = {
  REGISTERED: ['LOADED', 'VOIDED'],
  LOADED: ['REGISTERED', 'IN_TRANSIT'], // REGISTERED = laga dejiyay (unload) ka hor bixitaanka
  IN_TRANSIT: ['ARRIVED', 'MISSING', 'DAMAGED'],
  ARRIVED: ['DELIVERED', 'MISSING', 'DAMAGED'],
  DELIVERED: [],
  VOIDED: [],
  MISSING: ['ARRIVED'], // la helay
  DAMAGED: ['DELIVERED'],
};

export function assertTransition<S extends string>(entity: string, map: Record<S, S[]>, from: S, to: S) {
  if (!map[from].includes(to)) throw Errors.invalidState(entity, from, to);
}
