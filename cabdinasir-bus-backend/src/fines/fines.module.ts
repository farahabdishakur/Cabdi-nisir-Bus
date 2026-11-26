import { Body, Controller, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { Errors } from '../common/errors';
import { AuditService } from '../audit/audit.service';

export class CreateFineDto {
  @IsUUID() vehicleId: string;
  /** USD senti */
  @Type(() => Number) @IsInt() @Min(1) @Max(10_000_00) amountCents: number;
  @IsString() @Length(3, 200) reason: string;
  /** Haddii la doorto: darawalkan mushaharkiisa ayaa laga jarayaa (DEDUCTION) */
  @IsOptional() @IsUUID() chargeDriverId?: string;
}
class VoidDto {
  @IsString() @Length(3, 200) reason: string;
}
class FineQuery {
  @IsOptional() @IsUUID() vehicleId?: string;
  @IsOptional() @IsUUID() driverId?: string;
}

/**
 * Ganaaxyada baska (BUSINESS_RULES §33) — Super Admin:
 * - diiwaan: bas + lacag + sabab; ikhtiyaari darawalka mushaharkiisa laga jaro (DriverPayment DEDUCTION, lacag sanduuq kama baxdo)
 * - ka laabasho: void + sabab → ka jaridda darawalkana waa la void-gareeyaa (haraagiisa dib ayuu u helaa)
 */
@Injectable()
export class FinesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  list(q: FineQuery) {
    return this.prisma.vehicleFine.findMany({
      where: { vehicleId: q.vehicleId, driverId: q.driverId },
      include: { vehicle: { select: { plate: true, fleetNo: true } }, driver: { select: { name: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async create(user: AuthUser, dto: CreateFineDto) {
    return this.prisma.$transaction(async (tx) => {
      const v = await tx.vehicle.findUnique({ where: { id: dto.vehicleId } });
      if (!v) throw Errors.notFound('Vehicle', dto.vehicleId);
      let driverPaymentId: string | undefined;
      if (dto.chargeDriverId) {
        const d = await tx.driver.findUnique({ where: { id: dto.chargeDriverId } });
        if (!d) throw Errors.notFound('Driver', dto.chargeDriverId);
        const label = v.fleetNo ? `${v.fleetNo} (${v.plate})` : v.plate;
        const dp = await tx.driverPayment.create({
          data: { driverId: d.id, kind: 'DEDUCTION', amountCents: dto.amountCents, note: `Ganaax baska ${label}: ${dto.reason}`.slice(0, 200), createdById: user.id },
        });
        driverPaymentId = dp.id;
      }
      const fine = await tx.vehicleFine.create({
        data: { vehicleId: v.id, driverId: dto.chargeDriverId, driverPaymentId, amountCents: dto.amountCents, reason: dto.reason.trim(), createdById: user.id },
        include: { vehicle: { select: { plate: true, fleetNo: true } }, driver: { select: { name: true, phone: true } } },
      });
      await this.audit.log(tx, user, 'VEHICLE_FINE', 'vehicle_fines', fine.id, null, fine);
      return fine;
    });
  }

  async void(user: AuthUser, id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.vehicleFine.updateMany({ where: { id, voidedAt: null }, data: { voidedAt: new Date(), voidedById: user.id, voidReason: reason } });
      if (res.count !== 1) {
        if (!(await tx.vehicleFine.findUnique({ where: { id } }))) throw Errors.notFound('VehicleFine', id);
        throw Errors.conflict('ALREADY_VOIDED', 'Already voided');
      }
      const f = await tx.vehicleFine.findUniqueOrThrow({ where: { id } });
      if (f.driverPaymentId) {
        await tx.driverPayment.updateMany({ where: { id: f.driverPaymentId, voidedAt: null }, data: { voidedAt: new Date(), voidedById: user.id, voidReason: `Ganaax laga laabtay: ${reason}`.slice(0, 200) } });
      }
      await this.audit.log(tx, user, 'VEHICLE_FINE_VOID', 'vehicle_fines', id, null, { reason });
      return f;
    });
  }
}

@ApiTags('vehicle-fines')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN)
@Controller('vehicle-fines')
export class FinesController {
  constructor(private readonly fines: FinesService) {}

  @Get()
  list(@Query() q: FineQuery) {
    return this.fines.list(q);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateFineDto) {
    return this.fines.create(u, dto);
  }

  @Post(':id/void')
  void(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: VoidDto) {
    return this.fines.void(u, id, dto.reason);
  }
}

@Module({ controllers: [FinesController], providers: [FinesService] })
export class FinesModule {}
