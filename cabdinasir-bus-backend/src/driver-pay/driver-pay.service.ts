import { Injectable, Logger } from '@nestjs/common';
import { Currency, DriverPayType, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuthUser, isSuperAdmin } from '../common/auth-user';
import { Errors } from '../common/errors';
import { isUniqueViolation } from '../common/idempotency';
import { businessDate, businessRange } from '../common/time';
import { CashService } from '../cash/cash.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { usdCentsToSlsh } from '../pricing/pricing';
import { DriverPayDto, PayRuleDto } from './driver-pay.dto';

/**
 * Mushaharka darawallada (BUSINESS_RULES §26):
 * - Xeer darawal kasta: PER_TRIP · PERCENT_TICKETS · PERCENT_TRIP_INCOME · MONTHLY_SALARY.
 * - Safar gaadhay (ARRIVED) → kasbashada si toos ah ayaa loo diiwaangeliyaa (hal mar safar kasta).
 * - Mushahar bille → job-ka 1-da bisha (bishii hore). Bonus → gacan (manager).
 * - Horumar / mushahar la bixiyay → sanduuqa laanta (DRIVER_PAY) ama xafiiska (ledger). Ka jarid → lacag ma baxdo.
 * - Haraaga = kasbasho − horumar − bixin − ka jarid. Wax lama tirtiro (void + sabab).
 */
@Injectable()
export class DriverPayService {
  private readonly logger = new Logger('DriverPay');

