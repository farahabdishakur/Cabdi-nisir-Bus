import { Body, Controller, Get, Module, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { ApiBearerAuth, ApiConsumes, ApiHeader, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { CurrentUser, MANAGERS, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { IdempotencyKey } from '../common/idempotency';
import { TripsModule } from '../trips/trips.module';
import { EmitEvent, parcelEvent } from '../events/emit';
import { ParcelsService } from './parcels.service';
import {
  ArriveBatchDto, CorrectParcelDto, CreateParcelDto, DeliverParcelDto, LoadParcelDto, NoteDto, ParcelQuery, QuoteParcelDto, VoidParcelDto,
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
  @EmitEvent('PARCEL_CHANGED', parcelEvent)
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

  @EmitEvent('PARCEL_CHANGED', (r, req) => ({ branchIds: [], data: { tripId: req.body.tripId, arrived: r.arrived?.length ?? 0, missing: r.missing?.length ?? 0 } }))
  @Post('arrive-batch')
  arriveBatch(@CurrentUser() user: AuthUser, @Body() dto: ArriveBatchDto) {
    return this.parcels.arriveBatch(user, dto);
  }

  /** tracking code (CB-BOR-000482), lambar rasiid, ama id */
  @Get(':code')
  get(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.parcels.get(user, code);
  }

  @EmitEvent('PARCEL_CHANGED', parcelEvent)
  @Post(':id/load')
  load(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LoadParcelDto) {
    return this.parcels.load(user, id, dto.tripId);
  }

  @EmitEvent('PARCEL_CHANGED', parcelEvent)
  @Post(':id/unload')
  unload(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.parcels.unload(user, id);
  }

  @EmitEvent('PARCEL_CHANGED', parcelEvent)
  @Post(':id/arrive')
  arrive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.parcels.arrive(user, id);
  }

  @EmitEvent('PARCEL_CHANGED', parcelEvent)
  @Post(':id/deliver')
  deliver(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DeliverParcelDto) {
    return this.parcels.deliver(user, id, dto);
  }

  @EmitEvent('PARCEL_CHANGED', parcelEvent)
  @Patch(':id')
  correct(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CorrectParcelDto) {
    return this.parcels.correct(user, id, dto);
  }

  @Post(':id/reset-pin')
  resetPin(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.parcels.resetPin(user, id, dto.note);
  }

  @Post(':id/reprint')
  reprint(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.parcels.reprint(user, id);
  }

  @ApiConsumes('multipart/form-data')
  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  photo(@CurrentUser() user: AuthUser, @Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.parcels.savePhoto(user, id, file);
  }

  @Get(':id/photo')
  async getPhoto(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    res.sendFile(await this.parcels.photoPath(user, id));
  }

  @Roles(...MANAGERS)
  @EmitEvent('PARCEL_CHANGED', parcelEvent)
  @Post(':id/void')
  void(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VoidParcelDto) {
    return this.parcels.void(user, id, dto);
  }

  @Roles(...MANAGERS)
  @EmitEvent('PARCEL_CHANGED', parcelEvent)
  @Post(':id/mark-missing')
  missing(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.parcels.mark(user, id, 'MISSING', dto.note);
  }

  @Roles(...MANAGERS)
  @EmitEvent('PARCEL_CHANGED', parcelEvent)
  @Post(':id/mark-damaged')
  damaged(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.parcels.mark(user, id, 'DAMAGED', dto.note);
  }
}

@Module({ imports: [TripsModule], controllers: [ParcelsController], providers: [ParcelsService], exports: [ParcelsService] })
export class ParcelsModule {}
