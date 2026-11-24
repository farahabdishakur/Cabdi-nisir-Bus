import { Body, Controller, Get, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { CurrentUser, MANAGERS, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { IdempotencyKey } from '../common/idempotency';
import { TripsModule } from '../trips/trips.module';
import { BookingsService } from './bookings.service';
import { BookingQuery, CreateBookingDto, TransferBookingDto, VoidBookingDto } from './bookings.dto';

@ApiTags('bookings')
@ApiBearerAuth()
@Roles(...STAFF)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto, @IdempotencyKey() key?: string) {
    return this.bookings.create(user, dto, key);
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
  @Post(':id/void')
  void(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VoidBookingDto) {
    return this.bookings.void(user, id, dto);
  }

  @Post(':id/transfer')
  transfer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TransferBookingDto) {
    return this.bookings.transfer(user, id, dto);
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
