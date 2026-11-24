import { Body, Controller, Delete, Get, HttpCode, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser, MANAGERS, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { EmitEvent } from '../events/emit';
import { TripsService } from './trips.service';
import { BulkTripsDto, CreateTripDto, MoveBookingsDto, TripQuery, TripStatusDto, UpdateTripDto } from './trips.dto';

@ApiTags('trips')
@ApiBearerAuth()
@Controller('trips')
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Roles(...STAFF, Role.DRIVER)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: TripQuery) {
    return this.trips.list(user, q);
  }

  @Roles(...STAFF, Role.DRIVER)
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trips.get(user, id);
  }

  @Roles(...MANAGERS)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTripDto) {
    return this.trips.create(user, dto);
  }

  @Roles(...MANAGERS)
  @Post('bulk')
  bulk(@CurrentUser() user: AuthUser, @Body() dto: BulkTripsDto) {
    return this.trips.bulk(user, dto);
  }

  @Roles(...MANAGERS)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTripDto) {
    return this.trips.update(user, id, dto);
  }

  @Roles(...STAFF)
  @EmitEvent('TRIP_STATUS', (t) => ({ branchIds: [t.route?.fromBranchId, t.route?.toBranchId], data: { tripId: t.id, status: t.status } }))
  @Patch(':id/status')
  status(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TripStatusDto) {
    return this.trips.changeStatus(user, id, dto);
  }

  @Roles(...MANAGERS)
  @EmitEvent('SEAT_CHANGED', (r) => ({ branchIds: r.branchIds, data: { tripId: r.fromTripId, targetTripId: r.toTripId } }))
  @Post(':id/move-bookings')
  moveBookings(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MoveBookingsDto) {
    return this.trips.moveBookings(user, id, dto);
  }

  @Roles(...STAFF)
  @Get(':id/seats')
  seats(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trips.seatMap(user, id);
  }

  @Roles(...STAFF)
  @EmitEvent('SEAT_CHANGED', (h) => ({ branchIds: [], data: { tripId: h.tripId, seatNo: h.seatNo, held: true } }))
  @Post(':id/seats/:seatNo/hold')
  hold(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('seatNo') seatNo: string) {
    return this.trips.hold(user, id, seatNo);
  }

  @Roles(...STAFF)
  @EmitEvent('SEAT_CHANGED', (_r, req) => ({ branchIds: [], data: { tripId: req.params.id, seatNo: req.params.seatNo, held: false } }))
  @Delete(':id/seats/:seatNo/hold')
  @HttpCode(204)
  release(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('seatNo') seatNo: string) {
    return this.trips.release(user, id, seatNo);
  }

  @Roles(...STAFF, Role.DRIVER)
  @Get(':id/manifest')
  manifest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trips.manifest(user, id);
  }
}

@Module({ controllers: [TripsController], providers: [TripsService], exports: [TripsService] })
export class TripsModule {}
