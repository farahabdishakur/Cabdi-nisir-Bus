import { Body, Controller, Get, Module, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, TripStatus } from '@prisma/client';
import { Errors } from '../common/errors';
import { IsBoolean, IsObject, IsOptional, IsString, Length } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Roles, STAFF } from '../common/decorators';
import { parseSeatLayout } from './seat-layout';

export class CreateVehicleDto {
  @IsString() @Length(2, 20) plate: string;
  @IsString() @Length(2, 60) model: string;
  @IsObject() seatLayout: object;
}
export class UpdateVehicleDto {
  @IsOptional() @IsString() @Length(2, 60) model?: string;
  @IsOptional() @IsObject() seatLayout?: object;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('vehicles')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles(...STAFF)
  @Get()
  list() {
    return this.prisma.vehicle.findMany({ orderBy: { plate: 'asc' } });
  }

  @Roles(Role.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateVehicleDto) {
    const { layout, seats } = parseSeatLayout(dto.seatLayout);
    return this.prisma.vehicle.create({
      data: { plate: dto.plate.toUpperCase(), model: dto.model, seatLayout: layout as object, capacity: seats.length },
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
    return this.prisma.vehicle.update({
      where: { id },
      data: {
        model: dto.model,
        isActive: dto.isActive,
        ...(parsed && { seatLayout: parsed.layout as object, capacity: parsed.seats.length }),
      },
    });
  }
}

@Module({ controllers: [VehiclesController] })
export class VehiclesModule {}
