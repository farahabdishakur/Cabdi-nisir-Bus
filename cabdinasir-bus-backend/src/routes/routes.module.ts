import { Body, Controller, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, PartialType, OmitType } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/decorators';
import { Errors } from '../common/errors';

export class CreateRouteDto {
  @IsUUID() fromBranchId: string;
  @IsUUID() toBranchId: string;
  @IsInt() @Min(0) ticketPriceCents: number;
  @IsOptional() @IsInt() @Min(0) frontSeatSurchargeCents?: number;
  @IsInt() @Min(0) parcelPerKgCents: number;
  @IsOptional() @IsInt() @Min(0) parcelMinFeeCents?: number;
}
export class UpdateRouteDto extends PartialType(OmitType(CreateRouteDto, ['fromBranchId', 'toBranchId'] as const)) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}
class RouteQuery {
  @IsOptional() @IsUUID() fromBranchId?: string;
  @IsOptional() @IsUUID() toBranchId?: string;
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() active?: boolean;
}

@ApiTags('routes')
@ApiBearerAuth()
@Controller('routes')
export class RoutesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query() q: RouteQuery) {
    return this.prisma.route.findMany({
      where: { fromBranchId: q.fromBranchId, toBranchId: q.toBranchId, isActive: q.active },
      include: { fromBranch: true, toBranch: true },
    });
  }

  @Roles(Role.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateRouteDto) {
    if (dto.fromBranchId === dto.toBranchId) throw Errors.bad('SAME_BRANCH', 'Route must connect two different branches');
    return this.prisma.route.create({ data: dto });
  }

  /** Qiimaha marka la beddelo, tigidh/alaab hore isma beddelaan (snapshot ayay haystaan). */
  @Roles(Role.SUPER_ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRouteDto) {
    return this.prisma.route.update({ where: { id }, data: dto });
  }
}

@Module({ controllers: [RoutesController] })
export class RoutesModule {}
