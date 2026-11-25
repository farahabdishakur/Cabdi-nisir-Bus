import { Body, Controller, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaymentMethod, Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, MANAGERS, Roles, STAFF } from '../common/decorators';
import { AuthUser, isSuperAdmin } from '../common/auth-user';
import { branchFilter } from '../common/branch-scope';
import { Errors } from '../common/errors';
import { businessDate, businessRange } from '../common/time';
import { AuditService } from '../audit/audit.service';
import { MOBILE_UNIQUE_KINDS } from '../cash/cash.service';

class MobileQuery {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsIn(['ZAAD', 'EDAHAB']) method?: 'ZAAD' | 'EDAHAB';
  /** false = kuwa aan wali la hubin */
  @IsOptional() @Transform(({ value }) => (value === undefined ? undefined : value === 'true')) @IsBoolean() reconciled?: boolean;
}

class LookupQuery {
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsString() @Length(3, 64) reference: string;
}

class ReconcileDto {
  @IsOptional() @IsString() @Length(0, 300) note?: string;
}

class ReconcileBatchDto extends ReconcileDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID('all', { each: true }) ids: string[];
}

const MOBILE: PaymentMethod[] = ['ZAAD', 'EDAHAB'];

/**
 * Lacagaha Zaad / eDahab:
 * - Karraanigu ka hor intuusan aqbalin wuu hubin karaa in transaction-ka hore loo isticmaalay (lookup).
 * - Manager-ku dhammaadka maalinta liiska ayuu la barbar dhigaa bayaanka Zaad/eDahab-ka → "la hubiyay" (reconcile).
 *   Lacag aan bayaanka ku jirin → void tigidhka/alaabta + baadhis.
 */
@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async mobile(user: AuthUser, q: MobileQuery) {
    const r = businessRange(q.from ?? businessDate(), q.to ?? q.from ?? businessDate());
    const where: Prisma.PaymentWhereInput = {
      branchId: branchFilter(user, q.branchId),
      method: q.method ?? { in: MOBILE },
      createdAt: { gte: r.start, lt: r.end },
      ...(q.reconciled === true && { reconciledAt: { not: null } }),
      ...(q.reconciled === false && { reconciledAt: null }),
    };
    const rows = await this.prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 1000,
      include: {
        booking: { select: { receiptNo: true, passengerName: true } },
        parcel: { select: { trackingCode: true, receiverName: true } },
      },
    });
    const cashiers = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((p) => p.cashierId))] } }, select: { id: true, name: true } });
    const name = new Map(cashiers.map((c) => [c.id, c.name]));
    const items = rows.map((p) => ({
      id: p.id,
      createdAt: p.createdAt,
      method: p.method,
      kind: p.kind,
      reference: p.reference,
      payerPhone: p.payerPhone,
      amount: p.amount,
      currency: p.currency,
      amountUsdCents: p.amountUsdCents,
      receipt: p.booking?.receiptNo ?? p.parcel?.trackingCode ?? null,
      customer: p.booking?.passengerName ?? p.parcel?.receiverName ?? null,
      cashier: name.get(p.cashierId) ?? p.cashierId,
      branchId: p.branchId,
      reconciledAt: p.reconciledAt,
      reconcileNote: p.reconcileNote,
    }));
    const total = (m: PaymentMethod) => items.filter((i) => i.method === m).reduce((s, i) => s + i.amountUsdCents, 0);
    return {
      from: q.from ?? businessDate(),
      to: q.to ?? q.from ?? businessDate(),
      totals: {
        ZAAD: total('ZAAD'),
        EDAHAB: total('EDAHAB'),
        count: items.length,
        unreconciled: items.filter((i) => !i.reconciledAt).length,
      },
      items,
    };
  }

  /** Karraanigu: "transaction-kan hore ma loo isticmaalay?" — ka hor inta aan tigidh la bixin. */
  async lookup(q: LookupQuery) {
    const reference = q.reference.replace(/\s/g, '').toUpperCase();
    const used = await this.prisma.payment.findFirst({
      where: { method: q.method, reference, kind: { in: MOBILE_UNIQUE_KINDS }, amount: { gt: 0 } },
      include: { booking: { select: { receiptNo: true } }, parcel: { select: { trackingCode: true } } },
    });
    return {
      method: q.method,
      reference,
      used: !!used,
      ...(used && { usedOn: used.booking?.receiptNo ?? used.parcel?.trackingCode ?? null, usedAt: used.createdAt }),
    };
  }

  async reconcile(user: AuthUser, ids: string[], note?: string) {
    const rows = await this.prisma.payment.findMany({ where: { id: { in: ids } }, select: { id: true, branchId: true, method: true, reconciledAt: true } });
    if (rows.length !== ids.length) throw Errors.notFound('Payment');
    for (const p of rows) {
      if (!isSuperAdmin(user) && p.branchId !== user.branchId) throw Errors.forbiddenBranch();
      if (!MOBILE.includes(p.method)) throw Errors.bad('NOT_MOBILE_PAYMENT', 'Only Zaad/eDahab payments are reconciled');
    }
    const res = await this.prisma.payment.updateMany({
      where: { id: { in: ids }, reconciledAt: null },
      data: { reconciledAt: new Date(), reconciledById: user.id, reconcileNote: note },
    });
    await this.audit.log(this.prisma, user, 'RECONCILE', 'payments', ids.length === 1 ? ids[0] : `batch:${ids.length}`, null, { ids, note, updated: res.count });
    return { reconciled: res.count, alreadyDone: ids.length - res.count };
  }
}

@ApiTags('payments')
@ApiBearerAuth()
@Roles(...MANAGERS)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Liiska lacagaha Zaad/eDahab (barbar dhigga bayaanka) */
  @Get('mobile')
  mobile(@CurrentUser() u: AuthUser, @Query() q: MobileQuery) {
    return this.payments.mobile(u, q);
  }

  @Roles(...STAFF)
  @Get('lookup')
  lookup(@Query() q: LookupQuery) {
    return this.payments.lookup(q);
  }

  @Post(':id/reconcile')
  reconcileOne(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ReconcileDto) {
    return this.payments.reconcile(u, [id], dto.note);
  }

  @Post('reconcile')
  reconcileBatch(@CurrentUser() u: AuthUser, @Body() dto: ReconcileBatchDto) {
    return this.payments.reconcile(u, dto.ids, dto.note);
  }
}

@Module({ controllers: [PaymentsController], providers: [PaymentsService] })
export class PaymentsModule {}
