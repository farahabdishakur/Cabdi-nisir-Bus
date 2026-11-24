import { Injectable } from '@nestjs/common';
import { BookingStatus, PaymentKind, PaymentMethod, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, isSuperAdmin } from '../common/auth-user';
import { Errors } from '../common/errors';
import { branchFilter } from '../common/branch-scope';
import { assertTransition, BOOKING_TRANSITIONS } from '../common/state-machine';
import { nextNumber } from '../common/sequences';
import { isUniqueViolation } from '../common/idempotency';
import { businessDayRange } from '../common/time';
import { pageArgs, paged } from '../common/pagination';
import { ticketPrice } from '../pricing/pricing';
import { parseSeatLayout } from '../vehicles/seat-layout';
import { SettingsService } from '../settings/settings.service';
import { CashService } from '../cash/cash.service';
import { AuditService } from '../audit/audit.service';
import { TripsService } from '../trips/trips.service';
import { BookingQuery, CorrectBookingDto, CreateBookingDto, TransferBookingDto, VoidBookingDto } from './bookings.dto';

const include = { payments: true, trip: { include: { route: { include: { fromBranch: true, toBranch: true } }, vehicle: true } } } satisfies Prisma.BookingInclude;

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
    private readonly settings: SettingsService,
    private readonly cash: CashService,
    private readonly audit: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateBookingDto, idempotencyKey?: string) {
    if (idempotencyKey) {
      const prev = await this.prisma.booking.findUnique({ where: { idempotencyKey }, include });
      if (prev) return prev;
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const trip = await this.trips.getForUser(tx, user, dto.tripId);
        this.trips.assertCanSell(user, trip);
        const { layout, seats } = parseSeatLayout(trip.vehicle.seatLayout);
        if (!seats.includes(dto.seatNo)) throw Errors.bad('SEAT_NOT_FOUND', `Seat ${dto.seatNo} does not exist`);

        const hold = await tx.seatHold.findUnique({ where: { tripId_seatNo: { tripId: trip.id, seatNo: dto.seatNo } } });
        if (hold && hold.userId !== user.id && hold.expiresAt > new Date()) {
          throw Errors.conflict('SEAT_HELD', `Seat ${dto.seatNo} is being sold by someone else`);
        }

        const discount = dto.discountCents ?? 0;
        const settings = await this.settings.get(tx);
        const isFront = (layout.front ?? []).includes(dto.seatNo);
        const gross = ticketPrice({
          ticketPriceCents: trip.route.ticketPriceCents,
          frontSeatSurchargeCents: trip.route.frontSeatSurchargeCents,
          isFrontSeat: isFront,
          discountCents: 0,
        }).totalCents;
        if (discount > 0) {
          if (user.role === Role.CASHIER) throw Errors.forbidden('Cashiers cannot give discounts');
          if (!isSuperAdmin(user) && discount * 10000 > gross * settings.maxDiscountBps) {
            throw Errors.bad('DISCOUNT_TOO_HIGH', 'Discount exceeds the allowed limit', { maxBps: settings.maxDiscountBps });
          }
        }
        const price = ticketPrice({
          ticketPriceCents: trip.route.ticketPriceCents,
          frontSeatSurchargeCents: trip.route.frontSeatSurchargeCents,
          isFrontSeat: isFront,
          discountCents: discount,
        });

        const branch = trip.route.fromBranch;
        const receiptNo = await nextNumber(tx, branch.id, branch.code, 'TICKET');
        const booking = await tx.booking.create({
          data: {
            receiptNo,
            tripId: trip.id,
            seatNo: dto.seatNo,
            passengerName: dto.passengerName.trim(),
            passengerPhone: dto.passengerPhone.replace(/\s/g, ''),
            priceCents: price.totalCents,
            discountCents: gross - price.totalCents,
            priceBreakdown: price as unknown as Prisma.InputJsonValue,
            soldById: user.id,
            branchId: branch.id,
            idempotencyKey,
          },
        });
        if (price.totalCents > 0) {
          await this.cash.recordPayment(tx, user, branch.id, PaymentKind.TICKET, price.totalCents, dto.payment, { bookingId: booking.id });
        }
        await tx.seatHold.deleteMany({ where: { tripId: trip.id, seatNo: dto.seatNo } });
        return tx.booking.findUniqueOrThrow({ where: { id: booking.id }, include });
      });
    } catch (e) {
      // P2002: kursiga waa la iibiyay (partial unique index) ama isla Idempotency-Key ayaa isku mar yimid
      if (isUniqueViolation(e)) {
        if (idempotencyKey) {
          const prev = await this.prisma.booking.findUnique({ where: { idempotencyKey }, include });
          if (prev) return prev;
        }
        throw Errors.conflict('SEAT_TAKEN', `Seat ${dto.seatNo} is already sold`);
      }
      throw e;
    }
  }

  async list(user: AuthUser, q: BookingQuery) {
    const where: Prisma.BookingWhereInput = { tripId: q.tripId, status: q.status, branchId: branchFilter(user, q.branchId) };
    if (user.role === Role.CASHIER && !q.tripId) where.soldById = user.id;
    if (q.date) {
      const { start, end } = businessDayRange(q.date);
      where.createdAt = { gte: start, lt: end };
    }
    if (q.q) {
      where.OR = [
        { receiptNo: { contains: q.q, mode: 'insensitive' } },
        { passengerPhone: { contains: q.q.replace(/\s/g, '') } },
        { passengerName: { contains: q.q, mode: 'insensitive' } },
      ];
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({ where, include, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      this.prisma.booking.count({ where }),
    ]);
    return paged(data, total, q);
  }

  async get(user: AuthUser, id: string) {
    const b = await this.prisma.booking.findFirst({ where: { OR: [{ id: isUuid(id) ? id : undefined }, { receiptNo: id }] }, include });
    if (!b) throw Errors.notFound('Booking', id);
    if (!isSuperAdmin(user) && user.branchId !== b.trip.route.fromBranchId && user.branchId !== b.trip.route.toBranchId) {
      throw Errors.forbiddenBranch();
    }
    return b;
  }

  /** Void: Manager kaliya, sabab waajib, safar aan bixin (BUSINESS_RULES §3). */
  async void(user: AuthUser, id: string, dto: VoidBookingDto) {
    return this.prisma.$transaction(async (tx) => {
      const b = await tx.booking.findUnique({ where: { id }, include });
      if (!b) throw Errors.notFound('Booking', id);
      if (!isSuperAdmin(user) && user.branchId !== b.branchId) throw Errors.forbiddenBranch();
      assertTransition('Booking', BOOKING_TRANSITIONS, b.status, BookingStatus.VOIDED);
      if (!['SCHEDULED', 'BOARDING'].includes(b.trip.status)) {
        throw Errors.conflict('TRIP_DEPARTED', 'Cannot void a ticket after the vehicle departed');
      }
      const updated = await tx.booking.update({
        where: { id },
        data: { status: BookingStatus.VOIDED, voidReason: dto.reason, voidedById: user.id, voidedAt: new Date() },
      });
      const paid = b.payments.reduce((s, p) => s + p.amountUsdCents, 0);
      if (dto.refund && paid > 0) {
        const original = b.payments.find((p) => p.kind === PaymentKind.TICKET);
        const pay = dto.refundPayment ?? { method: original?.method ?? PaymentMethod.CASH, currency: original?.currency ?? 'USD', reference: original?.reference ?? undefined };
        await this.cash.recordPayment(tx, user, b.branchId, PaymentKind.REFUND, -paid, pay, { bookingId: id });
      }
      await this.audit.log(tx, user, 'VOID', 'bookings', id, { status: b.status }, { status: 'VOIDED', reason: dto.reason, refunded: dto.refund ? paid : 0 });
      return updated;
    });
  }

  /**
   * Beddel safarka / kursiga (ka hor bixitaanka). Discount-kii hore wuu sii jiraa.
   * Farqiga qiimaha: kordhay → lacag la qaado; dhimay → lacag celin (TRANSFER_DIFF).
   */
  async transfer(user: AuthUser, id: string, dto: TransferBookingDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const b = await tx.booking.findUnique({ where: { id }, include });
        if (!b) throw Errors.notFound('Booking', id);
        if (b.status !== BookingStatus.CONFIRMED) throw Errors.conflict('BOOKING_NOT_ACTIVE', 'Only confirmed tickets can be transferred');
        if (!['SCHEDULED', 'BOARDING'].includes(b.trip.status)) throw Errors.conflict('TRIP_DEPARTED', 'Original trip already departed');
        const trip = await this.trips.getForUser(tx, user, dto.tripId);
        this.trips.assertCanSell(user, trip);
        if (trip.route.fromBranchId !== b.branchId) throw Errors.bad('TRIP_ROUTE_MISMATCH', 'New trip must depart from the same branch');
        const { layout, seats } = parseSeatLayout(trip.vehicle.seatLayout);
        if (!seats.includes(dto.seatNo)) throw Errors.bad('SEAT_NOT_FOUND', `Seat ${dto.seatNo} does not exist`);
        const hold = await tx.seatHold.findUnique({ where: { tripId_seatNo: { tripId: trip.id, seatNo: dto.seatNo } } });
        if (hold && hold.userId !== user.id && hold.expiresAt > new Date()) throw Errors.conflict('SEAT_HELD', `Seat ${dto.seatNo} is being sold by someone else`);

        const price = ticketPrice({
          ticketPriceCents: trip.route.ticketPriceCents,
          frontSeatSurchargeCents: trip.route.frontSeatSurchargeCents,
          isFrontSeat: (layout.front ?? []).includes(dto.seatNo),
          discountCents: b.discountCents,
        });
        const diff = price.totalCents - b.priceCents;
        if (diff > 0 && !dto.payment) throw Errors.bad('PAYMENT_REQUIRED', 'Collect the price difference', { diffCents: diff });

        const updated = await tx.booking.update({
          where: { id },
          data: {
            tripId: trip.id, seatNo: dto.seatNo, priceCents: price.totalCents,
            priceBreakdown: price as unknown as Prisma.InputJsonValue,
            transferredFromTripId: b.tripId,
          },
        });
        if (diff !== 0) {
          const orig = b.payments.find((p) => p.kind === PaymentKind.TICKET);
          const pay = dto.payment ?? { method: orig?.method ?? PaymentMethod.CASH, currency: orig?.currency ?? 'USD', reference: orig?.reference ?? undefined };
          await this.cash.recordPayment(tx, user, b.branchId, PaymentKind.TRANSFER_DIFF, diff, pay, { bookingId: id });
        }
        await tx.seatHold.deleteMany({ where: { tripId: trip.id, seatNo: dto.seatNo } });
        await this.audit.log(tx, user, 'TRANSFER', 'bookings', id, { tripId: b.tripId, seatNo: b.seatNo, priceCents: b.priceCents }, { tripId: trip.id, seatNo: dto.seatNo, priceCents: updated.priceCents });
        return tx.booking.findUniqueOrThrow({ where: { id }, include });
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw Errors.conflict('SEAT_TAKEN', `Seat ${dto.seatNo} is already sold`);
      throw e;
    }
  }

  /** Sixitaan magaca/taleefanka rakaabka (ka hor bixitaanka). */
  async correct(user: AuthUser, id: string, dto: CorrectBookingDto) {
    const b = await this.get(user, id);
    if (!isSuperAdmin(user) && user.branchId !== b.branchId) throw Errors.forbiddenBranch();
    if (b.status === BookingStatus.VOIDED) throw Errors.conflict('BOOKING_NOT_ACTIVE', 'Ticket is voided');
    if (!['SCHEDULED', 'BOARDING'].includes(b.trip.status)) throw Errors.conflict('TRIP_DEPARTED', 'Trip already departed');
    const data: Prisma.BookingUpdateInput = {};
    if (dto.passengerName) data.passengerName = dto.passengerName.trim();
    if (dto.passengerPhone) data.passengerPhone = dto.passengerPhone.replace(/\s/g, '');
    if (!Object.keys(data).length) throw Errors.bad('NOTHING_TO_CHANGE', 'No fields to correct');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({ where: { id: b.id }, data, include });
      await this.audit.log(tx, user, 'CORRECT', 'bookings', b.id, { passengerName: b.passengerName, passengerPhone: b.passengerPhone }, { ...data, reason: dto.reason });
      return updated;
    });
  }

  /** Dib u daabac rasiidka — waa la tiriyaa oo audit ayuu galaa (rasiid nuqul ah lagu khiyaanayn). */
  async reprint(user: AuthUser, id: string) {
    const b = await this.get(user, id);
    const updated = await this.prisma.booking.update({ where: { id: b.id }, data: { printCount: { increment: 1 } }, include });
    await this.audit.log(this.prisma, user, 'REPRINT', 'bookings', b.id, { printCount: b.printCount }, { printCount: updated.printCount });
    return updated;
  }

  async board(user: AuthUser, id: string) {
    const b = await this.get(user, id);
    if (!isSuperAdmin(user) && user.branchId !== b.trip.route.fromBranchId) throw Errors.forbiddenBranch();
    assertTransition('Booking', BOOKING_TRANSITIONS, b.status, BookingStatus.BOARDED);
    return this.prisma.booking.update({ where: { id: b.id }, data: { status: BookingStatus.BOARDED } });
  }
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
