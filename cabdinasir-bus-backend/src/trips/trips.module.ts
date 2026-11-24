import { Body, Controller, Delete, Get, HttpCode, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser, MANAGERS, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { TripsService } from './trips.service';
import { BulkTripsDto, CreateTripDto, TripQuery, TripStatusDto, UpdateTripDto } from './trips.dto';

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
  @Patch(':id/status')
  status(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TripStatusDto) {
    return this.trips.changeStatus(user, id, dto);
  }

  @Roles(...STAFF)
  @Get(':id/seats')
  seats(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trips.seatMap(user, id);
  }

  @Roles(...STAFF)
  @Post(':id/seats/:seatNo/hold')
  hold(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('seatNo') seatNo: string) {
    return this.trips.hold(user, id, seatNo);
  }

  @Roles(...STAFF)
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
