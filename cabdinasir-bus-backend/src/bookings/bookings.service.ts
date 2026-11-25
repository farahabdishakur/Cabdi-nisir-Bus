import { DispatchService } from '../dispatch/dispatch.service';
import { Injectable } from '@nestjs/common';
import { BookingStatus, PaymentKind, PaymentMethod, Prisma, Role } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuthUser, isSuperAdmin } from '../common/auth-user';
import { Errors } from '../common/errors';
import { branchFilter } from '../common/branch-scope';
import { assertTransition, BOOKING_TRANSITIONS } from '../common/state-machine';
import { nextNumber } from '../common/sequences';
import { isMobileRefViolation, isUniqueViolation } from '../common/idempotency';
import { businessDayRange } from '../common/time';
import { pageArgs, paged } from '../common/pagination';
import { ticketPrice } from '../pricing/pricing';
import { parseSeatLayout } from '../vehicles/seat-layout';
import { SettingsService } from '../settings/settings.service';
import { CashService } from '../cash/cash.service';
import { AuditService } from '../audit/audit.service';
import { TripsService } from '../trips/trips.service';
import { BranchDirectory } from '../common/branch-directory.service';
import {
  BookingQuery, CancelReservationDto, ConfirmReservationDto, CorrectBookingDto, CreateBookingDto, ReserveBookingDto, TransferBookingDto, VoidBookingDto,
} from './bookings.dto';
import { expireReservations } from '../common/booking-status';
import { NotificationsService } from '../notifications/notifications.service';
import { formatBusinessTime } from '../common/time';
import { formatUsd } from '../common/money';

