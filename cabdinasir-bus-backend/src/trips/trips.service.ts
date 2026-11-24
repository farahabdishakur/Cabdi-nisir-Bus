import { Injectable } from '@nestjs/common';
import { BookingStatus, ParcelStatus, Prisma, Role, TripStatus } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuthUser, isSuperAdmin } from '../common/auth-user';
import { Errors } from '../common/errors';
import { assertTransition, TRIP_TRANSITIONS } from '../common/state-machine';
import { businessDayRange } from '../common/time';
import { parseSeatLayout } from '../vehicles/seat-layout';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { BulkTripsDto, CreateTripDto, TripQuery, TripStatusDto, UpdateTripDto } from './trips.dto';

const VEHICLE_GAP_MS = 3 * 3600_000; // hal gaari laba safar oo 3 saac gudahood ah ma yeelan karo
const ACTIVE_TRIP: TripStatus[] = ['SCHEDULED', 'BOARDING', 'DEPARTED'];

export const tripInclude = {
  route: { include: { fromBranch: true, toBranch: true } },
  vehicle: true,
  driver: true,
} satisfies Prisma.TripInclude;

export type TripWithRoute = Prisma.TripGetPayload<{ include: typeof tripInclude }>;

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** Safar shaqaaluhu arki karaan: kuwa ka baxa ama u socda laantooda. */
  async getForUser(db: Tx | PrismaService, user: AuthUser, id: string): Promise<TripWithRoute> {
    const trip = await db.trip.findUnique({ where: { id }, include: tripInclude });
    if (!trip) throw Errors.notFound('Trip', id);
    if (user.role === Role.DRIVER) {
      const driver = await db.driver.findUnique({ where: { userId: user.id } });
      if (!driver || driver.id !== trip.driverId) throw Errors.forbidden('Not your trip');
      return trip;
    }
    if (!isSuperAdmin(user) && user.branchId !== trip.route.fromBranchId && user.branchId !== trip.route.toBranchId) {
      throw Errors.forbiddenBranch();
    }
    return trip;
  }

  get(user: AuthUser, id: string) {
    return this.getForUser(this.prisma, user, id);
  }

  async list(user: AuthUser, q: TripQuery) {
    const where: Prisma.TripWhereInput = { status: q.status };
    if (q.date) {
      const { start, end } = businessDayRange(q.date);
      where.departureAt = { gte: start, lt: end };
    }
    const route: Prisma.RouteWhereInput = { fromBranchId: q.fromBranchId, toBranchId: q.toBranchId };
    if (user.role === Role.DRIVER) {
      const driver = await this.prisma.driver.findUnique({ where: { userId: user.id } });
      where.driverId = driver?.id ?? '00000000-0000-0000-0000-000000000000';
    } else if (!isSuperAdmin(user)) {
      where.AND = [{ route: { OR: [{ fromBranchId: user.branchId! }, { toBranchId: user.branchId! }] } }];
    }
    where.route = route;
    const trips = await this.prisma.trip.findMany({ where, include: tripInclude, orderBy: { departureAt: 'asc' }, take: 200 });
    const counts = await this.prisma.booking.groupBy({
      by: ['tripId'],
      where: { tripId: { in: trips.map((t) => t.id) }, status: { not: BookingStatus.VOIDED } },
      _count: true,
    });
    const sold = new Map(counts.map((c) => [c.tripId, c._count]));
    return trips.map((t) => ({ ...t, seatsSold: sold.get(t.id) ?? 0, seatsAvailable: t.vehicle.capacity - (sold.get(t.id) ?? 0) }));
  }

  async create(user: AuthUser, dto: CreateTripDto) {
    const route = await this.prisma.route.findUnique({ where: { id: dto.routeId } });
    if (!route || !route.isActive) throw Errors.bad('ROUTE_INACTIVE', 'Route not found or inactive');
    if (!isSuperAdmin(user) && route.fromBranchId !== user.branchId) {
      throw Errors.forbidden('Managers can only create trips departing from their branch');
    }
    await this.checkVehicleDriver(dto.vehicleId, dto.driverId, new Date(dto.departureAt));
    return this.prisma.trip.create({ data: { ...dto, departureAt: new Date(dto.departureAt), createdById: user.id }, include: tripInclude });
  }

  /** Safaro badan: mid kasta si gooni ah ayaa loo hubiyaa; natiijada mid kasta way soo laabanaysaa. */
  async bulk(user: AuthUser, dto: BulkTripsDto) {
    const results = [];
    for (const t of dto.trips) {
      try {
        results.push({ ok: true, trip: await this.create(user, t) });
      } catch (e) {
        const err = e as { code?: string; message?: string };
        results.push({ ok: false, input: t, error: { code: err.code ?? 'ERROR', message: err.message } });
      }
    }
    return { created: results.filter((r) => r.ok).length, results };
  }

  async update(user: AuthUser, id: string, dto: UpdateTripDto) {
    const trip = await this.getForUser(this.prisma, user, id);
    this.assertManagerOf(user, trip.route.fromBranchId);
    if (!['SCHEDULED', 'BOARDING'].includes(trip.status)) throw Errors.conflict('TRIP_LOCKED', 'Trip already departed');
    if (dto.vehicleId && dto.vehicleId !== trip.vehicleId) {
      const booked = await this.prisma.booking.count({ where: { tripId: id, status: { not: 'VOIDED' } } });
      if (booked > 0) {
        const v = await this.prisma.vehicle.findUniqueOrThrow({ where: { id: dto.vehicleId } });
        const { seats } = parseSeatLayout(v.seatLayout);
        const used = await this.prisma.booking.findMany({ where: { tripId: id, status: { not: 'VOIDED' } }, select: { seatNo: true } });
        const missing = used.filter((b) => !seats.includes(b.seatNo)).map((b) => b.seatNo);
        if (missing.length) throw Errors.conflict('SEATS_NOT_IN_VEHICLE', 'New vehicle lacks booked seats', { seats: missing });
      }
    }
    const departureAt = dto.departureAt ? new Date(dto.departureAt) : trip.departureAt;
    await this.checkVehicleDriver(dto.vehicleId ?? trip.vehicleId, dto.driverId ?? trip.driverId, departureAt, id);
    return this.prisma.trip.update({ where: { id }, data: { ...dto, departureAt }, include: tripInclude });
  }

  async changeStatus(user: AuthUser, id: string, dto: TripStatusDto) {
    return this.prisma.$transaction(async (tx) => {
      const trip = await this.getForUser(tx, user, id);
      const to = dto.status;
      // ARRIVED/CLOSED: laanta loo socdo ayaa sameysa; inta kale: laanta laga baxayo
      const ownerBranch = to === 'ARRIVED' || to === 'CLOSED' ? trip.route.toBranchId : trip.route.fromBranchId;
      if (user.role === Role.CASHIER && to === 'BOARDING') {
        if (user.branchId !== trip.route.fromBranchId) throw Errors.forbiddenBranch();
      } else {
        this.assertManagerOf(user, ownerBranch);
      }
      assertTransition('Trip', TRIP_TRANSITIONS, trip.status, to);
      const data: Prisma.TripUpdateInput = { status: to };

      if (to === 'CANCELLED') {
        if (!dto.reason) throw Errors.bad('REASON_REQUIRED', 'Cancellation needs a reason');
        const active = await tx.booking.count({ where: { tripId: id, status: { not: 'VOIDED' } } });
        if (active > 0) throw Errors.conflict('TRIP_HAS_BOOKINGS', 'Void or move bookings before cancelling', { active });
        await this.moveParcels(tx, user, id, ParcelStatus.LOADED, ParcelStatus.REGISTERED, 'Trip cancelled', true);
      }
      if (to === 'DEPARTED') {
        data.manifestLockedAt = new Date();
        await tx.seatHold.deleteMany({ where: { tripId: id } });
        await this.moveParcels(tx, user, id, ParcelStatus.LOADED, ParcelStatus.IN_TRANSIT, 'Vehicle departed');
      }
      const updated = await tx.trip.update({ where: { id }, data, include: tripInclude });
      await this.audit.log(tx, user, `STATUS_${to}`, 'trips', id, { status: trip.status }, { status: to, reason: dto.reason });
      return updated;
    });
  }

  /** Khariidadda kuraasta: bannaan / la hayo (hold) / la iibiyay. */
  async seatMap(user: AuthUser, id: string) {
    const trip = await this.getForUser(this.prisma, user, id);
    const { layout, seats } = parseSeatLayout(trip.vehicle.seatLayout);
    const [bookings, holds] = await Promise.all([
      this.prisma.booking.findMany({ where: { tripId: id, status: { not: 'VOIDED' } } }),
      this.prisma.seatHold.findMany({ where: { tripId: id, expiresAt: { gt: new Date() } } }),
    ]);
    const showPassenger = user.role !== Role.CASHIER || user.branchId === trip.route.fromBranchId;
    const state = seats.map((seatNo) => {
      const b = bookings.find((x) => x.seatNo === seatNo);
      if (b) {
        return {
          seatNo,
          state: 'BOOKED' as const,
          booking: showPassenger ? { id: b.id, receiptNo: b.receiptNo, passengerName: b.passengerName, status: b.status } : undefined,
        };
      }
      const h = holds.find((x) => x.seatNo === seatNo);
      if (h) return { seatNo, state: h.userId === user.id ? ('HELD_BY_ME' as const) : ('HELD' as const), expiresAt: h.expiresAt };
      return { seatNo, state: 'AVAILABLE' as const };
    });
    return { tripId: id, status: trip.status, layout, seats: state, isFront: layout.front ?? [] };
  }

  async hold(user: AuthUser, id: string, seatNo: string) {
    return this.prisma.$transaction(async (tx) => {
      const trip = await this.getForUser(tx, user, id);
      this.assertCanSell(user, trip);
      const { seats } = parseSeatLayout(trip.vehicle.seatLayout);
      if (!seats.includes(seatNo)) throw Errors.bad('SEAT_NOT_FOUND', `Seat ${seatNo} does not exist`);
      const booked = await tx.booking.findFirst({ where: { tripId: id, seatNo, status: { not: 'VOIDED' } } });
      if (booked) throw Errors.conflict('SEAT_TAKEN', `Seat ${seatNo} is already sold`);
      const { seatHoldSeconds } = await this.settings.get(tx);
      const expiresAt = new Date(Date.now() + seatHoldSeconds * 1000);
      // Upsert atomic: kaliya haddii hold-ku dhacay ama aniga iska leeyahay
      const rows = await tx.$executeRaw`
        INSERT INTO "seat_holds" ("tripId", "seatNo", "userId", "expiresAt") VALUES (${id}, ${seatNo}, ${user.id}, ${expiresAt})
        ON CONFLICT ("tripId", "seatNo") DO UPDATE SET "userId" = EXCLUDED."userId", "expiresAt" = EXCLUDED."expiresAt"
        WHERE "seat_holds"."expiresAt" < now() OR "seat_holds"."userId" = EXCLUDED."userId"`;
      if (rows === 0) throw Errors.conflict('SEAT_HELD', `Seat ${seatNo} is being sold by someone else`);
      return { tripId: id, seatNo, expiresAt };
    });
  }

  async release(user: AuthUser, id: string, seatNo: string) {
    await this.prisma.seatHold.deleteMany({ where: { tripId: id, seatNo, userId: user.id } });
  }

  async manifest(user: AuthUser, id: string) {
    const trip = await this.getForUser(this.prisma, user, id);
    const [bookings, parcels] = await Promise.all([
      this.prisma.booking.findMany({
        where: { tripId: id, status: { not: 'VOIDED' } },
        select: { seatNo: true, passengerName: true, passengerPhone: true, receiptNo: true, status: true },
        orderBy: { seatNo: 'asc' },
      }),
      this.prisma.parcel.findMany({
        where: { tripId: id, status: { notIn: ['VOIDED'] } },
        select: {
          trackingCode: true, receiverName: true, receiverPhone: true, pieces: true, weightKg: true,
          isFragile: true, payer: true, feeCents: true, paidAt: true, status: true, category: { select: { nameSo: true } },
        },
        orderBy: { trackingCode: 'asc' },
      }),
    ]);
    return {
      trip,
      passengers: bookings.sort((a, b) => a.seatNo.localeCompare(b.seatNo, undefined, { numeric: true })),
      parcels,
      totals: {
        passengers: bookings.length,
        parcels: parcels.length,
        pieces: parcels.reduce((s, p) => s + p.pieces, 0),
        codToCollectCents: parcels.filter((p) => p.payer === 'RECEIVER' && !p.paidAt).reduce((s, p) => s + p.feeCents, 0),
      },
    };
  }

  /** Iibka tigidhka: laanta laga baxayo oo keliya (ama super admin), safar aan bixin. */
  assertCanSell(user: AuthUser, trip: TripWithRoute) {
    if (!isSuperAdmin(user) && user.branchId !== trip.route.fromBranchId) {
      throw Errors.forbidden('Tickets are sold at the departure branch');
    }
    if (!['SCHEDULED', 'BOARDING'].includes(trip.status)) throw Errors.conflict('TRIP_CLOSED_FOR_SALE', 'Trip is not open for sale');
  }

  private assertManagerOf(user: AuthUser, branchId: string) {
    if (isSuperAdmin(user)) return;
    if (user.role !== Role.BRANCH_MANAGER || user.branchId !== branchId) {
      throw Errors.forbidden('Only the branch manager can do this');
    }
  }

  private async checkVehicleDriver(vehicleId: string, driverId: string, at: Date, exceptTripId?: string) {
    const [vehicle, driver] = await Promise.all([
      this.prisma.vehicle.findUnique({ where: { id: vehicleId } }),
      this.prisma.driver.findUnique({ where: { id: driverId } }),
    ]);
    if (!vehicle?.isActive) throw Errors.bad('VEHICLE_INACTIVE', 'Vehicle not found or inactive');
    if (!driver?.isActive) throw Errors.bad('DRIVER_INACTIVE', 'Driver not found or inactive');
    const window = { gt: new Date(at.getTime() - VEHICLE_GAP_MS), lt: new Date(at.getTime() + VEHICLE_GAP_MS) };
    const clash = await this.prisma.trip.findFirst({
      where: {
        id: exceptTripId ? { not: exceptTripId } : undefined,
        status: { in: ACTIVE_TRIP },
        departureAt: window,
        OR: [{ vehicleId }, { driverId }],
      },
    });
    if (clash) throw Errors.conflict('SCHEDULE_CLASH', 'Vehicle or driver already has a trip at this time', { tripId: clash.id });
  }

  private async moveParcels(tx: Tx, user: AuthUser, tripId: string, from: ParcelStatus, to: ParcelStatus, note: string, detach = false) {
    const parcels = await tx.parcel.findMany({ where: { tripId, status: from }, select: { id: true } });
    if (!parcels.length) return;
    await tx.parcel.updateMany({ where: { tripId, status: from }, data: { status: to, ...(detach && { tripId: null }) } });
    await tx.parcelStatusHistory.createMany({
      data: parcels.map((p) => ({ parcelId: p.id, fromStatus: from, toStatus: to, userId: user.id, branchId: user.branchId, note })),
    });
  }
}
