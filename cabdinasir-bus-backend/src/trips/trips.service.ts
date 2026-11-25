import { Injectable } from '@nestjs/common';
import { ParcelStatus, Prisma, Role, TripStatus } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuthUser, isSuperAdmin } from '../common/auth-user';
import { Errors } from '../common/errors';
import { assertTransition, TRIP_TRANSITIONS } from '../common/state-machine';
import { businessDayRange } from '../common/time';
import { parseSeatLayout } from '../vehicles/seat-layout';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { BranchDirectory } from '../common/branch-directory.service';
import { DriverPayService } from '../driver-pay/driver-pay.service';
import { expireReservations, seatTaken, sold } from '../common/booking-status';
import { BulkTripsDto, CreateTripDto, MoveBookingsDto, TripQuery, TripStatusDto, UpdateTripDto } from './trips.dto';

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
    private readonly dir: BranchDirectory,
    private readonly driverPay: DriverPayService,
  ) {}

  /** Safar shaqaaluhu arki karaan: kuwa ka baxa ama u socda magaaladooda (Boorama: 2 laamood way wadaagaan). */
  async getForUser(db: Tx | PrismaService, user: AuthUser, id: string): Promise<TripWithRoute> {
    const trip = await db.trip.findUnique({ where: { id }, include: tripInclude });
    if (!trip) throw Errors.notFound('Trip', id);
    if (user.role === Role.DRIVER) {
      const driver = await db.driver.findUnique({ where: { userId: user.id } });
      if (!driver || driver.id !== trip.driverId) throw Errors.forbidden('Not your trip');
      return trip;
    }
    if (!isSuperAdmin(user)) {
      await this.dir.ensure(user.branchId, trip.route.fromBranchId, trip.route.toBranchId);
      if (!this.dir.sameCity(user.branchId, trip.route.fromBranchId) && !this.dir.sameCity(user.branchId, trip.route.toBranchId)) {
        throw Errors.forbiddenBranch();
      }
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
      await this.dir.ensure(user.branchId);
      const mates = this.dir.mates(user.branchId);
      where.AND = [{ route: { OR: [{ fromBranchId: { in: mates } }, { toBranchId: { in: mates } }] } }];
    }
    where.route = route;
    const trips = await this.prisma.trip.findMany({ where, include: tripInclude, orderBy: { departureAt: 'asc' }, take: 200 });
    const counts = await this.prisma.booking.groupBy({
      by: ['tripId'],
      where: { tripId: { in: trips.map((t) => t.id) }, status: seatTaken },
      _count: true,
    });
    const reserved = await this.prisma.booking.groupBy({
      by: ['tripId'],
      where: { tripId: { in: trips.map((t) => t.id) }, status: 'RESERVED', reservedUntil: { gt: new Date() } },
      _count: true,
    });
    const taken = new Map(counts.map((c) => [c.tripId, c._count]));
    const res = new Map(reserved.map((c) => [c.tripId, c._count]));
    return trips.map((t) => ({
      ...t,
      seatsReserved: res.get(t.id) ?? 0,
      seatsSold: (taken.get(t.id) ?? 0) - (res.get(t.id) ?? 0),
      seatsAvailable: t.vehicle.capacity - (taken.get(t.id) ?? 0),
    }));
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
      const booked = await this.prisma.booking.count({ where: { tripId: id, status: seatTaken } });
      if (booked > 0) {
        const v = await this.prisma.vehicle.findUniqueOrThrow({ where: { id: dto.vehicleId } });
        const { seats } = parseSeatLayout(v.seatLayout);
        const used = await this.prisma.booking.findMany({ where: { tripId: id, status: seatTaken }, select: { seatNo: true } });
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
        if (!this.dir.sameCity(user.branchId, trip.route.fromBranchId)) throw Errors.forbiddenBranch();
      } else {
        // Gaarigu marka uu yimaado magaalada: maamulaha laan kasta oo magaaladaas ah wuu xaqiijin karaa
        this.assertManagerOf(user, ownerBranch, to === 'ARRIVED' || to === 'CLOSED');
      }
      assertTransition('Trip', TRIP_TRANSITIONS, trip.status, to);
      const data: Prisma.TripUpdateInput = { status: to };

      if (to === 'CANCELLED') {
        if (!dto.reason) throw Errors.bad('REASON_REQUIRED', 'Cancellation needs a reason');
        // ballamaha (lacag la'aan) si toos ah ayaa loo joojiyaa; tigidhada la bixiyay waa in la void-gareeyo ama la raro
        await tx.booking.updateMany({ where: { tripId: id, status: 'RESERVED' }, data: { status: 'EXPIRED' } });
        const active = await tx.booking.count({ where: { tripId: id, status: sold } });
        if (active > 0) throw Errors.conflict('TRIP_HAS_BOOKINGS', 'Void or move bookings before cancelling', { active });
        await this.moveParcels(tx, user, id, ParcelStatus.LOADED, ParcelStatus.REGISTERED, 'Trip cancelled', true);
      }
      if (to === 'DEPARTED') {
        data.manifestLockedAt = new Date();
        await tx.seatHold.deleteMany({ where: { tripId: id } });
        // ballan aan la bixin = ma iman (no-show) → kursigu wuu dhacay
        await tx.booking.updateMany({ where: { tripId: id, status: 'RESERVED' }, data: { status: 'EXPIRED' } });
        await this.moveParcels(tx, user, id, ParcelStatus.LOADED, ParcelStatus.IN_TRANSIT, 'Vehicle departed');
      }
      if (to === 'ARRIVED') {
        // safarka waa dhammaaday → kasbashada darawalka si toos ah (xeerkiisa: safar / boqolley)
        await this.driverPay.accrueTrip(tx, id);
      }
      const updated = await tx.trip.update({ where: { id }, data, include: tripInclude });
      await this.audit.log(tx, user, `STATUS_${to}`, 'trips', id, { status: trip.status }, { status: to, reason: dto.reason });
      return updated;
    });
  }

  /**
   * Gaari xumaaday / safar la joojinayo: rakaabka oo dhan u rar safar kale.
   * Kursigiisii haddii uu bannaan yahay waa la siiyaa, haddii kale kursiga ugu horreeya ee bannaan.
   * Qiimaha isma beddelo (shirkadda ayaa sabab u ah). Alaabta la raray sidoo kale way raacaysaa.
   */
  async moveBookings(user: AuthUser, id: string, dto: MoveBookingsDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      const src = await this.getForUser(tx, user, id);
      this.assertManagerOf(user, src.route.fromBranchId);
      if (!['SCHEDULED', 'BOARDING'].includes(src.status)) throw Errors.conflict('TRIP_LOCKED', 'Source trip already departed');
      if (dto.targetTripId === id) throw Errors.bad('SAME_TRIP', 'Choose a different trip');
      const dst = await this.getForUser(tx, user, dto.targetTripId);
      const sameWay =
        this.dir.sameCity(dst.route.fromBranchId, src.route.fromBranchId) && this.dir.sameCity(dst.route.toBranchId, src.route.toBranchId);
      if (!sameWay) throw Errors.bad('TRIP_ROUTE_MISMATCH', 'Target trip must go between the same cities');
      if (!['SCHEDULED', 'BOARDING'].includes(dst.status)) throw Errors.conflict('TRIP_CLOSED_FOR_SALE', 'Target trip is not open');

      const moving = await tx.booking.findMany({ where: { tripId: id, status: seatTaken }, orderBy: { createdAt: 'asc' } });
      const { seats } = parseSeatLayout(dst.vehicle.seatLayout);
      const taken = new Set((await tx.booking.findMany({ where: { tripId: dst.id, status: seatTaken }, select: { seatNo: true } })).map((b) => b.seatNo));
      const held = new Set((await tx.seatHold.findMany({ where: { tripId: dst.id, expiresAt: { gt: new Date() } } })).map((h) => h.seatNo));
      const free = seats.filter((s) => !taken.has(s) && !held.has(s));
      if (free.length < moving.length) {
        throw Errors.conflict('NOT_ENOUGH_SEATS', 'Target trip does not have enough free seats', { needed: moving.length, free: free.length });
      }
      const mapping: { bookingId: string; receiptNo: string; from: string; to: string }[] = [];
      // marka hore kuwa kursigoodii bannaan yahay
      const wantsSame = moving.filter((b) => free.includes(b.seatNo));
      const others = moving.filter((b) => !free.includes(b.seatNo));
      const assign = (seat: string) => free.splice(free.indexOf(seat), 1)[0];
      const plan = [...wantsSame.map((b) => ({ b, seat: assign(b.seatNo) })), ...others.map((b) => ({ b, seat: '' }))];
      for (const p of plan) if (!p.seat) p.seat = free.shift()!;
      for (const { b, seat } of plan) {
        await tx.booking.update({ where: { id: b.id }, data: { tripId: dst.id, seatNo: seat, transferredFromTripId: id } });
        mapping.push({ bookingId: b.id, receiptNo: b.receiptNo, from: b.seatNo, to: seat });
      }
      const parcels = await tx.parcel.findMany({ where: { tripId: id, status: 'LOADED' }, select: { id: true } });
      await tx.parcel.updateMany({ where: { tripId: id, status: 'LOADED' }, data: { tripId: dst.id } });
      await this.audit.log(tx, user, 'MOVE_BOOKINGS', 'trips', id, { tripId: id }, { targetTripId: dst.id, reason: dto.reason, bookings: mapping.length, parcels: parcels.length });
      return { fromTripId: id, toTripId: dst.id, moved: mapping, parcelsMoved: parcels.length, branchIds: [src.route.fromBranchId, src.route.toBranchId] };
    });
    return result;
  }

  /** Khariidadda kuraasta: bannaan / la hayo (hold) / la iibiyay. */
  async seatMap(user: AuthUser, id: string) {
    const trip = await this.getForUser(this.prisma, user, id);
    await expireReservations(this.prisma, { tripId: id });
    const { layout, seats } = parseSeatLayout(trip.vehicle.seatLayout);
    const [bookings, holds] = await Promise.all([
      this.prisma.booking.findMany({ where: { tripId: id, status: seatTaken } }),
      this.prisma.seatHold.findMany({ where: { tripId: id, expiresAt: { gt: new Date() } } }),
    ]);
    const showPassenger = user.role !== Role.CASHIER || this.dir.sameCity(user.branchId, trip.route.fromBranchId);
    const state = seats.map((seatNo) => {
      const b = bookings.find((x) => x.seatNo === seatNo);
      if (b) {
        return {
          seatNo,
          state: b.status === 'RESERVED' ? ('RESERVED' as const) : ('BOOKED' as const),
          ...(b.status === 'RESERVED' && { reservedUntil: b.reservedUntil }),
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
      await expireReservations(tx, { tripId: id });
      const booked = await tx.booking.findFirst({ where: { tripId: id, seatNo, status: seatTaken } });
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
        where: { tripId: id, status: seatTaken },
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
        passengers: bookings.filter((b) => b.status !== 'RESERVED').length,
        reservedUnpaid: bookings.filter((b) => b.status === 'RESERVED').length,
        parcels: parcels.length,
        pieces: parcels.reduce((s, p) => s + p.pieces, 0),
        codToCollectCents: parcels.filter((p) => p.payer === 'RECEIVER' && !p.paidAt).reduce((s, p) => s + p.feeCents, 0),
      },
    };
  }

  /**
   * Iibka tigidhka: laamaha magaalada laga baxayo (Boorama 1 & 2 way wada iibin karaan isla safarka),
   * safar aan bixin. Lacagtu waxay gashaa laanta iibisay.
   */
  assertCanSell(user: AuthUser, trip: TripWithRoute) {
    if (!isSuperAdmin(user) && !this.dir.sameCity(user.branchId, trip.route.fromBranchId)) {
      throw Errors.forbidden('Tickets are sold in the departure city');
    }
    if (!['SCHEDULED', 'BOARDING'].includes(trip.status)) throw Errors.conflict('TRIP_CLOSED_FOR_SALE', 'Trip is not open for sale');
  }

  private assertManagerOf(user: AuthUser, branchId: string, cityWide = false) {
    if (isSuperAdmin(user)) return;
    const ok = user.role === Role.BRANCH_MANAGER && (cityWide ? this.dir.sameCity(user.branchId, branchId) : user.branchId === branchId);
    if (!ok) throw Errors.forbidden('Only the branch manager can do this');
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
