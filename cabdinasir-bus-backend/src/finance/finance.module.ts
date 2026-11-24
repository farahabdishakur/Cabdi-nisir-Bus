import { Body, Controller, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Currency, DepositTarget, ExpenseCategory, PaymentMethod, Prisma, Role } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, MANAGERS, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { branchFilter, assertBranch } from '../common/branch-scope';
import { Errors } from '../common/errors';
import { businessRange, businessDate } from '../common/time';
import { CashService } from '../cash/cash.service';
import { IdempotencyKey, isUniqueViolation } from '../common/idempotency';
import { ApiHeader } from '@nestjs/swagger';
import { AuditService } from '../audit/audit.service';

class MoneyOutDto {
  /** Qadarka lacagta la qabtay: USD → senti, SLSH → shilin */
  @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000_000) amount: number;
  @IsEnum(Currency) currency: Currency;
  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
  @ValidateIf((o) => o.method && o.method !== PaymentMethod.CASH) @IsString() @Length(3, 64) reference?: string;
}

export class CreateExpenseDto extends MoneyOutDto {
  @IsEnum(ExpenseCategory) category: ExpenseCategory;
  @IsString() @Length(3, 300) description: string;
  @IsOptional() @IsUUID() tripId?: string;
}

export class CreateDepositDto extends MoneyOutDto {
  @IsEnum(DepositTarget) target: DepositTarget;
  @IsOptional() @IsString() @Length(0, 300) note?: string;
}

class VoidDto {
  @IsString() @Length(3, 300) reason: string;
}

class RangeQuery {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() unconfirmed?: boolean;
}

