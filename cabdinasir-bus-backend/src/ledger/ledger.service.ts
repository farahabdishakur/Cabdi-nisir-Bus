import { Injectable } from '@nestjs/common';
import { Currency, PaymentMethod, Prisma } from '@prisma/client';
import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, isSuperAdmin } from '../common/auth-user';
import { branchFilter, effectiveBranch } from '../common/branch-scope';
import { Errors } from '../common/errors';
import { isUniqueViolation } from '../common/idempotency';
import { businessDate, businessRange } from '../common/time';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { slshToUsdCents } from '../pricing/pricing';
import { INCOME_KINDS } from '../reports/reports.service';
import { LedgerEntryDto } from './ledger.dto';

/** Qaybaha buugga xafiiska (gelin gacan). CAPITAL & VEHICLE_PURCHASE ma aha dakhli/kharash P&L (raasumaal). */
export const LEDGER_IN_CATEGORIES = ['OTHER_INCOME', 'CAPITAL', 'LOAN_RECEIVED'] as const;
export const LEDGER_OUT_CATEGORIES = ['FUEL', 'MAINTENANCE', 'RENT', 'SALARY', 'INSURANCE', 'TAX', 'UTILITIES', 'VEHICLE_PURCHASE', 'LOAN_REPAYMENT', 'OWNER_DRAWING', 'OTHER'] as const;
const NOT_PNL = new Set(['CAPITAL', 'LOAN_RECEIVED', 'VEHICLE_PURCHASE', 'LOAN_REPAYMENT', 'OWNER_DRAWING', 'DRIVER_PAY']);

const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

type Account = 'CASH_USD' | 'CASH_SLSH' | 'ZAAD' | 'EDAHAB';
const accountOf = (method: PaymentMethod, currency: Currency): Account => (method === 'CASH' ? (currency === 'USD' ? 'CASH_USD' : 'CASH_SLSH') : method);

/**
 * Buugga xisaabaadka (CashBook) — si toos ah:
 * - BRANCH: lacag kasta oo laanta (tigidh, alaab, kayd, celin, kharash, wareejin, darawal) → gelin, haraaga socda (akoon kasta).
 * - HEAD_OFFICE (Super Admin): wareejinta laamaha (marka la xaqiijiyo) + gelinta gacanta (dakhli kale, kharash, raasumaal …).
 * - P&L: dakhli − kharash − mushaharka darawallada (accrual) = faa'iido; laan kasta & gaari kasta.
 */
