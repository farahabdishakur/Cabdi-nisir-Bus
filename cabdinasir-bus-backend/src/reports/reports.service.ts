import { Injectable } from '@nestjs/common';
import { PaymentKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BranchDirectory } from '../common/branch-directory.service';
import { AuthUser } from '../common/auth-user';
import { branchFilter } from '../common/branch-scope';
import { businessDate, businessRange, BUSINESS_UTC_OFFSET_HOURS } from '../common/time';

/** Dakhli = lacag ganacsi (kharash iyo deposit ma aha dakhli). */
export const INCOME_KINDS: PaymentKind[] = ['TICKET', 'PARCEL', 'STORAGE', 'REFUND', 'TRANSFER_DIFF'];

export interface RangeQuery {
  from?: string;
  to?: string;
  branchId?: string;
}

/** Warbixinada (BUSINESS_RULES §7, REPORT §5). Lacagta oo dhan waxaa lagu soo celiyaa USD senti. */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly dir: BranchDirectory) {}

  private range(q: RangeQuery) {
    const from = q.from ?? businessDate();
    const to = q.to ?? from;
    return { from, to, ...businessRange(from, to) };
  }

  /** Dakhliga: laan kasta, nooc kasta (tigidh/alaab/kayd/celin), hab kasta, iyo maalin kasta. */
  async revenue(user: AuthUser, q: RangeQuery) {
    const r = this.range(q);
    const branchId = branchFilter(user, q.branchId);
    const where: Prisma.PaymentWhereInput = { branchId, createdAt: { gte: r.start, lt: r.end }, kind: { in: INCOME_KINDS } };
    const [byBranchKind, byMethod, branches, expenses] = await Promise.all([
      this.prisma.payment.groupBy({ by: ['branchId', 'kind'], where, _sum: { amountUsdCents: true }, _count: true }),
      this.prisma.payment.groupBy({ by: ['method', 'currency'], where, _sum: { amount: true, amountUsdCents: true }, _count: true }),
      this.prisma.branch.findMany({ select: { id: true, code: true, name: true } }),
      this.prisma.payment.groupBy({ by: ['branchId'], where: { branchId, createdAt: { gte: r.start, lt: r.end }, kind: 'EXPENSE' }, _sum: { amountUsdCents: true } }),
    ]);
    const offset = `${BUSINESS_UTC_OFFSET_HOURS} hours`;
    const daily = await this.prisma.$queryRaw<{ day: string; usd_cents: bigint }[]>`
      SELECT to_char(("createdAt" + ${offset}::interval)::date, 'YYYY-MM-DD') AS day, SUM("amountUsdCents")::bigint AS usd_cents
      FROM "payments"
      WHERE "createdAt" >= ${r.start} AND "createdAt" < ${r.end}
        AND (${branchId ?? null}::text IS NULL OR "branchId" = ${branchId ?? null}::text)
        AND "kind"::text = ANY(${INCOME_KINDS as string[]})
      GROUP BY 1 ORDER BY 1`;
    const perBranch = branches
      .filter((b) => !branchId || b.id === branchId)
      .map((b) => {
        const rows = byBranchKind.filter((x) => x.branchId === b.id);
        const kinds = Object.fromEntries(rows.map((x) => [x.kind, x._sum.amountUsdCents ?? 0]));
        const total = rows.reduce((s, x) => s + (x._sum.amountUsdCents ?? 0), 0);
        const exp = -(expenses.find((e) => e.branchId === b.id)?._sum.amountUsdCents ?? 0);
        return { branch: b, byKind: kinds, totalUsdCents: total, expensesUsdCents: exp, netUsdCents: total - exp };
      });
    return {
      from: r.from,
      to: r.to,
      totalUsdCents: perBranch.reduce((s, b) => s + b.totalUsdCents, 0),
      expensesUsdCents: perBranch.reduce((s, b) => s + b.expensesUsdCents, 0),
      netUsdCents: perBranch.reduce((s, b) => s + b.netUsdCents, 0),
      perBranch,
      byMethod: byMethod.map((m) => ({ method: m.method, currency: m.currency, count: m._count, amount: m._sum.amount ?? 0, amountUsdCents: m._sum.amountUsdCents ?? 0 })),
      daily: daily.map((d) => ({ day: d.day, usdCents: Number(d.usd_cents) })),
    };
  }

  /** Buuxsanaanta kuraasta safar kasta. */
  async occupancy(user: AuthUser, q: RangeQuery) {
    const r = this.range(q);
    const branchId = branchFilter(user, q.branchId);
    const trips = await this.prisma.trip.findMany({
      where: { departureAt: { gte: r.start, lt: r.end }, status: { not: 'CANCELLED' }, route: branchId ? { fromBranchId: { in: await this.cityMates(branchId) } } : undefined },
      include: { vehicle: true, driver: true, route: { include: { fromBranch: true, toBranch: true } }, _count: { select: { bookings: { where: { status: { in: ['CONFIRMED', 'BOARDED'] } } } } } },
      orderBy: { departureAt: 'asc' },
    });
    const rows = trips.map((t) => ({
      tripId: t.id,
      departureAt: t.departureAt,
      route: `${t.route.fromBranch.code} → ${t.route.toBranch.code}`,
      vehicle: t.vehicle.plate,
      driver: t.driver.name,
      capacity: t.vehicle.capacity,
      sold: t._count.bookings,
      occupancyPct: t.vehicle.capacity ? Math.round((t._count.bookings / t.vehicle.capacity) * 100) : 0,
    }));
    const cap = rows.reduce((s, x) => s + x.capacity, 0);
    const sold = rows.reduce((s, x) => s + x.sold, 0);
    return { from: r.from, to: r.to, trips: rows, totals: { trips: rows.length, capacity: cap, sold, occupancyPct: cap ? Math.round((sold / cap) * 100) : 0 } };
  }

  /** Alaabta: la diray / la helay / xaaladaha, iyo alaab aan la qaadin. */
  async parcels(user: AuthUser, q: RangeQuery) {
    const r = this.range(q);
    const branchId = branchFilter(user, q.branchId);
    const created = { createdAt: { gte: r.start, lt: r.end } };
    const [sentByStatus, receivedByStatus, uncollected] = await Promise.all([
      this.prisma.parcel.groupBy({ by: ['status'], where: { ...created, fromBranchId: branchId }, _count: true, _sum: { feeCents: true } }),
      this.prisma.parcel.groupBy({ by: ['status'], where: { ...created, toBranchId: branchId }, _count: true }),
      this.prisma.parcel.findMany({
        where: { toBranchId: branchId, status: 'ARRIVED' },
        select: { id: true, trackingCode: true, receiverName: true, receiverPhone: true, arrivedAt: true, payer: true, feeCents: true, paidAt: true },
        orderBy: { arrivedAt: 'asc' },
        take: 200,
      }),
    ]);
    return {
      from: r.from,
      to: r.to,
      sent: sentByStatus.map((x) => ({ status: x.status, count: x._count, feeCents: x._sum.feeCents ?? 0 })),
      received: receivedByStatus.map((x) => ({ status: x.status, count: x._count })),
      awaitingPickup: uncollected,
    };
  }

  /** Exceptions: void, discount, refund, variance sanduuq, alaab lumay/dhaawacmay — kuwa lacag lumis keeni kara. */
  async exceptions(user: AuthUser, q: RangeQuery) {
    const r = this.range(q);
    const branchId = branchFilter(user, q.branchId);
    const inRange = { gte: r.start, lt: r.end };
    const [voidedBookings, discounts, voidedParcels, problemParcels, refunds, variances] = await Promise.all([
      this.prisma.booking.findMany({ where: { branchId, status: 'VOIDED', voidedAt: inRange }, select: { id: true, receiptNo: true, priceCents: true, voidReason: true, voidedById: true, voidedAt: true } }),
      this.prisma.booking.findMany({ where: { branchId, discountCents: { gt: 0 }, createdAt: inRange }, select: { id: true, receiptNo: true, discountCents: true, soldById: true, createdAt: true } }),
      this.prisma.parcel.findMany({ where: { fromBranchId: branchId, status: 'VOIDED', updatedAt: inRange }, select: { id: true, trackingCode: true, feeCents: true, voidReason: true, updatedAt: true } }),
      this.prisma.parcel.findMany({
        where: { status: { in: ['MISSING', 'DAMAGED'] }, updatedAt: inRange, ...(branchId && { OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] }) },
        select: { id: true, trackingCode: true, status: true, declaredValueCents: true, fromBranchId: true, toBranchId: true, updatedAt: true },
      }),
      this.prisma.payment.findMany({ where: { branchId, kind: 'REFUND', createdAt: inRange }, select: { id: true, amountUsdCents: true, cashierId: true, bookingId: true, parcelId: true, createdAt: true } }),
      this.prisma.cashSession.findMany({ where: { branchId, closedAt: inRange }, select: { id: true, cashierId: true, branchId: true, expected: true, counted: true, variance: true, approvedById: true, closedAt: true } }),
    ]);
    const nonZero = variances.filter((v) => {
      const x = v.variance as { USD?: number; SLSH?: number } | null;
      return x && ((x.USD ?? 0) !== 0 || (x.SLSH ?? 0) !== 0);
    });
    return {
      from: r.from,
      to: r.to,
      voidedBookings,
      discounts,
      voidedParcels,
      problemParcels,
      refunds,
      cashVariances: nonZero,
      unapprovedSessions: variances.filter((v) => !v.approvedById).length,
    };
  }

  /**
   * Inter-branch: COD-ga laanta qaadatay (to) ee alaab laan kale (from) dirtay.
   * Matrix: from → to → lacag. Waxay muujinaysaa laan kasta inta ay ku leedahay tan kale.
   */
  async interBranch(user: AuthUser, q: RangeQuery) {
    const r = this.range(q);
    const branchId = branchFilter(user, q.branchId);
    const rows = await this.prisma.$queryRaw<{ from_branch: string; to_branch: string; usd_cents: bigint; count: bigint }[]>`
      SELECT p."fromBranchId" AS from_branch, pay."branchId" AS to_branch,
             SUM(pay."amountUsdCents")::bigint AS usd_cents, COUNT(*)::bigint AS count
      FROM "payments" pay JOIN "parcels" p ON p.id = pay."parcelId"
      WHERE pay.kind = 'PARCEL' AND pay."branchId" <> p."fromBranchId"
        AND pay."createdAt" >= ${r.start} AND pay."createdAt" < ${r.end}
        AND (${branchId ?? null}::text IS NULL OR pay."branchId" = ${branchId ?? null}::text OR p."fromBranchId" = ${branchId ?? null}::text)
      GROUP BY 1, 2`;
    return {
      from: r.from,
      to: r.to,
      codCollected: rows.map((x) => ({ originBranchId: x.from_branch, collectedByBranchId: x.to_branch, usdCents: Number(x.usd_cents), count: Number(x.count) })),
    };
  }

  /**
   * Xiritaanka maalinta laanta: sanduuq kasta (karraani), dakhliga, kharashka, deposits-ka.
   * Manager-ku fiidkii wuxuu eegaa: "lacagtii maanta meeday?"
   */
  async dailyClose(user: AuthUser, q: { date?: string; branchId?: string }) {
    const date = q.date ?? businessDate();
    const r = businessRange(date, date);
    const branchId = branchFilter(user, q.branchId);
    const inDay = { gte: r.start, lt: r.end };
    const [sessions, byKind, expenses, deposits, tickets, parcelsSent, delivered] = await Promise.all([
      this.prisma.cashSession.findMany({ where: { branchId, OR: [{ openedAt: inDay }, { closedAt: inDay }, { closedAt: null }] }, orderBy: { openedAt: 'asc' } }),
      this.prisma.payment.groupBy({ by: ['kind', 'method', 'currency'], where: { branchId, createdAt: inDay }, _sum: { amount: true, amountUsdCents: true }, _count: true }),
      this.prisma.expense.findMany({ where: { branchId, createdAt: inDay }, include: { payment: { select: { amount: true, currency: true, amountUsdCents: true } } } }),
      this.prisma.deposit.findMany({ where: { branchId, createdAt: inDay }, include: { payment: { select: { amount: true, currency: true, amountUsdCents: true } } } }),
      this.prisma.booking.count({ where: { branchId, createdAt: inDay, status: { in: ['CONFIRMED', 'BOARDED'] } } }),
      this.prisma.parcel.count({ where: { fromBranchId: branchId, createdAt: inDay, status: { not: 'VOIDED' } } }),
      this.prisma.parcel.count({ where: { toBranchId: branchId, deliveredAt: inDay } }),
    ]);
    const users = await this.prisma.user.findMany({ where: { id: { in: sessions.map((s) => s.cashierId) } }, select: { id: true, name: true } });
    const name = new Map(users.map((u) => [u.id, u.name]));
    const sum = (kinds: PaymentKind[]) => byKind.filter((x) => kinds.includes(x.kind)).reduce((s, x) => s + (x._sum.amountUsdCents ?? 0), 0);
    return {
      date,
      branchId: branchId ?? null,
      counts: { tickets, parcelsSent, parcelsDelivered: delivered },
      incomeUsdCents: sum(INCOME_KINDS),
      expensesUsdCents: -sum(['EXPENSE']),
      depositsUsdCents: -sum(['DEPOSIT']),
      breakdown: byKind.map((x) => ({ kind: x.kind, method: x.method, currency: x.currency, count: x._count, amount: x._sum.amount ?? 0, amountUsdCents: x._sum.amountUsdCents ?? 0 })),
      sessions: sessions.map((s) => ({
        id: s.id, cashier: name.get(s.cashierId) ?? s.cashierId, openedAt: s.openedAt, closedAt: s.closedAt,
        expected: s.expected, counted: s.counted, variance: s.variance, approved: !!s.approvedAt,
      })),
      expenses: expenses.map((e) => ({ id: e.id, category: e.category, description: e.description, voided: !!e.voidedAt, ...e.payment })),
      deposits: deposits.map((d) => ({ id: d.id, target: d.target, confirmed: !!d.confirmedAt, ...d.payment })),
    };
  }

  /** Shaqada karraani kasta: iib, alaab, wareejin, lacag, farqiga sanduuqa. */
  async cashiers(user: AuthUser, q: RangeQuery) {
    const r = this.range(q);
    const branchId = branchFilter(user, q.branchId);
    const inRange = { gte: r.start, lt: r.end };
    const staff = await this.prisma.user.findMany({ where: { branchId, role: { in: ['CASHIER', 'BRANCH_MANAGER'] } }, select: { id: true, name: true, role: true, branchId: true } });
    const ids = staff.map((s) => s.id);
    const [tickets, parcels, deliveries, money, sessions] = await Promise.all([
      this.prisma.booking.groupBy({ by: ['soldById'], where: { soldById: { in: ids }, createdAt: inRange, status: { in: ['CONFIRMED', 'BOARDED'] } }, _count: true }),
      this.prisma.parcel.groupBy({ by: ['registeredById'], where: { registeredById: { in: ids }, createdAt: inRange, status: { not: 'VOIDED' } }, _count: true }),
      this.prisma.parcel.groupBy({ by: ['deliveredById'], where: { deliveredById: { in: ids }, deliveredAt: inRange }, _count: true }),
      this.prisma.payment.groupBy({ by: ['cashierId'], where: { cashierId: { in: ids }, createdAt: inRange, kind: { in: INCOME_KINDS } }, _sum: { amountUsdCents: true } }),
      this.prisma.cashSession.findMany({ where: { cashierId: { in: ids }, closedAt: inRange }, select: { cashierId: true, variance: true } }),
    ]);
    const rows = staff.map((s) => {
      const v = sessions.filter((x) => x.cashierId === s.id).map((x) => x.variance as { USD?: number; SLSH?: number } | null);
      return {
        userId: s.id,
        name: s.name,
        role: s.role,
        tickets: tickets.find((x) => x.soldById === s.id)?._count ?? 0,
        parcels: parcels.find((x) => x.registeredById === s.id)?._count ?? 0,
        deliveries: deliveries.find((x) => x.deliveredById === s.id)?._count ?? 0,
        incomeUsdCents: money.find((x) => x.cashierId === s.id)?._sum.amountUsdCents ?? 0,
        sessionsClosed: v.length,
        varianceUsdCents: v.reduce((a, x) => a + (x?.USD ?? 0), 0),
        varianceSlsh: v.reduce((a, x) => a + (x?.SLSH ?? 0), 0),
      };
    });
    return { from: r.from, to: r.to, cashiers: rows };
  }

  /**
   * Faa'iidada safar kasta: tigidhada (+farqi −celin) + alaabta la raray − kharashka safarka (shidaal, darawal …).
   * Mulkiiluhu wuxuu arkaa safarada khasaaraha ah.
   */
  /** Darawal kasta: safaradii uu wadey (bas, wakhtiga la qorsheeyay / dhab ah ee baxay / gaadhay, rakaab) — BUSINESS_RULES §33 */
  async driverTrips(user: AuthUser, q: RangeQuery & { driverId?: string }) {
    const r = this.range(q);
    const branchId = branchFilter(user, q.branchId);
    const trips = await this.prisma.trip.findMany({
      where: { departureAt: { gte: r.start, lt: r.end }, status: { not: 'CANCELLED' }, driverId: q.driverId, route: branchId ? { fromBranchId: branchId } : undefined },
      include: { vehicle: { select: { plate: true, fleetNo: true } }, driver: { select: { id: true, name: true, phone: true } }, route: { include: { fromBranch: true, toBranch: true } } },
      orderBy: { departureAt: 'asc' },
      take: 2000,
    });
    const pax = await this.prisma.booking.groupBy({ by: ['tripId'], where: { tripId: { in: trips.map((t) => t.id) }, status: { in: ['CONFIRMED', 'BOARDED'] } }, _count: true });
    const rows = trips.map((t) => ({
      tripId: t.id,
      driverId: t.driver.id,
      driver: t.driver.name,
      driverPhone: t.driver.phone,
      fleetNo: t.vehicle.fleetNo,
      vehicle: t.vehicle.plate,
      route: `${t.route.fromBranch.name} → ${t.route.toBranch.name}`,
      status: t.status,
      departureAt: t.departureAt,
      departedAt: t.manifestLockedAt,
      arrivedAt: t.arrivedAt,
      passengers: pax.find((p) => p.tripId === t.id)?._count ?? 0,
    }));
    const byDriver = new Map<string, { driverId: string; driver: string; driverPhone: string; trips: number; passengers: number; vehicles: Set<string>; lastDepartedAt: Date | null }>();
    for (const x of rows) {
      const d = byDriver.get(x.driverId) ?? { driverId: x.driverId, driver: x.driver, driverPhone: x.driverPhone, trips: 0, passengers: 0, vehicles: new Set<string>(), lastDepartedAt: null };
      d.trips++;
      d.passengers += x.passengers;
      d.vehicles.add(x.fleetNo ?? x.vehicle);
      if (x.departedAt && (!d.lastDepartedAt || x.departedAt > d.lastDepartedAt)) d.lastDepartedAt = x.departedAt;
      byDriver.set(x.driverId, d);
    }
    const drivers = [...byDriver.values()].map((d) => ({ ...d, vehicles: [...d.vehicles] })).sort((a, b) => b.trips - a.trips);
    return { from: r.from, to: r.to, drivers, trips: rows };
  }

  async tripsProfit(user: AuthUser, q: RangeQuery) {
    const r = this.range(q);
    const branchId = branchFilter(user, q.branchId);
    const trips = await this.prisma.trip.findMany({
      where: { departureAt: { gte: r.start, lt: r.end }, status: { not: 'CANCELLED' }, route: branchId ? { fromBranchId: branchId } : undefined },
      include: { vehicle: { select: { plate: true, capacity: true } }, driver: { select: { name: true } }, route: { include: { fromBranch: true, toBranch: true } } },
      orderBy: { departureAt: 'asc' },
    });
    const ids = trips.map((t) => t.id);
    const [ticketMoney, parcelFees, expenses, seats] = await Promise.all([
      this.prisma.$queryRaw<{ trip_id: string; usd: bigint }[]>`
        SELECT b."tripId" AS trip_id, COALESCE(SUM(p."amountUsdCents"), 0)::bigint AS usd
        FROM "payments" p JOIN "bookings" b ON b.id = p."bookingId"
        WHERE b."tripId" = ANY(${ids}) GROUP BY 1`,
      this.prisma.parcel.groupBy({ by: ['tripId'], where: { tripId: { in: ids }, status: { not: 'VOIDED' } }, _sum: { feeCents: true }, _count: true }),
      this.prisma.$queryRaw<{ trip_id: string; usd: bigint }[]>`
        SELECT e."tripId" AS trip_id, COALESCE(SUM(-p."amountUsdCents"), 0)::bigint AS usd
        FROM "expenses" e JOIN "payments" p ON p.id = e."paymentId"
        WHERE e."tripId" = ANY(${ids}) AND e."voidedAt" IS NULL GROUP BY 1`,
      this.prisma.booking.groupBy({ by: ['tripId'], where: { tripId: { in: ids }, status: { in: ['CONFIRMED', 'BOARDED'] } }, _count: true }),
    ]);
    const rows = trips.map((t) => {
      const tickets = Number(ticketMoney.find((x) => x.trip_id === t.id)?.usd ?? 0);
      const pf = parcelFees.find((x) => x.tripId === t.id);
      const parcels = pf?._sum.feeCents ?? 0;
      const exp = Number(expenses.find((x) => x.trip_id === t.id)?.usd ?? 0);
      return {
        tripId: t.id,
        departureAt: t.departureAt,
        route: `${t.route.fromBranch.code} → ${t.route.toBranch.code}`,
        vehicle: t.vehicle.plate,
        driver: t.driver.name,
        passengers: seats.find((x) => x.tripId === t.id)?._count ?? 0,
        capacity: t.vehicle.capacity,
        parcels: pf?._count ?? 0,
        ticketsUsdCents: tickets,
        parcelsUsdCents: parcels,
        expensesUsdCents: exp,
        profitUsdCents: tickets + parcels - exp,
      };
    });
    const sum = (k: 'ticketsUsdCents' | 'parcelsUsdCents' | 'expensesUsdCents' | 'profitUsdCents') => rows.reduce((s, x) => s + x[k], 0);
    return {
      from: r.from,
      to: r.to,
      trips: rows,
      totals: { trips: rows.length, ticketsUsdCents: sum('ticketsUsdCents'), parcelsUsdCents: sum('parcelsUsdCents'), expensesUsdCents: sum('expensesUsdCents'), profitUsdCents: sum('profitUsdCents'), lossMakingTrips: rows.filter((x) => x.profitUsdCents < 0).length },
    };
  }

  private async cityMates(branchId: string) {
    await this.dir.ensure(branchId);
    return this.dir.mates(branchId);
  }

  /**
   * Hubinta daacadnimada lacagta (integrity): waxyaabaha muujin kara lacag lumay ama khalad.
   * Super Admin / Manager-ku waa inuu eegaa maalin kasta — liis madhan = wax walba waa sax.
   */
  async integrity(user: AuthUser, q: { branchId?: string }) {
    const branchId = branchFilter(user, q.branchId);
    const now = Date.now();
    const hoursAgo = (h: number) => new Date(now - h * 3600_000);
    const take = 50;
    const unreconciledMobile = await this.prisma.payment.findMany({
      where: { branchId, method: { in: ['ZAAD', 'EDAHAB'] }, amount: { gt: 0 }, reconciledAt: null, createdAt: { lt: hoursAgo(48) } },
      select: { id: true, method: true, reference: true, payerPhone: true, amountUsdCents: true, createdAt: true },
      take,
    });
    const [staleSessions, unapproved, senderUnpaid, codDeliveredUnpaid, ticketsUnpaid, unconfirmedDeposits, stuckParcels, tripsNotArrived, failedSms] =
      await Promise.all([
        this.prisma.cashSession.findMany({ where: { branchId, closedAt: null, openedAt: { lt: hoursAgo(24) } }, take }),
        this.prisma.cashSession.findMany({ where: { branchId, closedAt: { lt: hoursAgo(48) }, approvedAt: null }, take }),
        // diraha bixiyay → waa in lacag PARCEL ah jirto
        this.prisma.parcel.findMany({
          where: { fromBranchId: branchId, payer: 'SENDER', feeCents: { gt: 0 }, status: { not: 'VOIDED' }, payments: { none: { kind: 'PARCEL' } } },
          select: { id: true, trackingCode: true, feeCents: true, createdAt: true }, take,
        }),
        // COD la wareejiyay → waa in lacag jirto
        this.prisma.parcel.findMany({
          where: { toBranchId: branchId, payer: 'RECEIVER', feeCents: { gt: 0 }, status: 'DELIVERED', payments: { none: { kind: 'PARCEL' } } },
          select: { id: true, trackingCode: true, feeCents: true, deliveredAt: true, deliveredById: true }, take,
        }),
        this.prisma.booking.findMany({
          where: { branchId, priceCents: { gt: 0 }, status: { in: ['CONFIRMED', 'BOARDED'] }, payments: { none: { kind: 'TICKET' } } },
          select: { id: true, receiptNo: true, priceCents: true, soldById: true, createdAt: true }, take,
        }),
        this.prisma.deposit.findMany({ where: { branchId, confirmedAt: null, createdAt: { lt: hoursAgo(72) } }, include: { payment: { select: { amount: true, currency: true } } }, take }),
        this.prisma.parcel.findMany({
          where: { status: 'IN_TRANSIT', updatedAt: { lt: hoursAgo(48) }, ...(branchId && { OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] }) },
          select: { id: true, trackingCode: true, tripId: true, updatedAt: true }, take,
        }),
        this.prisma.trip.findMany({
          where: { status: 'DEPARTED', departureAt: { lt: hoursAgo(24) }, ...(branchId && { route: { OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] } }) },
          select: { id: true, departureAt: true, vehicleId: true }, take,
        }),
        this.prisma.notification.count({ where: { status: 'FAILED', ...(branchId && { parcel: { OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] } }) } }),
      ]);
    const checks = {
      cashSessionsOpenOver24h: staleSessions,
      closedSessionsNotApprovedOver48h: unapproved,
      senderPaidParcelsWithoutPayment: senderUnpaid,
      codDeliveredWithoutPayment: codDeliveredUnpaid,
      ticketsWithoutPayment: ticketsUnpaid,
      depositsUnconfirmedOver72h: unconfirmedDeposits,
      parcelsInTransitOver48h: stuckParcels,
      mobilePaymentsUnreconciledOver48h: unreconciledMobile,
      tripsDepartedNotArrivedOver24h: tripsNotArrived,
    };
    const issues = Object.values(checks).reduce((s, list) => s + list.length, 0) + (failedSms > 0 ? 1 : 0);
    return { ok: issues === 0, issues, failedSms, checks, checkedAt: new Date() };
  }

  /** Dashboard-ka maanta (hal call). */
  async dashboard(user: AuthUser, branchId?: string) {
    const today = businessDate();
    const b = branchFilter(user, branchId);
    const [revenue, occupancy, incoming, outgoing, openSessions] = await Promise.all([
      this.revenue(user, { from: today, to: today, branchId: b }),
      this.occupancy(user, { from: today, to: today, branchId: b }),
      this.prisma.parcel.groupBy({ by: ['status'], where: { toBranchId: b, status: { in: ['LOADED', 'IN_TRANSIT', 'ARRIVED'] } }, _count: true }),
      this.prisma.parcel.count({ where: { fromBranchId: b, status: 'REGISTERED' } }),
      this.prisma.cashSession.count({ where: { branchId: b, closedAt: null } }),
    ]);
    return {
      date: today,
      revenueUsdCents: revenue.totalUsdCents,
      perBranch: revenue.perBranch,
      trips: occupancy.totals,
      incomingParcels: Object.fromEntries(incoming.map((x) => [x.status, x._count])),
      parcelsAwaitingLoad: outgoing,
      openCashSessions: openSessions,
    };
  }
}