  constructor(
    private readonly prisma: PrismaService,
    private readonly cash: CashService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  // ------------------------------------------------------------------ access

  /** Manager: darawallada laantiisa + kuwa shirkadda oo dhan (branchId null). Super Admin: dhammaan. */
  async driverFor(user: AuthUser, driverId: string, db: Tx | PrismaService = this.prisma) {
    const d = await db.driver.findUnique({ where: { id: driverId } });
    if (!d) throw Errors.notFound('Driver', driverId);
    if (!isSuperAdmin(user) && d.branchId && d.branchId !== user.branchId) throw Errors.forbiddenBranch();
    return d;
  }

  private visibleDrivers(user: AuthUser): Prisma.DriverWhereInput {
    return isSuperAdmin(user) ? {} : { OR: [{ branchId: user.branchId }, { branchId: null }] };
  }

  // ------------------------------------------------------------------ rules

  async currentRule(driverId: string, at: Date = new Date(), db: Tx | PrismaService = this.prisma) {
    return db.driverPayRule.findFirst({ where: { driverId, effectiveFrom: { lte: at } }, orderBy: { effectiveFrom: 'desc' } });
  }

  async setRule(user: AuthUser, driverId: string, dto: PayRuleDto) {
    await this.driverFor(user, driverId);
    const percent = dto.type === DriverPayType.PERCENT_TICKETS || dto.type === DriverPayType.PERCENT_TRIP_INCOME;
    if (percent && !dto.bps) throw Errors.bad('BPS_REQUIRED', 'Percentage rules need bps (1000 = 10%)');
    if (!percent && !dto.amountCents) throw Errors.bad('AMOUNT_REQUIRED', 'Fixed rules need amountCents');
    const rule = await this.prisma.driverPayRule.create({
      data: {
        driverId,
        type: dto.type,
        amountCents: percent ? 0 : dto.amountCents!,
        bps: percent ? dto.bps! : 0,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
        createdById: user.id,
      },
    });
    await this.audit.log(this.prisma, user, 'SET_PAY_RULE', 'drivers', driverId, null, rule);
    return rule;
  }

  rules(driverId: string) {
    return this.prisma.driverPayRule.findMany({ where: { driverId }, orderBy: { effectiveFrom: 'desc' } });
  }

  // ------------------------------------------------------------------ earnings (automatic)

  /** Safar gaadhay → kasbashada darawalka (idempotent: hal mar safar kasta). */
  async accrueTrip(db: Tx, tripId: string) {
    const trip = await db.trip.findUnique({ where: { id: tripId } });
    if (!trip) return null;
    const rule = await this.currentRule(trip.driverId, trip.departureAt, db);
    if (!rule || rule.type === DriverPayType.MONTHLY_SALARY) return null;
    const exists = await db.driverEarning.findUnique({ where: { driverId_tripId: { driverId: trip.driverId, tripId } } });
    if (exists) return exists;

    let base = 0;
    let ticketsUsdCents = 0;
    let parcelsUsdCents = 0;
    if (rule.type !== DriverPayType.PER_TRIP) {
      const t = await db.payment.aggregate({
        where: { booking: { tripId }, kind: { in: ['TICKET', 'REFUND', 'TRANSFER_DIFF'] } },
        _sum: { amountUsdCents: true },
      });
      ticketsUsdCents = t._sum.amountUsdCents ?? 0;
      if (rule.type === DriverPayType.PERCENT_TRIP_INCOME) {
        const p = await db.parcel.aggregate({ where: { tripId, status: { not: 'VOIDED' } }, _sum: { feeCents: true } });
        parcelsUsdCents = p._sum.feeCents ?? 0;
      }
      base = ticketsUsdCents + parcelsUsdCents;
    }
    const amountCents = rule.type === DriverPayType.PER_TRIP ? rule.amountCents : Math.round((Math.max(0, base) * rule.bps) / 10000);
    return db.driverEarning.create({
      data: {
        driverId: trip.driverId,
        kind: 'TRIP',
        tripId,
        amountCents,
        basis: { type: rule.type, ruleId: rule.id, amountCents: rule.amountCents, bps: rule.bps, ticketsUsdCents, parcelsUsdCents },
      },
    });
  }

  /** Mushaharka bille (bishii `period` = YYYY-MM): darawal kasta oo xeerkiisu MONTHLY_SALARY yahay. Idempotent. */
  async accrueMonthly(period: string) {
    const start = new Date(`${period}-01T00:00:00+03:00`);
    // accrual: mushaharka bisha waxaa lagu taariikhaynayaa dhammaadka bishaas (P&L-ka bishaas ayuu galayaa)
    const [y, m] = period.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    const periodEnd = new Date(new Date(`${next}-01T00:00:00+03:00`).getTime() - 1000);
    const nextStart = periodEnd.getTime() + 1000;
    const DAY = 86_400_000;
    const days = Math.round((nextStart - start.getTime()) / DAY);
    // Darawallada firfircoon + kuwa la joojiyay bishan gudaheeda (ilaa maalintii la joojiyay ayaa la siinayaa)
    const drivers = await this.prisma.driver.findMany({ where: { OR: [{ isActive: true }, { updatedAt: { gte: start } }] } });
    let created = 0;
    for (const d of drivers) {
      const rules = await this.prisma.driverPayRule.findMany({ where: { driverId: d.id, effectiveFrom: { lt: new Date(nextStart) } }, orderBy: { effectiveFrom: 'asc' } });
      if (!rules.some((r) => r.type === DriverPayType.MONTHLY_SALARY)) continue;
      // Maalin kasta: xeerka shaqaynayay dhammaadka maalintaas — mushaharka bisha waxaa loo qaybiyaa maalmaha (prorate):
      // xeer la dhigay 25-ka → 25-ka ilaa dhammaadka; laga beddelay safar-kasta 15-ka → 1-14 kaliya
      let sum = 0;
      let paidDays = 0;
      let ruleId = '';
      for (let i = 0; i < days; i++) {
        const dayEnd = start.getTime() + (i + 1) * DAY - 1;
        if (!d.isActive && d.updatedAt.getTime() < start.getTime() + i * DAY) break;
        const rule = [...rules].reverse().find((r) => r.effectiveFrom.getTime() <= dayEnd);
        if (rule?.type !== DriverPayType.MONTHLY_SALARY) continue;
        sum += rule.amountCents / days;
        paidDays++;
        ruleId = rule.id;
      }
      const amountCents = Math.round(sum);
      if (amountCents <= 0) continue;
      try {
        await this.prisma.driverEarning.create({
          data: { driverId: d.id, kind: 'SALARY', period, amountCents, basis: { type: DriverPayType.MONTHLY_SALARY, ruleId, period, days: paidDays, daysInMonth: days }, createdAt: periodEnd },
        });
        created++;
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
    if (created) this.logger.log(`Monthly salary ${period}: ${created} driver(s)`);
    return { period, created };
  }

  async bonus(user: AuthUser, driverId: string, amountCents: number, note: string) {
    await this.driverFor(user, driverId);
    const e = await this.prisma.driverEarning.create({ data: { driverId, kind: 'BONUS', amountCents, note, basis: { manual: true }, createdById: user.id } });
    await this.audit.log(this.prisma, user, 'DRIVER_BONUS', 'drivers', driverId, null, { amountCents, note });
    return e;
  }

  async voidEarning(user: AuthUser, id: string, reason: string) {
    const e = await this.prisma.driverEarning.findUnique({ where: { id } });
    if (!e) throw Errors.notFound('DriverEarning', id);
    await this.driverFor(user, e.driverId);
    const res = await this.prisma.driverEarning.updateMany({ where: { id, voidedAt: null }, data: { voidedAt: new Date(), voidReason: reason } });
    if (res.count !== 1) throw Errors.conflict('ALREADY_VOIDED', 'Already voided');
    await this.audit.log(this.prisma, user, 'VOID', 'driver-earnings', id, { amountCents: e.amountCents }, { reason });
    return this.prisma.driverEarning.findUniqueOrThrow({ where: { id } });
  }

  // ------------------------------------------------------------------ payments to the driver

  /**
   * Horumar / mushahar / ka jarid.
   * - Laan (manager): lacagta waxay ka baxdaa sanduuqiisa (Payment DRIVER_PAY) — sanduuq furan + lacag ku filan.
   * - Super Admin: buugga xafiiska (LedgerEntry HEAD_OFFICE OUT).
   * - DEDUCTION: lacag ma baxdo — haraaga ayaa yaraada.
   */
  async pay(user: AuthUser, driverId: string, dto: DriverPayDto, idempotencyKey?: string) {
    if (idempotencyKey) {
      const prev = await this.prisma.driverPayment.findUnique({ where: { idempotencyKey } });
      if (prev) {
        if (prev.createdById !== user.id) throw Errors.conflict('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was used by another user');
        return prev;
      }
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const driver = await this.driverFor(user, driverId, tx);
        let paymentId: string | undefined;
        let ledgerEntryId: string | undefined;
        if (dto.kind !== 'DEDUCTION') {
          const pay = { method: dto.method ?? PaymentMethod.CASH, currency: dto.currency ?? Currency.USD, reference: dto.reference };
          if (user.branchId) {
            await this.assertDrawerCash(tx, user, dto.amountCents, pay.currency, pay.method);
            const p = await this.cash.recordPayment(tx, user, user.branchId, 'DRIVER_PAY', -dto.amountCents, pay, {});
            paymentId = p.id;
          } else {
            const rate = pay.currency === 'SLSH' ? await this.settings.requireRate(tx) : null;
            const entry = await tx.ledgerEntry.create({
              data: {
                book: 'HEAD_OFFICE', direction: 'OUT', category: 'DRIVER_PAY', description: `${driver.name}: ${dto.kind}${dto.note ? ` — ${dto.note}` : ''}`,
                currency: pay.currency, amount: rate ? usdCentsToSlsh(dto.amountCents, rate) : dto.amountCents, amountUsdCents: dto.amountCents,
                exchangeRate: rate, method: pay.method, reference: pay.reference, createdById: user.id,
              },
            });
            ledgerEntryId = entry.id;
          }
        }
        const dp = await tx.driverPayment.create({
          data: { driverId, kind: dto.kind, amountCents: dto.amountCents, paymentId, ledgerEntryId, note: dto.note, idempotencyKey, createdById: user.id },
        });
        await this.audit.log(tx, user, `DRIVER_${dto.kind}`, 'drivers', driverId, null, { amountCents: dto.amountCents, paymentId, ledgerEntryId, note: dto.note });
        return dp;
      });
    } catch (e) {
      if (idempotencyKey && isUniqueViolation(e, 'idempotencyKey')) {
        const prev = await this.prisma.driverPayment.findUniqueOrThrow({ where: { idempotencyKey } });
        if (prev.createdById !== user.id) throw Errors.conflict('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was used by another user');
        return prev;
      }
      throw e;
    }
  }

  /** Void: sanduuqa weli furan → lacagta dib ayay ugu noqotaa; xafiis → ledger void; ka jarid → kaliya calaamad. */
  async voidPayment(user: AuthUser, id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const dp = await tx.driverPayment.findUnique({ where: { id } });
      if (!dp) throw Errors.notFound('DriverPayment', id);
      await this.driverFor(user, dp.driverId, tx);
      // Bixinta xafiiska guud (Super Admin) — maamule laan ma void-gareyn karo (buugga xafiiska waa Super Admin kaliya)
      if (dp.ledgerEntryId && !isSuperAdmin(user)) throw Errors.forbidden();
      // Goyn (deduction) — cidda laanta darawalka ama Super Admin
      if (!dp.paymentId && !dp.ledgerEntryId && !isSuperAdmin(user)) {
        const by = await tx.user.findUnique({ where: { id: dp.createdById }, select: { branchId: true } });
        if (by?.branchId !== user.branchId) throw Errors.forbiddenBranch();
      }
      if (dp.paymentId) {
        const p = await tx.payment.findUniqueOrThrow({ where: { id: dp.paymentId }, include: { cashSession: true } });
        await tx.$queryRaw`SELECT id FROM "cash_sessions" WHERE id = ${p.cashSessionId} FOR UPDATE`;
        const s = await tx.cashSession.findUniqueOrThrow({ where: { id: p.cashSessionId } });
        if (s.closedAt) throw Errors.conflict('SESSION_CLOSED', 'Cash session already closed; record a correction instead');
        if (!isSuperAdmin(user) && p.branchId !== user.branchId) throw Errors.forbiddenBranch();
      }
      const claimed = await tx.driverPayment.updateMany({ where: { id, voidedAt: null }, data: { voidedAt: new Date(), voidedById: user.id, voidReason: reason } });
      if (claimed.count !== 1) throw Errors.conflict('ALREADY_VOIDED', 'Already voided');
      if (dp.paymentId) {
        const p = await tx.payment.findUniqueOrThrow({ where: { id: dp.paymentId } });
        await tx.payment.create({
          data: {
            kind: 'DRIVER_PAY', method: p.method, currency: p.currency, amount: -p.amount, amountUsdCents: -p.amountUsdCents, exchangeRate: p.exchangeRate,
            reference: p.reference, cashierId: p.cashierId, cashSessionId: p.cashSessionId, branchId: p.branchId,
          },
        });
      }
      if (dp.ledgerEntryId) {
        await tx.ledgerEntry.update({ where: { id: dp.ledgerEntryId }, data: { voidedAt: new Date(), voidedById: user.id, voidReason: reason } });
      }
      await this.audit.log(tx, user, 'VOID', 'driver-payments', id, { amountCents: dp.amountCents, kind: dp.kind }, { reason });
      return tx.driverPayment.findUniqueOrThrow({ where: { id } });
    });
  }

  private async assertDrawerCash(tx: Tx, user: AuthUser, usdCents: number, currency: Currency, method: PaymentMethod) {
    if (method !== PaymentMethod.CASH) return;
    const session = await this.cash.requireOpenSession(tx, user);
    const { expectedCash } = await this.cash.summary(session, tx);
    const need = currency === 'SLSH' ? usdCentsToSlsh(usdCents, await this.settings.requireRate(tx)) : usdCents;
    if (need > expectedCash[currency]) throw Errors.bad('INSUFFICIENT_CASH', 'Not enough cash in the drawer', { available: expectedCash[currency], currency });
  }

  // ------------------------------------------------------------------ statement & summary

  /** Rasiidka bixinta darawalka (voucher): lacagta la siiyay + wadarta kasbashada/bixinta ilaa markaas + haraaga. */
  async voucher(user: AuthUser, id: string) {
    const dp = await this.prisma.driverPayment.findUnique({ where: { id }, include: { driver: true } });
    if (!dp) throw Errors.notFound('DriverPayment', id);
    await this.driverFor(user, dp.driverId);
    const upTo = { lte: dp.createdAt };
    const [earned, paid, payment, entry, by] = await Promise.all([
      this.prisma.driverEarning.aggregate({ where: { driverId: dp.driverId, voidedAt: null, createdAt: upTo }, _sum: { amountCents: true } }),
      this.prisma.driverPayment.aggregate({ where: { driverId: dp.driverId, voidedAt: null, createdAt: upTo }, _sum: { amountCents: true } }),
      dp.paymentId ? this.prisma.payment.findUnique({ where: { id: dp.paymentId } }) : null,
      dp.ledgerEntryId ? this.prisma.ledgerEntry.findUnique({ where: { id: dp.ledgerEntryId } }) : null,
      this.prisma.user.findUnique({ where: { id: dp.createdById }, select: { name: true } }),
    ]);
    const earnedCents = earned._sum.amountCents ?? 0;
    const paidCents = paid._sum.amountCents ?? 0;
    const thisCents = dp.voidedAt ? 0 : dp.amountCents;
    return {
      id: dp.id,
      kind: dp.kind,
      amountCents: dp.amountCents,
      note: dp.note,
      createdAt: dp.createdAt,
      voided: !!dp.voidedAt,
      voidReason: dp.voidReason,
      driver: { id: dp.driver.id, name: dp.driver.name, phone: dp.driver.phone },
      branchId: payment?.branchId ?? dp.driver.branchId,
      method: payment?.method ?? entry?.method ?? null,
      currency: payment?.currency ?? entry?.currency ?? 'USD',
      paidAmount: payment ? -payment.amount : entry?.amount ?? null,
      reference: payment?.reference ?? entry?.reference ?? null,
      createdBy: by?.name ?? null,
      earnedTotalCents: earnedCents,
      paidTotalCents: paidCents,
      balanceBeforeCents: earnedCents - paidCents + thisCents,
      balanceAfterCents: earnedCents - paidCents,
    };
  }


  private async balanceBefore(driverId: string, before?: Date) {
    const at = before ? { lt: before } : undefined;
    const [earned, paid] = await Promise.all([
      this.prisma.driverEarning.aggregate({ where: { driverId, voidedAt: null, createdAt: at }, _sum: { amountCents: true } }),
      this.prisma.driverPayment.aggregate({ where: { driverId, voidedAt: null, createdAt: at }, _sum: { amountCents: true } }),
    ]);
    return (earned._sum.amountCents ?? 0) - (paid._sum.amountCents ?? 0);
  }

  /** Bayaanka darawalka: haraaga bilowga, dhaqdhaqaaqa (kasbasho +, bixin −), haraaga dhammaadka. */
  async statement(user: AuthUser, driverId: string, q: { from?: string; to?: string }) {
    const driver = await this.driverFor(user, driverId);
    const from = q.from ?? `${businessDate().slice(0, 8)}01`;
    const to = q.to ?? businessDate();
    const r = businessRange(from, to);
    const [opening, earnings, payments, rule] = await Promise.all([
      this.balanceBefore(driverId, r.start),
      this.prisma.driverEarning.findMany({ where: { driverId, createdAt: { gte: r.start, lt: r.end } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.driverPayment.findMany({ where: { driverId, createdAt: { gte: r.start, lt: r.end } }, orderBy: { createdAt: 'asc' } }),
      this.currentRule(driverId),
    ]);
    const tripIds = earnings.map((e) => e.tripId).filter((x): x is string => !!x);
    const trips = await this.prisma.trip.findMany({ where: { id: { in: tripIds } }, include: { route: { include: { fromBranch: true, toBranch: true } }, vehicle: true } });
    const tripLabel = new Map(trips.map((t) => [t.id, { departureAt: t.departureAt, route: `${t.route.fromBranch.code} → ${t.route.toBranch.code}`, vehicle: t.vehicle.plate }]));
    type Line = { id: string; at: Date; type: string; description: string; inCents: number; outCents: number; voided: boolean; trip?: unknown };
    const lines: Line[] = [
      ...earnings.map((e) => ({
        id: e.id, at: e.createdAt, type: e.kind, description: e.kind === 'SALARY' ? `Mushahar ${e.period}` : e.note ?? '',
        inCents: e.amountCents, outCents: 0, voided: !!e.voidedAt, trip: e.tripId ? tripLabel.get(e.tripId) : undefined,
      })),
      ...payments.map((p) => ({ id: p.id, at: p.createdAt, type: p.kind, description: p.note ?? '', inCents: 0, outCents: p.amountCents, voided: !!p.voidedAt })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    let bal = opening;
    const withBalance = lines.map((l) => {
      if (!l.voided) bal += l.inCents - l.outCents;
      return { ...l, balanceCents: bal };
    });
    const live = lines.filter((l) => !l.voided);
    return {
      driver: { id: driver.id, name: driver.name, phone: driver.phone, branchId: driver.branchId },
      rule,
      from,
      to,
      openingCents: opening,
      earnedCents: live.reduce((s, l) => s + l.inCents, 0),
      paidCents: live.reduce((s, l) => s + l.outCents, 0),
      trips: earnings.filter((e) => e.kind === 'TRIP' && !e.voidedAt).length,
      closingCents: bal,
      lines: withBalance,
    };
  }

  /** Dhammaan darawallada: safaro, kasbasho, bixin (muddada) + haraaga hadda. */
  async summary(user: AuthUser, q: { from?: string; to?: string }) {
    const from = q.from ?? `${businessDate().slice(0, 8)}01`;
    const to = q.to ?? businessDate();
    const r = businessRange(from, to);
    const drivers = await this.prisma.driver.findMany({ where: this.visibleDrivers(user), orderBy: { name: 'asc' } });
    const ids = drivers.map((d) => d.id);
    const range = { gte: r.start, lt: r.end };
    const [earnedP, paidP, earnedAll, paidAll, trips, rules] = await Promise.all([
      this.prisma.driverEarning.groupBy({ by: ['driverId'], where: { driverId: { in: ids }, voidedAt: null, createdAt: range }, _sum: { amountCents: true } }),
      this.prisma.driverPayment.groupBy({ by: ['driverId'], where: { driverId: { in: ids }, voidedAt: null, createdAt: range }, _sum: { amountCents: true } }),
      this.prisma.driverEarning.groupBy({ by: ['driverId'], where: { driverId: { in: ids }, voidedAt: null }, _sum: { amountCents: true } }),
      this.prisma.driverPayment.groupBy({ by: ['driverId'], where: { driverId: { in: ids }, voidedAt: null }, _sum: { amountCents: true } }),
      this.prisma.trip.groupBy({ by: ['driverId'], where: { driverId: { in: ids }, departureAt: range, status: { in: ['DEPARTED', 'ARRIVED', 'CLOSED'] } }, _count: true }),
      Promise.all(ids.map((id) => this.currentRule(id))),
    ]);
    const sum = (rows: { driverId: string; _sum: { amountCents: number | null } }[], id: string) => rows.find((x) => x.driverId === id)?._sum.amountCents ?? 0;
    const rows = drivers.map((d, i) => ({
      driverId: d.id,
      name: d.name,
      phone: d.phone,
      isActive: d.isActive,
      rule: rules[i] ? { type: rules[i]!.type, amountCents: rules[i]!.amountCents, bps: rules[i]!.bps } : null,
      trips: trips.find((t) => t.driverId === d.id)?._count ?? 0,
      earnedCents: sum(earnedP, d.id),
      paidCents: sum(paidP, d.id),
      balanceCents: sum(earnedAll, d.id) - sum(paidAll, d.id),
    }));
    return {
      from,
      to,
      drivers: rows,
      totals: {
        earnedCents: rows.reduce((s, x) => s + x.earnedCents, 0),
        paidCents: rows.reduce((s, x) => s + x.paidCents, 0),
        owedCents: rows.reduce((s, x) => s + Math.max(0, x.balanceCents), 0),
      },
    };
  }
}