const paymentSelect = { select: { id: true, amount: true, currency: true, method: true, amountUsdCents: true, cashierId: true, cashSessionId: true, reference: true } };

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService, private readonly cash: CashService, private readonly audit: AuditService) {}

  /** Kharash: wuxuu ka baxaa sanduuqa karraaniga (Payment taban). */
  async createExpense(user: AuthUser, dto: CreateExpenseDto, idempotencyKey?: string) {
    return this.once('expense', idempotencyKey, () => this.prisma.$transaction(async (tx) => {
      const branchId = this.ownBranch(user);
      await this.assertEnoughCash(tx, user, dto);
      const payment = await this.cash.recordRaw(tx, user, branchId, 'EXPENSE', -dto.amount, this.pay(dto));
      return tx.expense.create({
        data: { branchId, category: dto.category, description: dto.description, tripId: dto.tripId, paymentId: payment.id, createdById: user.id, idempotencyKey },
        include: { payment: paymentSelect },
      });
    }), user.id);
  }

  /** Void kharash: Manager; kaliya inta sanduuqii uu ku jiray furan yahay — lacagta dib ayay ugu noqotaa. */
  async voidExpense(user: AuthUser, id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.expense.findUnique({ where: { id }, include: { payment: { include: { cashSession: true } } } });
      if (!e) throw Errors.notFound('Expense', id);
      assertBranch(user, e.branchId);
      if (e.voidedAt) throw Errors.conflict('ALREADY_VOIDED', 'Expense already voided');
      // Xir sanduuqa (lacag/xiritaan isku mar) kadib calaamadee void si atomic ah → laba void ≠ laba celin
      await tx.$queryRaw`SELECT id FROM "cash_sessions" WHERE id = ${e.payment.cashSessionId} FOR UPDATE`;
      const session = await tx.cashSession.findUniqueOrThrow({ where: { id: e.payment.cashSessionId } });
      if (session.closedAt) throw Errors.conflict('SESSION_CLOSED', 'Cash session already closed; record a correction instead');
      const claimed = await tx.expense.updateMany({ where: { id, voidedAt: null }, data: { voidedAt: new Date(), voidedById: user.id, voidReason: reason } });
      if (claimed.count !== 1) throw Errors.conflict('ALREADY_VOIDED', 'Expense already voided');
      await tx.payment.create({
        data: {
          kind: 'EXPENSE', method: e.payment.method, currency: e.payment.currency, amount: -e.payment.amount,
          amountUsdCents: -e.payment.amountUsdCents, exchangeRate: e.payment.exchangeRate, reference: e.payment.reference,
          cashierId: e.payment.cashierId, cashSessionId: e.payment.cashSessionId, branchId: e.branchId,
        },
      });
      const updated = await tx.expense.findUniqueOrThrow({ where: { id } });
      await this.audit.log(tx, user, 'VOID', 'expenses', id, { amount: e.payment.amount }, { reason });
      return updated;
    });
  }

  listExpenses(user: AuthUser, q: RangeQuery) {
    const r = businessRange(q.from ?? businessDate(), q.to ?? q.from ?? businessDate());
    return this.prisma.expense.findMany({
      where: { branchId: branchFilter(user, q.branchId), createdAt: { gte: r.start, lt: r.end } },
      include: { payment: paymentSelect },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Deposit: lacag laga wareejiyay sanduuqa → xafiiska guud / bangi. */
  async createDeposit(user: AuthUser, dto: CreateDepositDto, idempotencyKey?: string) {
    return this.once('deposit', idempotencyKey, () => this.prisma.$transaction(async (tx) => {
      const branchId = this.ownBranch(user);
      await this.assertEnoughCash(tx, user, dto);
      const payment = await this.cash.recordRaw(tx, user, branchId, 'DEPOSIT', -dto.amount, this.pay(dto));
      return tx.deposit.create({
        data: { branchId, target: dto.target, reference: dto.reference, note: dto.note, paymentId: payment.id, createdById: user.id, idempotencyKey },
        include: { payment: paymentSelect },
      });
    }), user.id);
  }

  /** Idempotency-Key: badhanka laba jeer la riixo → kharash/deposit laba jeer ma noqoto. */
  private async once<T extends { createdById: string }>(kind: 'expense' | 'deposit', key: string | undefined, run: () => Promise<T>, userId?: string): Promise<T> {
    const find = () =>
      kind === 'expense'
        ? this.prisma.expense.findUnique({ where: { idempotencyKey: key }, include: { payment: paymentSelect } })
        : this.prisma.deposit.findUnique({ where: { idempotencyKey: key }, include: { payment: paymentSelect } });
    const own = (prev: unknown) => {
      if (userId && (prev as T).createdById !== userId) throw Errors.conflict('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was used by another user');
      return prev as T;
    };
    if (key) {
      const prev = await find();
      if (prev) return own(prev);
    }
    try {
      return await run();
    } catch (e) {
      if (key && isUniqueViolation(e, 'idempotencyKey')) return own(await find());
      throw e;
    }
  }

  /** Super Admin: "lacagta waan helay" — silsiladda lacagtu way xirantaa. */
  async confirmDeposit(user: AuthUser, id: string) {
    const d = await this.prisma.deposit.findUnique({ where: { id } });
    if (!d) throw Errors.notFound('Deposit', id);
    if (d.confirmedAt) throw Errors.conflict('ALREADY_CONFIRMED', 'Deposit already confirmed');
    return this.prisma.deposit.update({ where: { id }, data: { confirmedById: user.id, confirmedAt: new Date() } });
  }

  listDeposits(user: AuthUser, q: RangeQuery) {
    const where: Prisma.DepositWhereInput = { branchId: branchFilter(user, q.branchId) };
    if (q.unconfirmed) where.confirmedAt = null;
    else {
      const r = businessRange(q.from ?? businessDate(), q.to ?? q.from ?? businessDate());
      where.createdAt = { gte: r.start, lt: r.end };
    }
    return this.prisma.deposit.findMany({ where, include: { payment: paymentSelect, branch: true }, orderBy: { createdAt: 'desc' } });
  }

  private ownBranch(user: AuthUser) {
    if (!user.branchId) throw Errors.bad('BRANCH_REQUIRED', 'Only branch staff have a cash drawer');
    return user.branchId;
  }

  private pay(dto: MoneyOutDto) {
    return { method: dto.method ?? PaymentMethod.CASH, currency: dto.currency, reference: dto.reference };
  }

  /** Sanduuqa kama bixi karto lacag ka badan inta ku jirta (CASH). */
  private async assertEnoughCash(tx: Prisma.TransactionClient, user: AuthUser, dto: MoneyOutDto) {
    if ((dto.method ?? PaymentMethod.CASH) !== PaymentMethod.CASH) return;
    const session = await this.cash.requireOpenSession(tx, user);
    const { expectedCash } = await this.cash.summary(session, tx);
    if (dto.amount > expectedCash[dto.currency]) {
      throw Errors.bad('INSUFFICIENT_CASH', 'Not enough cash in the drawer', { available: expectedCash[dto.currency], currency: dto.currency });
    }
  }
}

@ApiTags('finance')
@ApiBearerAuth()
@Roles(...STAFF)
@Controller()
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @Post('expenses')
  createExpense(@CurrentUser() u: AuthUser, @Body() dto: CreateExpenseDto, @IdempotencyKey() key?: string) {
    return this.finance.createExpense(u, dto, key);
  }

  @Get('expenses')
  listExpenses(@CurrentUser() u: AuthUser, @Query() q: RangeQuery) {
    return this.finance.listExpenses(u, q);
  }

  @Roles(...MANAGERS)
  @Post('expenses/:id/void')
  voidExpense(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: VoidDto) {
    return this.finance.voidExpense(u, id, dto.reason);
  }

  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @Post('deposits')
  createDeposit(@CurrentUser() u: AuthUser, @Body() dto: CreateDepositDto, @IdempotencyKey() key?: string) {
    return this.finance.createDeposit(u, dto, key);
  }

  @Get('deposits')
  listDeposits(@CurrentUser() u: AuthUser, @Query() q: RangeQuery) {
    return this.finance.listDeposits(u, q);
  }

  @Roles(Role.SUPER_ADMIN)
  @Post('deposits/:id/confirm')
  confirmDeposit(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.finance.confirmDeposit(u, id);
  }
}

@Module({ controllers: [FinanceController], providers: [FinanceService] })
export class FinanceModule {}

