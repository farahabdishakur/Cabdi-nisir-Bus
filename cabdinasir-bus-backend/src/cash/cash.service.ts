import { Injectable } from '@nestjs/common';
import { CashSession, Currency, PaymentKind, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuthUser, isSuperAdmin } from '../common/auth-user';
import { assertBranch, branchFilter, effectiveBranch } from '../common/branch-scope';
import { Errors } from '../common/errors';
import { SettingsService } from '../settings/settings.service';
import { slshToUsdCents, usdCentsToSlsh } from '../pricing/pricing';
import { AuditService } from '../audit/audit.service';
import { PaymentInputDto } from './payment.dto';
import { businessDayRange } from '../common/time';

type Money = { USD: number; SLSH: number };

/** Lacag macmiil (ma aha celin/kharash) — transaction Zaad/eDahab hal mar kaliya. Kayd (STORAGE) wuxuu wadaagaa transaction-ka COD. */
export const MOBILE_UNIQUE_KINDS: PaymentKind[] = ['TICKET', 'PARCEL', 'TRANSFER_DIFF'];

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Sanduuqa furan ee karraaniga — lacag lama qaadan karo la'aantiis (BUSINESS_RULES §7.2).
   * Row-ka waa la xiraa (FOR UPDATE) ilaa transaction-ku dhammaado: xiritaanka sanduuqa ma dhex geli karo
   * lacag la qaadayo (lacag sanduuq xiran gasha = lacag lumay), kharashyo isku mar ahna sanduuqa kama dhigi karaan taban.
   */
  async requireOpenSession(db: Tx, user: AuthUser): Promise<CashSession> {
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "cash_sessions" WHERE "cashierId" = ${user.id} AND "closedAt" IS NULL FOR UPDATE`;
    if (!rows.length) throw Errors.bad('NO_OPEN_SESSION', 'Open your cash session before taking payments');
    return db.cashSession.findUniqueOrThrow({ where: { id: rows[0].id } });
  }

  /**
   * Diiwaangeli lacag. `usdCents` = qadarka USD ee nidaamku xisaabiyay (taban = lacag celin).
   * Haddii currency = SLSH, waxaa lagu beddelaa sicirka maanta.
   */
  async recordPayment(
    db: Tx,
    user: AuthUser,
    branchId: string,
    kind: PaymentKind,
    usdCents: number,
    pay: PaymentInputDto,
    link: { bookingId?: string; parcelId?: string },
  ) {
    if (pay.method !== PaymentMethod.CASH && !pay.reference) {
      throw Errors.bad('REFERENCE_REQUIRED', 'Mobile money payments need the transaction reference');
    }
    let amount = usdCents;
    if (pay.currency === Currency.SLSH) amount = usdCentsToSlsh(usdCents, await this.settings.requireRate(db));
    return this.recordRaw(db, user, branchId, kind, amount, pay, link);
  }

  /**
   * Diiwaangeli lacag qadarkeedu yahay lacagta la qabtay (USD senti ama SLSH shilin) — kharash, deposit.
   * Taban = sanduuqa ayay ka baxaysaa.
   */
  async recordRaw(
    db: Tx,
    user: AuthUser,
    branchId: string,
    kind: PaymentKind,
    amount: number,
    pay: PaymentInputDto,
    link: { bookingId?: string; parcelId?: string } = {},
  ) {
    if (pay.method !== PaymentMethod.CASH && !pay.reference) {
      throw Errors.bad('REFERENCE_REQUIRED', 'Mobile money payments need the transaction reference');
    }
    const mobile = pay.method !== PaymentMethod.CASH;
    const reference = pay.reference ? pay.reference.replace(/\s/g, '').toUpperCase() : undefined;
    const payerPhone = pay.payerPhone ? pay.payerPhone.replace(/\s/g, '') : undefined;
    const incoming = amount > 0 && MOBILE_UNIQUE_KINDS.includes(kind);
    if (mobile && incoming) {
      if (!payerPhone) throw Errors.bad('PAYER_PHONE_REQUIRED', 'Enter the phone number the Zaad/eDahab money was sent from');
      // Hal SMS Zaad = hal lacag: transaction-ka hore loo isticmaalay → khiyaano ama qalad
      const used = await db.payment.findFirst({
        where: { method: pay.method, reference, kind: { in: MOBILE_UNIQUE_KINDS }, amount: { gt: 0 } },
        include: { booking: { select: { receiptNo: true } }, parcel: { select: { trackingCode: true } } },
      });
      if (used) {
        throw Errors.conflict('MOBILE_REFERENCE_USED', 'This Zaad/eDahab transaction was already used', {
          reference, usedOn: used.booking?.receiptNo ?? used.parcel?.trackingCode ?? null, usedAt: used.createdAt,
        });
      }
    }
    const session = await this.requireOpenSession(db, user);
    void branchId; // lacagtu waxay gashaa laanta sanduuqa (meesha lacagtu jirto) — mar walba
    let exchangeRate: number | null = null;
    let amountUsdCents = amount;
    if (pay.currency === Currency.SLSH) {
      exchangeRate = await this.settings.requireRate(db);
      amountUsdCents = slshToUsdCents(amount, exchangeRate);
    }
    return db.payment.create({
      data: {
        kind,
        ...link,
        method: pay.method,
        currency: pay.currency,
        amount,
        amountUsdCents,
        exchangeRate,
        reference,
        payerPhone,
        cashierId: user.id,
        cashSessionId: session.id,
        branchId: session.branchId,
      },
    });
  }

  async open(user: AuthUser, openingUsdCents = 0, openingSlsh = 0) {
    if (isSuperAdmin(user) && !user.branchId) throw Errors.bad('BRANCH_REQUIRED', 'Super admin has no branch drawer');
    const existing = await this.prisma.cashSession.findFirst({ where: { cashierId: user.id, closedAt: null } });
    if (existing) throw Errors.conflict('SESSION_ALREADY_OPEN', 'You already have an open cash session', { id: existing.id });
    try {
      return await this.prisma.cashSession.create({
        data: { cashierId: user.id, branchId: user.branchId!, openingFloat: { USD: openingUsdCents, SLSH: openingSlsh } },
      });
    } catch (e) {
      // unique index cash_sessions_one_open: laba tab isku mar
      if ((e as { code?: string }).code === 'P2002') throw Errors.conflict('SESSION_ALREADY_OPEN', 'You already have an open cash session');
      throw e;
    }
  }

  async current(user: AuthUser) {
    const s = await this.prisma.cashSession.findFirst({ where: { cashierId: user.id, closedAt: null } });
    if (!s) return null;
    return { ...s, summary: await this.summary(s) };
  }

  /** Lacagta la filayo sanduuqa (CASH kaliya) + wadarta habab kale. */
  async summary(s: CashSession, db: Tx | PrismaService = this.prisma) {
    const groups = await db.payment.groupBy({
      by: ['method', 'currency'],
      where: { cashSessionId: s.id },
      _sum: { amount: true, amountUsdCents: true },
      _count: true,
    });
    const opening = s.openingFloat as Money;
    const expectedCash: Money = { USD: opening.USD ?? 0, SLSH: opening.SLSH ?? 0 };
    for (const g of groups) {
      if (g.method === PaymentMethod.CASH) expectedCash[g.currency] += g._sum.amount ?? 0;
    }
    return {
      expectedCash,
      byMethod: groups.map((g) => ({
        method: g.method,
        currency: g.currency,
        count: g._count,
        amount: g._sum.amount ?? 0,
        amountUsdCents: g._sum.amountUsdCents ?? 0,
      })),
      totalUsdCents: groups.reduce((a, g) => a + (g._sum.amountUsdCents ?? 0), 0),
    };
  }

  /** Xiritaanka maalinta: counted vs expected → variance (BUSINESS_RULES §7.3). */
  async close(user: AuthUser, id: string, countedUsdCents: number, countedSlsh: number, note?: string, force = false) {
    return this.prisma.$transaction(async (tx) => {
    // Xir row-ka: lacag kasta oo socota way dhammaystirantaa ka hor (ama way sugaysaa oo NO_OPEN_SESSION ayay helaysaa)
    await tx.$queryRaw`SELECT id FROM "cash_sessions" WHERE id = ${id} FOR UPDATE`;
    const s = await tx.cashSession.findUnique({ where: { id } });
    if (!s) throw Errors.notFound('CashSession', id);
    if (force) {
      // Karraanigu wuu baxay sanduuqa oo furan: Manager-ka laanta ayaa tiriya oo xira
      assertBranch(user, s.branchId);
      if (s.cashierId === user.id) throw Errors.bad('USE_NORMAL_CLOSE', 'Close your own session normally');
      if (!note) throw Errors.bad('REASON_REQUIRED', 'Force close needs a note');
    } else if (s.cashierId !== user.id) {
      throw Errors.forbidden('Only the cashier who opened the session can close it');
    }
    if (s.closedAt) throw Errors.conflict('SESSION_CLOSED', 'Session already closed');
    const { expectedCash } = await this.summary(s, tx);
    const counted: Money = { USD: countedUsdCents, SLSH: countedSlsh };
    const variance: Money = { USD: counted.USD - expectedCash.USD, SLSH: counted.SLSH - expectedCash.SLSH };
    const closed = await tx.cashSession.update({
      where: { id },
      data: { closedAt: new Date(), expected: expectedCash, counted, variance, note, ...(force && { forceClosedById: user.id }) },
    });
    if (force) await this.audit.log(tx, user, 'FORCE_CLOSE', 'cash-sessions', id, { cashierId: s.cashierId }, { variance, note });
    return closed;
    });
  }

  async approve(user: AuthUser, id: string, note?: string) {
    const s = await this.prisma.cashSession.findUnique({ where: { id } });
    if (!s) throw Errors.notFound('CashSession', id);
    assertBranch(user, s.branchId);
    if (!s.closedAt) throw Errors.conflict('SESSION_OPEN', 'Session must be closed before approval');
    if (s.approvedAt) throw Errors.conflict('SESSION_APPROVED', 'Session already approved');
    if (s.cashierId === user.id && !isSuperAdmin(user)) throw Errors.forbidden('You cannot approve your own session');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.cashSession.update({
        where: { id },
        data: { approvedById: user.id, approvedAt: new Date(), note: note ? `${s.note ?? ''}\n[approve] ${note}`.trim() : s.note },
      });
      await this.audit.log(tx, user, 'APPROVE', 'cash-sessions', id, { variance: s.variance }, { approvedAt: updated.approvedAt });
      return updated;
    });
  }

  list(user: AuthUser, q: { branchId?: string; date?: string; pendingApproval?: boolean; open?: boolean }) {
    const where: Prisma.CashSessionWhereInput = { branchId: branchFilter(user, q.branchId) };
    if (user.role === 'CASHIER') where.cashierId = user.id;
    if (q.open) where.closedAt = null;
    else if (q.date) {
      const { start, end } = businessDayRange(q.date);
      where.openedAt = { gte: start, lt: end };
    }
    if (q.pendingApproval) Object.assign(where, { closedAt: { not: null }, approvedAt: null });
    return this.prisma.cashSession.findMany({ where, orderBy: { openedAt: 'desc' }, take: 200 });
  }

  /** Branch-ka shaqada: karraani → laantiisa; super admin → laanta la cayimay. */
  branchFor(user: AuthUser, requested?: string) {
    return effectiveBranch(user, requested);
  }
}