const include = { payments: true, trip: { include: { route: { include: { fromBranch: true, toBranch: true } }, vehicle: true } } } satisfies Prisma.BookingInclude;

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
    private readonly settings: SettingsService,
    private readonly cash: CashService,
    private readonly audit: AuditService,
    private readonly dir: BranchDirectory,
    private readonly notifications: NotificationsService,
    private readonly dispatch: DispatchService,
  ) {}

  /**
   * Tigidhka warqadda (buugga hore loo daabacay): lambarku hal mar oo keliya laan kasta — warqad lumay/la isticmaalay
   * lama isticmaali karo mar labaad (xataa haddii tigidhkii hore la void-gareeyay).
   */
  private async paperNo(tx: Tx, branchId: string, raw: string | undefined, required: boolean, exceptId?: string) {
    const no = raw?.trim().toUpperCase() || null;
    if (!no) {
      if (required) throw Errors.bad('PAPER_TICKET_REQUIRED', 'Enter the paper ticket number');
      return null;
    }
    const used = await tx.booking.findFirst({ where: { branchId, paperTicketNo: no, ...(exceptId && { id: { not: exceptId } }) }, select: { receiptNo: true } });
    if (used) throw Errors.conflict('PAPER_TICKET_USED', 'This paper ticket number was already used', { receiptNo: used.receiptNo, paperTicketNo: no });
    return no;
  }

  async create(user: AuthUser, dto: CreateBookingDto, idempotencyKey?: string) {
    if (idempotencyKey) {
      const prev = await this.prisma.booking.findUnique({ where: { idempotencyKey }, include });
      if (prev) return this.ownReplay(user, prev.soldById, prev);
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const trip = await this.trips.getForUser(tx, user, dto.tripId, 'share');
        this.trips.assertCanSell(user, trip);
        await expireReservations(tx, { tripId: trip.id });
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

        // Lacagta & rasiidka: laanta iibisay (Boorama 2 → BO2-T-…); Super Admin → laanta safarku ka baxo
        const branch = isSuperAdmin(user) || !user.branchId ? trip.route.fromBranch : await tx.branch.findUniqueOrThrow({ where: { id: user.branchId } });
        const paperTicketNo = await this.paperNo(tx, branch.id, dto.paperTicketNo, settings.ticketMode === 1);
        const receiptNo = await nextNumber(tx, branch.id, branch.code, 'TICKET');
        const booking = await tx.booking.create({
          data: {
            receiptNo,
            paperTicketNo,
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
        await this.dispatch.afterSeatChange(tx, trip.id, user.id); // gaariga buuxsamay → kan xiga ha furmo
        return tx.booking.findUniqueOrThrow({ where: { id: booking.id }, include });
      });
    } catch (e) {
      if (isMobileRefViolation(e)) throw Errors.conflict('MOBILE_REFERENCE_USED', 'This Zaad/eDahab transaction was already used');
      // P2002: kursiga waa la iibiyay (partial unique index) ama isla Idempotency-Key ayaa isku mar yimid
      if (isUniqueViolation(e)) {
        if (idempotencyKey) {
          const prev = await this.prisma.booking.findUnique({ where: { idempotencyKey }, include });
          if (prev) return this.ownReplay(user, prev.soldById, prev);
        }
        throw Errors.conflict('SEAT_TAKEN', `Seat ${dto.seatNo} is already sold`);
      }
      throw e;
    }
  }

  /** Idempotency replay: kaliya qofkii sameeyay — key qof kale lagama soo saari karo xog laan kale. */
  private ownReplay<T>(user: AuthUser, ownerId: string, record: T): T {
    if (ownerId !== user.id) throw Errors.conflict('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was used by another user');
    return record;
  }

  async list(user: AuthUser, q: BookingQuery) {
    const where: Prisma.BookingWhereInput = {
      tripId: q.tripId, status: q.status, branchId: branchFilter(user, q.branchId),
      ...(q.paidVia && { payments: { some: { method: q.paidVia, amount: { gt: 0 } } } }),
    };
    if (user.role === Role.CASHIER && !q.tripId) where.soldById = user.id;
    if (q.date) {
      const { start, end } = businessDayRange(q.date);
      where.createdAt = { gte: start, lt: end };
    }
    if (q.q) {
      where.OR = [
        { receiptNo: { contains: q.q, mode: 'insensitive' } },
        { paperTicketNo: { equals: q.q.trim().toUpperCase() } },
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
    if (!isSuperAdmin(user)) {
      await this.dir.ensure(user.branchId);
      const ok = [b.branchId, b.trip.route.fromBranchId, b.trip.route.toBranchId].some((x) => this.dir.sameCity(user.branchId, x));
      if (!ok) throw Errors.forbiddenBranch();
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
      // Optimistic lock: laba void isku mar (badhan laba jeer / codsi + void toos ah) → hal kaliya, lacag celin hal mar
      const res = await tx.booking.updateMany({
        where: { id, status: b.status },
        data: { status: BookingStatus.VOIDED, voidReason: dto.reason, voidedById: user.id, voidedAt: new Date() },
      });
      if (res.count !== 1) throw Errors.conflict('CONCURRENT_UPDATE', 'Ticket was changed by someone else, reload');
      const updated = await tx.booking.findUniqueOrThrow({ where: { id } });
      const paid = b.payments.reduce((s, p) => s + p.amountUsdCents, 0);
      if (dto.refund && paid > 0) {
        const original = b.payments.find((p) => p.kind === PaymentKind.TICKET);
        const pay = dto.refundPayment ?? { method: original?.method ?? PaymentMethod.CASH, currency: original?.currency ?? 'USD', reference: original?.reference ?? undefined, payerPhone: original?.payerPhone ?? undefined };
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
        if (!isSuperAdmin(user) && user.branchId !== b.branchId) throw Errors.forbiddenBranch();
        if (b.status !== BookingStatus.CONFIRMED) throw Errors.conflict('BOOKING_NOT_ACTIVE', 'Only confirmed tickets can be transferred');
        if (!['SCHEDULED', 'BOARDING'].includes(b.trip.status)) throw Errors.conflict('TRIP_DEPARTED', 'Original trip already departed');
        const trip = await this.trips.getForUser(tx, user, dto.tripId, 'share');
        this.trips.assertCanSell(user, trip);
        if (!this.dir.sameCity(trip.route.fromBranchId, b.trip.route.fromBranchId)) {
          throw Errors.bad('TRIP_ROUTE_MISMATCH', 'New trip must depart from the same city');
        }
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
        // Lacag celin (qiimo dhimay) = lacag sanduuqa ka baxaysa → Manager kaliya
        if (diff < 0 && user.role === Role.CASHIER) {
          throw Errors.forbidden('A refund on transfer needs a manager (request a void or ask your manager)');
        }

        const res = await tx.booking.updateMany({
          where: { id, status: BookingStatus.CONFIRMED, tripId: b.tripId, seatNo: b.seatNo },
          data: {
            tripId: trip.id, seatNo: dto.seatNo, priceCents: price.totalCents,
            priceBreakdown: price as unknown as Prisma.InputJsonValue,
            transferredFromTripId: b.tripId,
          },
        });
        if (res.count !== 1) throw Errors.conflict('CONCURRENT_UPDATE', 'Ticket was changed by someone else, reload');
        const updated = await tx.booking.findUniqueOrThrow({ where: { id } });
        if (diff !== 0) {
          const orig = b.payments.find((p) => p.kind === PaymentKind.TICKET);
          const original = { method: orig?.method ?? PaymentMethod.CASH, currency: orig?.currency ?? 'USD', reference: orig?.reference ?? undefined, payerPhone: orig?.payerPhone ?? undefined };
          // celin: habkii lagu bixiyay (Zaad → Zaad); qaadis: habka macmiilku doorto
          const pay = diff < 0 ? original : dto.payment ?? original;
          await this.cash.recordPayment(tx, user, b.branchId, PaymentKind.TRANSFER_DIFF, diff, pay, { bookingId: id });
        }
        await tx.seatHold.deleteMany({ where: { tripId: trip.id, seatNo: dto.seatNo } });
        await this.dispatch.afterSeatChange(tx, trip.id, user.id);
        await this.audit.log(tx, user, 'TRANSFER', 'bookings', id, { tripId: b.tripId, seatNo: b.seatNo, priceCents: b.priceCents }, { tripId: trip.id, seatNo: dto.seatNo, priceCents: updated.priceCents });
        return tx.booking.findUniqueOrThrow({ where: { id }, include });
      });
    } catch (e) {
      if (isMobileRefViolation(e)) throw Errors.conflict('MOBILE_REFERENCE_USED', 'This Zaad/eDahab transaction was already used');
      if (isUniqueViolation(e)) throw Errors.conflict('SEAT_TAKEN', `Seat ${dto.seatNo} is already sold`);
      throw e;
    }
  }

  // ================================================================ Ballan taleefan (RESERVED)

  /**
   * Macmiilku wuu soo wacay: kursi ayaa loo qabtay lacag la'aan, ilaa `reservationCutoffMinutes` ka hor bixitaanka.
   * Qiimaha waa la xisaabiyaa hadda (snapshot). SMS: lambarka ballanta + wakhtiga bixinta.
   */
  async reserve(user: AuthUser, dto: ReserveBookingDto, idempotencyKey?: string) {
    if (idempotencyKey) {
      const prev = await this.prisma.booking.findUnique({ where: { idempotencyKey }, include });
      if (prev) return this.ownReplay(user, prev.reservedById ?? prev.soldById, prev);
    }
    const phone = dto.passengerPhone.replace(/\s/g, '');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const trip = await this.trips.getForUser(tx, user, dto.tripId, 'share');
        this.trips.assertCanSell(user, trip);
        const settings = await this.settings.get(tx);
        if (settings.reservationCutoffMinutes <= 0) throw Errors.bad('RESERVATIONS_DISABLED', 'Phone reservations are turned off');
        const until = new Date(trip.departureAt.getTime() - settings.reservationCutoffMinutes * 60_000);
        if (until <= new Date()) {
          throw Errors.conflict('RESERVATION_CLOSED', 'Too close to departure — sell the ticket with payment instead', { cutoffMinutes: settings.reservationCutoffMinutes });
        }
        await expireReservations(tx, { tripId: trip.id });
        const { layout, seats } = parseSeatLayout(trip.vehicle.seatLayout);
        if (!seats.includes(dto.seatNo)) throw Errors.bad('SEAT_NOT_FOUND', `Seat ${dto.seatNo} does not exist`);
        const hold = await tx.seatHold.findUnique({ where: { tripId_seatNo: { tripId: trip.id, seatNo: dto.seatNo } } });
        if (hold && hold.userId !== user.id && hold.expiresAt > new Date()) throw Errors.conflict('SEAT_HELD', `Seat ${dto.seatNo} is being sold by someone else`);
        const already = await tx.booking.count({ where: { tripId: trip.id, passengerPhone: phone, status: 'RESERVED' } });
        if (already >= settings.maxReservationsPerPhone) {
          throw Errors.conflict('RESERVATION_LIMIT', 'This phone already has the maximum reservations on this trip', { max: settings.maxReservationsPerPhone });
        }
        const price = ticketPrice({
          ticketPriceCents: trip.route.ticketPriceCents,
          frontSeatSurchargeCents: trip.route.frontSeatSurchargeCents,
          isFrontSeat: (layout.front ?? []).includes(dto.seatNo),
          discountCents: 0,
        });
        const branch = isSuperAdmin(user) || !user.branchId ? trip.route.fromBranch : await tx.branch.findUniqueOrThrow({ where: { id: user.branchId } });
        const receiptNo = await nextNumber(tx, branch.id, branch.code, 'TICKET');
        const b = await tx.booking.create({
          data: {
            receiptNo, tripId: trip.id, seatNo: dto.seatNo, passengerName: dto.passengerName.trim(), passengerPhone: phone,
            priceCents: price.totalCents, priceBreakdown: price as unknown as Prisma.InputJsonValue,
            status: 'RESERVED', reservedUntil: until, reservedById: user.id, soldById: user.id, branchId: branch.id, idempotencyKey,
          },
        });
        await tx.seatHold.deleteMany({ where: { tripId: trip.id, seatNo: dto.seatNo } });
        await this.notifications.enqueue(tx, phone, 'BOOKING_RESERVED', {
          seat: dto.seatNo, from: trip.route.fromBranch.city, to: trip.route.toBranch.city, departure: formatBusinessTime(trip.departureAt),
          receipt: receiptNo, price: formatUsd(price.totalCents), until: formatBusinessTime(until),
          pay: payHint(branch),
        });
        await this.dispatch.afterSeatChange(tx, trip.id, user.id);
        return tx.booking.findUniqueOrThrow({ where: { id: b.id }, include });
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        if (idempotencyKey) {
          const prev = await this.prisma.booking.findUnique({ where: { idempotencyKey }, include });
          if (prev) return this.ownReplay(user, prev.reservedById ?? prev.soldById, prev);
        }
        throw Errors.conflict('SEAT_TAKEN', `Seat ${dto.seatNo} is already taken`);
      }
      throw e;
    }
  }

  /**
   * Macmiilkii ballanta lahaa wuu yimid oo wuu bixiyay → tigidh dhab ah (CONFIRMED).
   * Laan kasta oo magaalada laga baxayo ah way xaqiijin kartaa; lacagta & tigidhku waxay noqonayaan laantaas.
   */
  async confirm(user: AuthUser, id: string, dto: ConfirmReservationDto) {
    return this.prisma.$transaction(async (tx) => {
      const b = await tx.booking.findUnique({ where: { id }, include });
      if (!b) throw Errors.notFound('Booking', id);
      const trip = await this.trips.getForUser(tx, user, b.tripId, 'share');
      this.trips.assertCanSell(user, trip);
      if (b.status !== BookingStatus.RESERVED) {
        throw Errors.conflict(b.status === 'EXPIRED' ? 'RESERVATION_EXPIRED' : 'BOOKING_NOT_ACTIVE', `Booking is ${b.status}`);
      }
      if (b.reservedUntil && b.reservedUntil <= new Date()) {
        await tx.booking.updateMany({ where: { id, status: 'RESERVED' }, data: { status: 'EXPIRED' } });
        throw Errors.conflict('RESERVATION_EXPIRED', 'Reservation time has passed — the seat may be sold again');
      }
      const discount = dto.discountCents ?? 0;
      if (discount > 0) {
        if (user.role === Role.CASHIER) throw Errors.forbidden('Cashiers cannot give discounts');
        const { maxDiscountBps } = await this.settings.get(tx);
        if (!isSuperAdmin(user) && discount * 10000 > b.priceCents * maxDiscountBps) {
          throw Errors.bad('DISCOUNT_TOO_HIGH', 'Discount exceeds the allowed limit', { maxBps: maxDiscountBps });
        }
      }
      const total = Math.max(0, b.priceCents - discount);
      const branchId = user.branchId ?? b.branchId;
      const paperTicketNo = await this.paperNo(tx, branchId, dto.paperTicketNo, (await this.settings.get(tx)).ticketMode === 1, id);
      const res = await tx.booking.updateMany({
        where: { id, status: 'RESERVED' },
        data: {
          status: 'CONFIRMED', confirmedAt: new Date(), soldById: user.id, branchId, paperTicketNo,
          priceCents: total, discountCents: b.priceCents - total,
        },
      });
      if (res.count !== 1) throw Errors.conflict('CONCURRENT_UPDATE', 'Booking was changed by someone else, reload');
      if (total > 0) await this.cash.recordPayment(tx, user, branchId, PaymentKind.TICKET, total, dto.payment, { bookingId: id });
      await this.audit.log(tx, user, 'CONFIRM_RESERVATION', 'bookings', id, { status: 'RESERVED', priceCents: b.priceCents }, { status: 'CONFIRMED', paid: total });
      return tx.booking.findUniqueOrThrow({ where: { id }, include });
    });
  }

  /** Macmiilku wuu ka noqday (ama wuu soo wacay) → kursiga sii daa. Lacag ma jirto → karraanigu wuu samayn karaa. */
  async cancelReservation(user: AuthUser, id: string, dto: CancelReservationDto) {
    const b = await this.prisma.booking.findUnique({ where: { id }, include: { trip: { include: { route: true } } } });
    if (!b) throw Errors.notFound('Booking', id);
    if (!isSuperAdmin(user) && !this.dir.sameCity(user.branchId, b.trip.route.fromBranchId)) throw Errors.forbiddenBranch();
    if (b.status !== BookingStatus.RESERVED) throw Errors.conflict('BOOKING_NOT_ACTIVE', `Booking is ${b.status}`);
    const res = await this.prisma.booking.updateMany({
      where: { id, status: 'RESERVED' },
      data: { status: 'VOIDED', voidReason: dto.reason, voidedById: user.id, voidedAt: new Date() },
    });
    if (res.count !== 1) throw Errors.conflict('CONCURRENT_UPDATE', 'Booking was changed by someone else, reload');
    await this.audit.log(this.prisma, user, 'CANCEL_RESERVATION', 'bookings', id, { status: 'RESERVED' }, { status: 'VOIDED', reason: dto.reason });
    return this.prisma.booking.findUniqueOrThrow({ where: { id }, include });
  }

  /** Sixitaan magaca/taleefanka rakaabka (ka hor bixitaanka). */
  async correct(user: AuthUser, id: string, dto: CorrectBookingDto) {
    const b = await this.get(user, id);
    if (!isSuperAdmin(user) && user.branchId !== b.branchId) throw Errors.forbiddenBranch();
    if (b.status === BookingStatus.VOIDED || b.status === BookingStatus.EXPIRED) throw Errors.conflict('BOOKING_NOT_ACTIVE', 'Ticket is not active');
    if (!['SCHEDULED', 'BOARDING'].includes(b.trip.status)) throw Errors.conflict('TRIP_DEPARTED', 'Trip already departed');
    const data: Prisma.BookingUpdateInput = {};
    if (dto.passengerName) data.passengerName = dto.passengerName.trim();
    if (dto.passengerPhone) data.passengerPhone = dto.passengerPhone.replace(/\s/g, '');
    if (!Object.keys(data).length && !dto.paperTicketNo) throw Errors.bad('NOTHING_TO_CHANGE', 'No fields to correct');
    return this.prisma.$transaction(async (tx) => {
      if (dto.paperTicketNo) data.paperTicketNo = await this.paperNo(tx, b.branchId, dto.paperTicketNo, false, b.id);
      const updated = await tx.booking.update({ where: { id: b.id }, data, include });
      await this.audit.log(tx, user, 'CORRECT', 'bookings', b.id, { passengerName: b.passengerName, passengerPhone: b.passengerPhone, paperTicketNo: b.paperTicketNo }, { ...data, reason: dto.reason });
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
    if (!isSuperAdmin(user) && !this.dir.sameCity(user.branchId, b.trip.route.fromBranchId)) throw Errors.forbiddenBranch();
    assertTransition('Booking', BOOKING_TRANSITIONS, b.status, BookingStatus.BOARDED);
    return this.prisma.booking.update({ where: { id: b.id }, data: { status: BookingStatus.BOARDED } });
  }
}

/** " (Zaad 063…, eDahab 065…)" — haddii laantu lambarro leedahay */
function payHint(b: { zaadNumber?: string | null; edahabNumber?: string | null }) {
  const parts = [b.zaadNumber && `Zaad ${b.zaadNumber}`, b.edahabNumber && `eDahab ${b.edahabNumber}`].filter(Boolean);
  return parts.length ? ` (${parts.join(', ')}; ku qor lambarka ballanta)` : '';
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
