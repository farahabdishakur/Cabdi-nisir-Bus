import { Body, Controller, Get, Module, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, TripStatus } from '@prisma/client';
import { Errors } from '../common/errors';
import { IsBoolean, IsObject, IsOptional, IsString, IsUUID, Length, ValidateIf } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Roles, STAFF } from '../common/decorators';
import { parseSeatLayout } from './seat-layout';
import { blockData, removeFromQueue } from '../common/block';

export class CreateVehicleDto {
  @IsString() @Length(2, 20) plate: string;
  /** Lambarka baska ee shirkadda ("02", "13", "3G") */
  @IsOptional() @IsString() @Length(1, 8) fleetNo?: string;
  @IsString() @Length(2, 60) model: string;
  @IsObject() seatLayout: object;
  @IsOptional() @IsUUID() defaultDriverId?: string;
}
export class UpdateVehicleDto {
  @ValidateIf((o) => o.fleetNo !== null && o.fleetNo !== undefined) @IsString() @Length(1, 8) fleetNo?: string | null;
  @ValidateIf((o) => o.defaultDriverId !== null && o.defaultDriverId !== undefined) @IsUUID() defaultDriverId?: string | null;
  @IsOptional() @IsString() @Length(2, 60) model?: string;
  @IsOptional() @IsObject() seatLayout?: object;
  @IsOptional() @IsBoolean() isActive?: boolean;
  /** Sababta xannibaadda (waajib marka isActive=false) */
  @IsOptional() @IsString() @Length(3, 200) blockReason?: string;
}

/** "02" → "02", " 3g " → "3G", "" → null */
const normFleet = (v?: string | null) => (v?.trim() ? v.trim().toUpperCase() : null);

@ApiTags('vehicles')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles(...STAFF)
  @Get()
  list() {
    return this.prisma.vehicle.findMany({ orderBy: { plate: 'asc' }, include: { defaultDriver: { select: { id: true, name: true, phone: true } } } });
  }

  @Roles(Role.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateVehicleDto) {
    const { layout, seats } = parseSeatLayout(dto.seatLayout);
    return this.prisma.vehicle.create({
      data: { plate: dto.plate.toUpperCase(), fleetNo: normFleet(dto.fleetNo), model: dto.model, seatLayout: layout as object, capacity: seats.length, defaultDriverId: dto.defaultDriverId },
    });
  }

  @Roles(Role.SUPER_ADMIN)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    const parsed = dto.seatLayout ? parseSeatLayout(dto.seatLayout) : undefined;
    const upcoming = { vehicleId: id, status: { in: ['SCHEDULED', 'BOARDING'] as TripStatus[] } };
    if (parsed) {
      // Kursi rakaab haysta lama tirtiri karo (safarada soo socda) — haddii kale rakaabku kursi la'aan ayuu noqonayaa
      const taken = await this.prisma.booking.findMany({
        where: { trip: upcoming, status: { in: ['RESERVED', 'CONFIRMED', 'BOARDED'] }, seatNo: { notIn: parsed.seats } },
        select: { seatNo: true },
      });
      if (taken.length) throw Errors.conflict('SEATS_IN_USE', 'Seats with bookings on upcoming trips cannot be removed', { seats: [...new Set(taken.map((b) => b.seatNo))] });
    }
    if (dto.isActive === false && (await this.prisma.trip.count({ where: upcoming }))) {
      throw Errors.conflict('VEHICLE_HAS_TRIPS', 'Vehicle has upcoming trips — move them to another vehicle first');
    }
    const block = blockData(dto);
    return this.prisma.$transaction(async (tx) => {
      if (block.isActive === false) await removeFromQueue(tx, { vehicleId: id }, block.blockReason!);
      return tx.vehicle.update({
        where: { id },
        data: {
          model: dto.model,
          fleetNo: dto.fleetNo === undefined ? undefined : normFleet(dto.fleetNo),
          ...block,
          defaultDriverId: dto.defaultDriverId,
          ...(parsed && { seatLayout: parsed.layout as object, capacity: parsed.seats.length }),
        },
      });
    });
  }
}

@Module({ controllers: [VehiclesController] })
export class VehiclesModule {}
