import { Body, Controller, Get, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, PartialType } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsBoolean, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, MANAGERS, Roles, STAFF } from '../common/decorators';
import { AuthUser, isSuperAdmin } from '../common/auth-user';
import { Errors } from '../common/errors';
import { blockData, removeFromQueue } from '../common/block';

export class CreateDriverDto {
  @IsString() @Length(2, 80) name: string;
  @IsString() @Length(6, 20) phone: string;
  @IsOptional() @IsString() @Length(0, 40) licenseNo?: string;
  /** User account (role DRIVER, isla laanta) si uu manifest-kiisa u arko — ikhtiyaari */
  @IsOptional() @IsUUID() userId?: string;
  /** Super Admin kaliya; manager-ka → laantiisa */
  @IsOptional() @IsUUID() branchId?: string;
}
export class UpdateDriverDto extends PartialType(CreateDriverDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
  /** Sababta xannibaadda (waajib marka isActive=false) */
  @IsOptional() @IsString() @Length(3, 200) blockReason?: string;
}

/**
 * Darawallada: Manager-ku wuxuu maamulaa darawallada laantiisa oo keliya.
 * userId waa inuu ahaadaa akoon DRIVER ah oo isla laanta — si aan manifest-ka laan kale loo xadin.
 */
@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.driver.findMany({ orderBy: { name: 'asc' } });
  }

  async create(user: AuthUser, dto: CreateDriverDto) {
    const branchId = isSuperAdmin(user) ? (dto.branchId ?? null) : user.branchId;
    if (!isSuperAdmin(user) && dto.branchId && dto.branchId !== user.branchId) throw Errors.forbiddenBranch();
    if (dto.userId) await this.checkUser(dto.userId, branchId);
    return this.prisma.driver.create({ data: { name: dto.name, phone: dto.phone, licenseNo: dto.licenseNo, userId: dto.userId, branchId } });
  }

  async update(user: AuthUser, id: string, dto: UpdateDriverDto) {
    const d = await this.prisma.driver.findUnique({ where: { id } });
    if (!d) throw Errors.notFound('Driver', id);
    if (!isSuperAdmin(user)) {
      if (d.branchId !== user.branchId) throw Errors.forbiddenBranch();
      if (dto.branchId && dto.branchId !== user.branchId) throw Errors.forbiddenBranch();
    }
    const branchId = isSuperAdmin(user) && dto.branchId !== undefined ? dto.branchId : d.branchId;
    if (dto.userId) await this.checkUser(dto.userId, branchId);
    const block = blockData(dto);
    if (block.isActive === false && (await this.prisma.trip.count({ where: { driverId: id, status: { in: ['SCHEDULED', 'BOARDING'] } } }))) {
      throw Errors.conflict('DRIVER_HAS_TRIPS', 'Driver has upcoming trips — assign another driver first');
    }
    return this.prisma.$transaction(async (tx) => {
      if (block.isActive === false) await removeFromQueue(tx, { driverId: id }, block.blockReason!);
      return tx.driver.update({
        where: { id },
        data: { name: dto.name, phone: dto.phone, licenseNo: dto.licenseNo, userId: dto.userId, ...block, branchId },
      });
    });
  }

  private async checkUser(userId: string, branchId: string | null) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || u.role !== Role.DRIVER) throw Errors.bad('NOT_A_DRIVER_ACCOUNT', 'userId must be a DRIVER account');
    if (branchId && u.branchId !== branchId) throw Errors.forbiddenBranch();
  }
}

@ApiTags('drivers')
@ApiBearerAuth()
@Controller('drivers')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Roles(...STAFF)
  @Get()
  list() {
    return this.drivers.list();
  }

  @Roles(...MANAGERS)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDriverDto) {
    return this.drivers.create(user, dto);
  }

  @Roles(...MANAGERS)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDriverDto) {
    return this.drivers.update(user, id, dto);
  }
}

@Module({ controllers: [DriversController], providers: [DriversService] })
export class DriversModule {}
