import { Body, Controller, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { CurrentUser, MANAGERS, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { IdempotencyKey } from '../common/idempotency';
import { TripsModule } from '../trips/trips.module';
import { EmitEvent } from '../events/emit';
import { BookingsService } from './bookings.service';
import {
  BookingQuery, CancelReservationDto, ConfirmReservationDto, CorrectBookingDto, CreateBookingDto, ReserveBookingDto, TransferBookingDto, VoidBookingDto,
} from './bookings.dto';

@ApiTags('bookings')
@ApiBearerAuth()
@Roles(...STAFF)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @EmitEvent('SEAT_CHANGED', (b) => ({ branchIds: [b.trip?.route?.fromBranchId, b.trip?.route?.toBranchId], data: { tripId: b.tripId, seatNo: b.seatNo } }))
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto, @IdempotencyKey() key?: string) {
    return this.bookings.create(user, dto, key);
  }

  /** Ballan taleefan (lacag la'aan, wakhti leh) */
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @EmitEvent('SEAT_CHANGED', (b) => ({ branchIds: [b.trip?.route?.fromBranchId, b.branchId], data: { tripId: b.tripId, seatNo: b.seatNo, reserved: true } }))
  @Post('reserve')
  reserve(@CurrentUser() user: AuthUser, @Body() dto: ReserveBookingDto, @IdempotencyKey() key?: string) {
    return this.bookings.reserve(user, dto, key);
  }

  @EmitEvent('SEAT_CHANGED', (b) => ({ branchIds: [b.trip?.route?.fromBranchId, b.branchId], data: { tripId: b.tripId, seatNo: b.seatNo } }))
  @Post(':id/confirm')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ConfirmReservationDto) {
    return this.bookings.confirm(user, id, dto);
  }

  @EmitEvent('SEAT_CHANGED', (b) => ({ branchIds: [b.trip?.route?.fromBranchId, b.branchId], data: { tripId: b.tripId, seatNo: b.seatNo } }))
  @Post(':id/cancel-reservation')
  cancelReservation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CancelReservationDto) {
    return this.bookings.cancelReservation(user, id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: BookingQuery) {
    return this.bookings.list(user, q);
  }

  /** id ama lambarka rasiidka (BOR-T-000123) */
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.get(user, id);
  }

  @Roles(...MANAGERS)
  @EmitEvent('SEAT_CHANGED', (b) => ({ branchIds: [b.branchId], data: { tripId: b.tripId, seatNo: b.seatNo } }))
  @Post(':id/void')
  void(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VoidBookingDto) {
    return this.bookings.void(user, id, dto);
  }

  @EmitEvent('SEAT_CHANGED', (b) => ({ branchIds: [b.branchId], data: { tripId: b.tripId, previousTripId: b.transferredFromTripId } }))
  @Post(':id/transfer')
  transfer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TransferBookingDto) {
    return this.bookings.transfer(user, id, dto);
  }

  @Patch(':id')
  correct(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CorrectBookingDto) {
    return this.bookings.correct(user, id, dto);
  }

  @Post(':id/reprint')
  reprint(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.reprint(user, id);
  }

  @Post(':id/board')
  board(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.board(user, id);
  }
}

@Module({ imports: [TripsModule], controllers: [BookingsController], providers: [BookingsService], exports: [BookingsService] })
export class BookingsModule {}
