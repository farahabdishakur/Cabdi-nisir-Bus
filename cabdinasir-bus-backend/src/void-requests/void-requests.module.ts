import { Body, Controller, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequestStatus, VoidEntity } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, MANAGERS, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { assertBranch, branchFilter } from '../common/branch-scope';
import { Errors } from '../common/errors';
import { isUniqueViolation } from '../common/idempotency';
import { BookingsModule } from '../bookings/bookings.module';
import { BookingsService } from '../bookings/bookings.service';
import { ParcelsModule } from '../parcels/parcels.module';
import { ParcelsService } from '../parcels/parcels.service';
import { EmitEvent } from '../events/emit';

export class CreateVoidRequestDto {
  @IsEnum(VoidEntity) entity: VoidEntity;
  @IsUUID() entityId: string;
  @IsString() @Length(3, 300) reason: string;
  @IsOptional() @IsBoolean() refund?: boolean;
}
class DecisionDto {
  @IsOptional() @IsString() @Length(0, 300) note?: string;
}
class VoidRequestQuery {
  @IsOptional() @IsEnum(RequestStatus) status?: RequestStatus;
  @IsOptional() @IsUUID() branchId?: string;
}

/** Karraanigu void ma sameeyo — wuu codsadaa; Manager-ka laanta ayaa ansixiya ama diida. */
@Injectable()
export class VoidRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly parcels: ParcelsService,
  ) {}

  async create(user: AuthUser, dto: CreateVoidRequestDto) {
    const branchId = await this.ownerBranch(dto.entity, dto.entityId);
    assertBranch(user, branchId);
    try {
      return await this.prisma.voidRequest.create({
        data: { entity: dto.entity, entityId: dto.entityId, branchId, reason: dto.reason, refund: dto.refund ?? true, requestedById: user.id },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw Errors.conflict('REQUEST_PENDING', 'A void request is already pending for this item');
      throw e;
    }
  }

  list(user: AuthUser, q: VoidRequestQuery) {
    return this.prisma.voidRequest.findMany({
      where: { status: q.status, branchId: branchFilter(user, q.branchId), ...(user.role === 'CASHIER' && { requestedById: user.id }) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async approve(user: AuthUser, id: string, note?: string) {
    const r = await this.pending(user, id);
    if (r.requestedById === user.id) throw Errors.forbidden('You cannot approve your own request');
    // Qabso codsiga si atomic ah (laba ansixin isku mar → hal kaliya)
    const claimed = await this.prisma.voidRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'APPROVED', decidedById: user.id, decidedAt: new Date(), decisionNote: note },
    });
    if (claimed.count !== 1) throw Errors.conflict('REQUEST_DECIDED', 'Request already decided');
    const voidDto = { reason: `${r.reason} (codsi ${r.requestedById.slice(0, 8)})`, refund: r.refund };
    try {
      const result = r.entity === 'BOOKING' ? await this.bookings.void(user, r.entityId, voidDto) : await this.parcels.void(user, r.entityId, voidDto);
      return { request: { ...r, status: 'APPROVED' }, result };
    } catch (e) {
      // void-ku wuu fashilmay (tusaale safarku wuu baxay) → codsigu wuxuu ku noqonayaa sugid
      await this.prisma.voidRequest.update({ where: { id }, data: { status: 'PENDING', decidedById: null, decidedAt: null, decisionNote: null } });
      throw e;
    }
  }

  async reject(user: AuthUser, id: string, note?: string) {
    await this.pending(user, id);
    const res = await this.prisma.voidRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REJECTED', decidedById: user.id, decidedAt: new Date(), decisionNote: note },
    });
    if (res.count !== 1) throw Errors.conflict('REQUEST_DECIDED', 'Request already decided');
    return this.prisma.voidRequest.findUniqueOrThrow({ where: { id } });
  }

  private async pending(user: AuthUser, id: string) {
    const r = await this.prisma.voidRequest.findUnique({ where: { id } });
    if (!r) throw Errors.notFound('VoidRequest', id);
    assertBranch(user, r.branchId);
    if (r.status !== 'PENDING') throw Errors.conflict('REQUEST_DECIDED', 'Request already decided');
    return r;
  }

  private async ownerBranch(entity: VoidEntity, id: string) {
    if (entity === 'BOOKING') {
      const b = await this.prisma.booking.findUnique({ where: { id } });
      if (!b) throw Errors.notFound('Booking', id);
      return b.branchId;
    }
    const p = await this.prisma.parcel.findUnique({ where: { id } });
    if (!p) throw Errors.notFound('Parcel', id);
    return p.fromBranchId;
  }
}

@ApiTags('void-requests')
@ApiBearerAuth()
@Roles(...STAFF)
@Controller('void-requests')
export class VoidRequestsController {
  constructor(private readonly svc: VoidRequestsService) {}

  @EmitEvent('VOID_REQUEST', (r) => ({ branchIds: [r.branchId], data: { requestId: r.id, entity: r.entity, entityId: r.entityId } }))
  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateVoidRequestDto) {
    return this.svc.create(u, dto);
  }

  @Get()
  list(@CurrentUser() u: AuthUser, @Query() q: VoidRequestQuery) {
    return this.svc.list(u, q);
  }

  @Roles(...MANAGERS)
  @Post(':id/approve')
  approve(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.svc.approve(u, id, dto.note);
  }

  @Roles(...MANAGERS)
  @Post(':id/reject')
  reject(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.svc.reject(u, id, dto.note);
  }
}

@Module({ imports: [BookingsModule, ParcelsModule], controllers: [VoidRequestsController], providers: [VoidRequestsService] })
export class VoidRequestsModule {}