/** Safafka ugu badan ee hal mar la muujiyo (haraaga + wadarta waxaa laga xisaabiyaa muddada oo dhan) */
const LINE_LIMIT = 3000;

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService, private readonly audit: AuditService) {}

  // ------------------------------------------------------------------ manual entries (head office)

  async create(user: AuthUser, dto: LedgerEntryDto, idempotencyKey?: string) {
    const allowed: readonly string[] = dto.direction === 'IN' ? LEDGER_IN_CATEGORIES : LEDGER_OUT_CATEGORIES;
    if (!allowed.includes(dto.category)) throw Errors.bad('INVALID_CATEGORY', `Category must be one of: ${allowed.join(', ')}`);
    if (idempotencyKey) {
      const prev = await this.prisma.ledgerEntry.findUnique({ where: { idempotencyKey } });
      if (prev) return prev;
    }
    const rate = dto.currency === 'SLSH' ? await this.settings.requireRate() : null;
    try {
      const e = await this.prisma.ledgerEntry.create({
        data: {
          book: 'HEAD_OFFICE', direction: dto.direction, category: dto.category, description: dto.description, currency: dto.currency, amount: dto.amount,
          amountUsdCents: rate ? slshToUsdCents(dto.amount, rate) : dto.amount, exchangeRate: rate, method: dto.method ?? 'CASH', reference: dto.reference,
          entryDate: dto.entryDate ? new Date(dto.entryDate) : new Date(), attributedBranchId: dto.branchId, vehicleId: dto.vehicleId, idempotencyKey, createdById: user.id,
        },
      });
      await this.audit.log(this.prisma, user, 'LEDGER_ENTRY', 'ledger', e.id, null, e);
      return e;
    } catch (err) {
      if (idempotencyKey && isUniqueViolation(err, 'idempotencyKey')) return this.prisma.ledgerEntry.findUniqueOrThrow({ where: { idempotencyKey } });
      throw err;
    }
  }

  async void(user: AuthUser, id: string, reason: string) {
    const e = await this.prisma.ledgerEntry.findUnique({ where: { id } });
    if (!e) throw Errors.notFound('LedgerEntry', id);
    // Bixinta darawalka (xafiiska) waxaa laga void-gareeyaa bayaanka darawalka si haraaga darawalka u saxmo
    if (await this.prisma.driverPayment.count({ where: { ledgerEntryId: id } })) throw Errors.bad('USE_DRIVER_PAY_VOID', 'Void this from the driver statement');
    const res = await this.prisma.ledgerEntry.updateMany({ where: { id, voidedAt: null }, data: { voidedAt: new Date(), voidedById: user.id, voidReason: reason } });
    if (res.count !== 1) throw Errors.conflict('ALREADY_VOIDED', 'Already voided');
    await this.audit.log(this.prisma, user, 'VOID', 'ledger', id, { amount: e.amount }, { reason });
    return this.prisma.ledgerEntry.findUniqueOrThrow({ where: { id } });
  }

  // ------------------------------------------------------------------ attachments (bill photo)

  async attach(user: AuthUser, kind: 'expense' | 'ledger', id: string, file: { buffer: Buffer; mimetype: string } | undefined) {
    if (!file) throw Errors.bad('FILE_REQUIRED', 'Upload a file in field "file"');
    const ext = PHOTO_TYPES[file.mimetype];
    const b = file.buffer;
    const sniffed =
      ext === 'jpg' ? b[0] === 0xff && b[1] === 0xd8 : ext === 'png' ? b.subarray(0, 4).toString('hex') === '89504e47'
      : ext === 'webp' ? b.subarray(8, 12).toString() === 'WEBP' : ext === 'pdf' ? b.subarray(0, 5).toString() === '%PDF-' : false;
    if (!ext || !sniffed) throw Errors.bad('INVALID_FILE_TYPE', 'Only JPEG, PNG, WEBP or PDF');
    let previous: string | null;
    if (kind === 'expense') {
      const e = await this.prisma.expense.findUnique({ where: { id } });
      if (!e) throw Errors.notFound('Expense', id);
      if (!isSuperAdmin(user) && e.branchId !== user.branchId) throw Errors.forbiddenBranch();
      if (e.voidedAt) throw Errors.invalidState('Expense', 'VOIDED', 'ATTACH');
      previous = e.attachmentUrl;
    } else {
      if (!isSuperAdmin(user)) throw Errors.forbidden();
      const e = await this.prisma.ledgerEntry.findUnique({ where: { id } });
      if (!e) throw Errors.notFound('LedgerEntry', id);
      if (e.voidedAt) throw Errors.invalidState('LedgerEntry', 'VOIDED', 'ATTACH');
      previous = e.attachmentUrl;
    }
    // Biil la beddelo = caddayn la beddelay → karraanigu ma beddeli karo; maamuluhu wuu beddeli karaa (audit)
    if (previous && user.role === 'CASHIER') throw Errors.conflict('BILL_ALREADY_ATTACHED', 'A bill is already attached — ask a manager to replace it');
    const dir = join(this.uploadDir, 'bills');
    await mkdir(dir, { recursive: true });
    const name = `${kind}-${id}-${Date.now()}.${ext}`;
    await writeFile(join(dir, name), b);
    const url = `bills/${name}`;
    await this.audit.log(this.prisma, user, previous ? 'REPLACE_BILL' : 'ATTACH_BILL', kind === 'expense' ? 'expenses' : 'ledger', id, { attachmentUrl: previous }, { attachmentUrl: url });
    return kind === 'expense'
      ? this.prisma.expense.update({ where: { id }, data: { attachmentUrl: url } })
      : this.prisma.ledgerEntry.update({ where: { id }, data: { attachmentUrl: url } });
  }

  async attachmentPath(user: AuthUser, kind: 'expense' | 'ledger', id: string) {
    let url: string | null = null;
    if (kind === 'expense') {
      const e = await this.prisma.expense.findUnique({ where: { id } });
      if (!e) throw Errors.notFound('Expense', id);
      if (!isSuperAdmin(user) && e.branchId !== user.branchId) throw Errors.forbiddenBranch();
      url = e.attachmentUrl;
    } else {
      if (!isSuperAdmin(user)) throw Errors.forbidden();
      url = (await this.prisma.ledgerEntry.findUnique({ where: { id } }))?.attachmentUrl ?? null;
    }
    if (!url) throw Errors.notFound('Attachment', id);
    return resolve(this.uploadDir, url);
  }

  private get uploadDir() {
    return resolve(process.env.UPLOAD_DIR ?? './uploads');
  }

  // ------------------------------------------------------------------ cashbook

  /** Buugga laanta: dhammaan lacagaha (si toos ah) + haraaga socda akoon kasta (Cash USD / Cash SLSH / Zaad / eDahab). */
  async branchBook(user: AuthUser, q: { branchId?: string; from?: string; to?: string; account?: Account }) {
    const branchId = effectiveBranch(user, q.branchId);
    const from = q.from ?? businessDate();
    const to = q.to ?? from;
    const r = businessRange(from, to);
    const accountWhere = (a?: Account): Prisma.PaymentWhereInput =>
      !a ? {} : a === 'CASH_USD' ? { method: 'CASH', currency: 'USD' } : a === 'CASH_SLSH' ? { method: 'CASH', currency: 'SLSH' } : { method: a };
    const rangeWhere: Prisma.PaymentWhereInput = { branchId, createdAt: { gte: r.start, lt: r.end }, ...accountWhere(q.account) };
    const [openingRows, payments, rangeRows, inAgg, outAgg, count] = await Promise.all([
      this.prisma.payment.groupBy({ by: ['method', 'currency'], where: { branchId, createdAt: { lt: r.start }, ...accountWhere(q.account) }, _sum: { amount: true } }),
      this.prisma.payment.findMany({
        where: { branchId, createdAt: { gte: r.start, lt: r.end }, ...accountWhere(q.account) },
        include: {
          booking: { select: { receiptNo: true, passengerName: true } },
          parcel: { select: { trackingCode: true, receiverName: true } },
          expense: { select: { category: true, description: true, attachmentUrl: true, id: true } },
          deposit: { select: { target: true, confirmedAt: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: LINE_LIMIT,
      }),
      // haraaga dhammaadka + wadarta: muddada oo dhan (ma aha safafka la muujiyay oo keliya)
      this.prisma.payment.groupBy({ by: ['method', 'currency'], where: rangeWhere, _sum: { amount: true } }),
      this.prisma.payment.aggregate({ where: { ...rangeWhere, amountUsdCents: { gt: 0 } }, _sum: { amountUsdCents: true } }),
      this.prisma.payment.aggregate({ where: { ...rangeWhere, amountUsdCents: { lt: 0 } }, _sum: { amountUsdCents: true } }),
      this.prisma.payment.count({ where: rangeWhere }),
    ]);
    const driverPays = await this.prisma.driverPayment.findMany({ where: { paymentId: { in: payments.filter((p) => p.kind === 'DRIVER_PAY').map((p) => p.id) } }, include: { driver: { select: { name: true } } } });
    const balances: Record<Account, number> = { CASH_USD: 0, CASH_SLSH: 0, ZAAD: 0, EDAHAB: 0 };
    for (const o of openingRows) balances[accountOf(o.method, o.currency)] += o._sum.amount ?? 0;
    const opening = { ...balances };
    const lines = payments.map((p) => {
      const acct = accountOf(p.method, p.currency);
      balances[acct] += p.amount;
      const dp = driverPays.find((d) => d.paymentId === p.id);
      return {
        id: p.id,
        at: p.createdAt,
        kind: p.kind,
        account: acct,
        currency: p.currency,
        inAmount: p.amount > 0 ? p.amount : 0,
        outAmount: p.amount < 0 ? -p.amount : 0,
        amountUsdCents: p.amountUsdCents,
        balance: balances[acct],
        reference: p.reference,
        ref: p.booking?.receiptNo ?? p.parcel?.trackingCode ?? null,
        description: p.booking?.passengerName ?? p.parcel?.receiverName ?? p.expense?.description ?? (dp ? dp.driver.name : null) ?? p.deposit?.target ?? null,
        category: p.expense?.category ?? null,
        expenseId: p.expense?.id ?? null,
        hasAttachment: !!p.expense?.attachmentUrl,
        cashierId: p.cashierId,
      };
    });
    const closing: Record<Account, number> = { ...opening };
    for (const g of rangeRows) closing[accountOf(g.method, g.currency)] += g._sum.amount ?? 0;
    const totalIn = inAgg._sum.amountUsdCents ?? 0;
    const totalOut = -(outAgg._sum.amountUsdCents ?? 0);
    return {
      book: 'BRANCH', branchId, from, to, opening, closing, totals: { inUsdCents: totalIn, outUsdCents: totalOut, netUsdCents: totalIn - totalOut },
      lines, totalLines: count, truncated: count > lines.length,
    };
  }

  /** Buugga xafiiska guud (Super Admin): wareejinta laamaha (la xaqiijiyay) + gelinta gacanta. */
  async officeBook(q: { from?: string; to?: string }) {
    const from = q.from ?? `${businessDate().slice(0, 8)}01`;
    const to = q.to ?? businessDate();
    const r = businessRange(from, to);
    const [depBefore, ledBefore, deposits, entries] = await Promise.all([
      this.prisma.deposit.findMany({ where: { confirmedAt: { lt: r.start } }, include: { payment: true } }),
      this.prisma.ledgerEntry.findMany({ where: { book: 'HEAD_OFFICE', voidedAt: null, entryDate: { lt: r.start } } }),
      this.prisma.deposit.findMany({ where: { confirmedAt: { gte: r.start, lt: r.end } }, include: { payment: true, branch: { select: { name: true } } } }),
      this.prisma.ledgerEntry.findMany({ where: { book: 'HEAD_OFFICE', entryDate: { gte: r.start, lt: r.end } }, orderBy: { entryDate: 'asc' } }),
    ]);
    const bal: Record<Currency, number> = { USD: 0, SLSH: 0 };
    for (const d of depBefore) bal[d.payment.currency] += -d.payment.amount;
    for (const e of ledBefore) bal[e.currency] += e.direction === 'IN' ? e.amount : -e.amount;
    const opening = { ...bal };
    type Line = { id: string; at: Date; source: 'DEPOSIT' | 'ENTRY'; direction: 'IN' | 'OUT'; category: string; description: string; currency: Currency; amount: number; amountUsdCents: number; voided: boolean; hasAttachment: boolean; balance?: number };
    const lines: Line[] = [
      ...deposits.map((d) => ({
        id: d.id, at: d.confirmedAt!, source: 'DEPOSIT' as const, direction: 'IN' as const, category: 'BRANCH_DEPOSIT', description: `${d.branch.name}${d.note ? ` — ${d.note}` : ''}`,
        currency: d.payment.currency, amount: -d.payment.amount, amountUsdCents: -d.payment.amountUsdCents, voided: false, hasAttachment: false,
      })),
      ...entries.map((e) => ({
        id: e.id, at: e.entryDate, source: 'ENTRY' as const, direction: e.direction, category: e.category, description: e.description,
        currency: e.currency, amount: e.amount, amountUsdCents: e.amountUsdCents, voided: !!e.voidedAt, hasAttachment: !!e.attachmentUrl,
      })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    for (const l of lines) {
      if (!l.voided) bal[l.currency] += l.direction === 'IN' ? l.amount : -l.amount;
      l.balance = bal[l.currency];
    }
    const live = lines.filter((l) => !l.voided);
    return {
      book: 'HEAD_OFFICE', from, to, opening, closing: bal,
      totals: { inUsdCents: live.filter((l) => l.direction === 'IN').reduce((s, l) => s + l.amountUsdCents, 0), outUsdCents: live.filter((l) => l.direction === 'OUT').reduce((s, l) => s + l.amountUsdCents, 0) },
      lines,
    };
  }

  // ------------------------------------------------------------------ profit & loss

  async profitLoss(user: AuthUser, q: { from?: string; to?: string; branchId?: string }) {
    const from = q.from ?? `${businessDate().slice(0, 8)}01`;
    const to = q.to ?? businessDate();
    const r = businessRange(from, to);
    const branchId = branchFilter(user, q.branchId);
    const inRange = { gte: r.start, lt: r.end };

    const [incomeRows, expenseRows, ledger, earnings] = await Promise.all([
      this.prisma.payment.groupBy({ by: ['kind'], where: { branchId, createdAt: inRange, kind: { in: INCOME_KINDS } }, _sum: { amountUsdCents: true } }),
      // kharashka sanduuqa — kuwa la void-gareeyay lama tiriyo (lacag celintoodu expense row ma leh)
      this.prisma.$queryRaw<{ category: string; usd: bigint }[]>`
        SELECT e.category::text AS category, COALESCE(SUM(-p."amountUsdCents"), 0)::bigint AS usd
        FROM "payments" p JOIN "expenses" e ON e."paymentId" = p.id
        WHERE p."createdAt" >= ${r.start} AND p."createdAt" < ${r.end} AND e."voidedAt" IS NULL
          AND (${branchId ?? null}::text IS NULL OR p."branchId" = ${branchId ?? null}::text)
        GROUP BY 1`,
      this.prisma.ledgerEntry.findMany({
        where: { book: 'HEAD_OFFICE', voidedAt: null, entryDate: inRange, ...(branchId && { attributedBranchId: branchId }) },
      }),
      this.prisma.driverEarning.findMany({ where: { voidedAt: null, createdAt: inRange }, include: { driver: { select: { branchId: true } } } }),
    ]);
    // mushaharka darawalka laanta: safar → laanta safarka ka baxo; mushahar/bonus → laanta darawalka
    const tripIds = earnings.map((e) => e.tripId).filter((x): x is string => !!x);
    const trips = await this.prisma.trip.findMany({ where: { id: { in: tripIds } }, select: { id: true, vehicleId: true, route: { select: { fromBranchId: true } } } });
    const tripBranch = new Map(trips.map((t) => [t.id, t.route.fromBranchId]));
    const driverEarnings = earnings.filter((e) => !branchId || (e.tripId ? tripBranch.get(e.tripId) === branchId : e.driver.branchId === branchId));

    const income: { key: string; usdCents: number }[] = incomeRows.map((x) => ({ key: x.kind, usdCents: x._sum.amountUsdCents ?? 0 }));
    const otherIncome = ledger.filter((e) => e.direction === 'IN' && !NOT_PNL.has(e.category));
    if (otherIncome.length) income.push({ key: 'OTHER_INCOME', usdCents: otherIncome.reduce((s, e) => s + e.amountUsdCents, 0) });
    const expenses = expenseRows.map((x) => ({ key: x.category, usdCents: Number(x.usd) }));
    for (const e of ledger.filter((x) => x.direction === 'OUT' && !NOT_PNL.has(x.category))) {
      const row = expenses.find((x) => x.key === e.category);
      if (row) row.usdCents += e.amountUsdCents;
      else expenses.push({ key: e.category, usdCents: e.amountUsdCents });
    }
    const driverPay = driverEarnings.reduce((s, e) => s + e.amountCents, 0);
    const totalIncome = income.reduce((s, x) => s + x.usdCents, 0);
    const totalExpenses = expenses.reduce((s, x) => s + x.usdCents, 0);

    // gaari kasta: dakhliga safarada − kharashka safarka/gaariga − mushaharka darawalka safarada
    const vehicles = await this.prisma.vehicle.findMany({ select: { id: true, plate: true } });
    const vTrips = await this.prisma.trip.findMany({
      where: { departureAt: inRange, status: { in: ['DEPARTED', 'ARRIVED', 'CLOSED'] }, ...(branchId && { route: { fromBranchId: branchId } }) },
      select: { id: true, vehicleId: true },
    });
    const vTripIds = vTrips.map((t) => t.id);
    const [tTickets, tParcels, tExpenses] = await Promise.all([
      this.prisma.$queryRaw<{ trip_id: string; usd: bigint }[]>`
        SELECT b."tripId" AS trip_id, COALESCE(SUM(p."amountUsdCents"),0)::bigint AS usd FROM "payments" p JOIN "bookings" b ON b.id = p."bookingId"
        WHERE b."tripId" = ANY(${vTripIds}) GROUP BY 1`,
      this.prisma.parcel.groupBy({ by: ['tripId'], where: { tripId: { in: vTripIds }, status: { not: 'VOIDED' } }, _sum: { feeCents: true } }),
      this.prisma.$queryRaw<{ trip_id: string; usd: bigint }[]>`
        SELECT e."tripId" AS trip_id, COALESCE(SUM(-p."amountUsdCents"),0)::bigint AS usd FROM "expenses" e JOIN "payments" p ON p.id = e."paymentId"
        WHERE e."tripId" = ANY(${vTripIds}) AND e."voidedAt" IS NULL GROUP BY 1`,
    ]);
    const byVehicle = vehicles
      .map((v) => {
        const ids = vTrips.filter((t) => t.vehicleId === v.id).map((t) => t.id);
        const inc = ids.reduce((s, id) => s + Number(tTickets.find((x) => x.trip_id === id)?.usd ?? 0) + (tParcels.find((x) => x.tripId === id)?._sum.feeCents ?? 0), 0);
        const exp =
          ids.reduce((s, id) => s + Number(tExpenses.find((x) => x.trip_id === id)?.usd ?? 0), 0) +
          ledger.filter((e) => e.vehicleId === v.id && e.direction === 'OUT' && !NOT_PNL.has(e.category)).reduce((s, e) => s + e.amountUsdCents, 0);
        const drv = earnings.filter((e) => e.tripId && ids.includes(e.tripId)).reduce((s, e) => s + e.amountCents, 0);
        return { vehicleId: v.id, plate: v.plate, trips: ids.length, incomeUsdCents: inc, expensesUsdCents: exp, driverPayUsdCents: drv, profitUsdCents: inc - exp - drv };
      })
      .filter((v) => v.trips > 0 || v.expensesUsdCents > 0);

    return {
      from,
      to,
      branchId: branchId ?? null,
      income,
      expenses,
      driverPayUsdCents: driverPay,
      totals: { incomeUsdCents: totalIncome, expensesUsdCents: totalExpenses, driverPayUsdCents: driverPay, netProfitUsdCents: totalIncome - totalExpenses - driverPay },
      byVehicle,
    };
  }
}
