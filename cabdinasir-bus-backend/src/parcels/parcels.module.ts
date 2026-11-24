import { Body, Controller, Get, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { CurrentUser, MANAGERS, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { IdempotencyKey } from '../common/idempotency';
import { TripsModule } from '../trips/trips.module';
import { ParcelsService } from './parcels.service';
import {
  ArriveBatchDto, CreateParcelDto, DeliverParcelDto, LoadParcelDto, NoteDto, ParcelQuery, QuoteParcelDto, VoidParcelDto,
} from './parcels.dto';

class BranchQuery {
  @IsOptional() @IsUUID() branchId?: string;
}

@ApiTags('parcels')
@ApiBearerAuth()
@Roles(...STAFF)
@Controller('parcels')
export class ParcelsController {
  constructor(private readonly parcels: ParcelsService) {}

  @Post('quote')
  quote(@CurrentUser() user: AuthUser, @Body() dto: QuoteParcelDto) {
    return this.parcels.quote(user, dto);
  }

  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateParcelDto, @IdempotencyKey() key?: string) {
    return this.parcels.create(user, dto, key);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ParcelQuery) {
    return this.parcels.list(user, q);
  }

  @Get('incoming')
  incoming(@CurrentUser() user: AuthUser, @Query() q: BranchQuery) {
    return this.parcels.incoming(user, q.branchId);
  }

  @Get('outgoing')
  outgoing(@CurrentUser() user: AuthUser, @Query() q: BranchQuery) {
    return this.parcels.outgoing(user, q.branchId);
  }

  @Post('arrive-batch')
  arriveBatch(@CurrentUser() user: AuthUser, @Body() dto: ArriveBatchDto) {
    return this.parcels.arriveBatch(user, dto);
  }

  /** tracking code (CB-BOR-000482), lambar rasiid, ama id */
  @Get(':code')
  get(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.parcels.get(user, code);
  }

  @Post(':id/load')
  load(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LoadParcelDto) {
    return this.parcels.load(user, id, dto.tripId);
  }

  @Post(':id/unload')
  unload(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.parcels.unload(user, id);
  }

  @Post(':id/arrive')
  arrive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.parcels.arrive(user, id);
  }

  @Post(':id/deliver')
  deliver(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DeliverParcelDto) {
    return this.parcels.deliver(user, id, dto);
  }

  @Roles(...MANAGERS)
  @Post(':id/void')
  void(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VoidParcelDto) {
    return this.parcels.void(user, id, dto);
  }

  @Roles(...MANAGERS)
  @Post(':id/mark-missing')
  missing(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.parcels.mark(user, id, 'MISSING', dto.note);
  }

  @Roles(...MANAGERS)
  @Post(':id/mark-damaged')
  damaged(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.parcels.mark(user, id, 'DAMAGED', dto.note);
  }
}

@Module({ imports: [TripsModule], controllers: [ParcelsController], providers: [ParcelsService] })
export class ParcelsModule {}
