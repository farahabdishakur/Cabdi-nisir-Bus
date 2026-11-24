import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsOptional, Matches, ValidateNested } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Roles, STAFF } from '../common/decorators';
import { AuthUser, isSuperAdmin } from '../common/auth-user';
import { businessDate, businessDayRange } from '../common/time';
import { SettingsService } from '../settings/settings.service';
import { ParcelsModule } from '../parcels/parcels.module';
import { ParcelsService } from '../parcels/parcels.service';
import { CreateParcelDto } from '../parcels/parcels.dto';
import { EmitEvent } from '../events/emit';
import { Errors } from '../common/errors';

class OfflineParcelDto {
  /** Waajib: client-ka ayaa sameeya (uuid) — sync-ga laba jeer la diro alaab laba jeer ma noqoto */
  @Matches(/^[A-Za-z0-9_-]{8,100}$/) idempotencyKey: string;
  @IsDateString() offlineCreatedAt: string;
  /** PIN-ka rasiidka offline-ka lagu daabacay */
  @IsOptional() @Matches(/^\d{4}$/) pickupPin?: string;
  @ValidateNested() @Type(() => CreateParcelDto) parcel: CreateParcelDto;
}

class SyncParcelsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => OfflineParcelDto)
  items: OfflineParcelDto[];
}

/**
 * Offline mode (UI_RULES §6): internet-ku marka uu go'o, website-ku alaabta wuu kaydiyaa (IndexedDB),
 * marka uu soo noqdo halkan ayuu u soo diraa. Tigidh offline lama iibiyo (kursi laba jeer ayaa la iibin karaa).
 */
@ApiTags('sync')
@ApiBearerAuth()
@Roles(...STAFF)
@Controller('sync')
export class SyncController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly parcels: ParcelsService,
  ) {}

  /** Xogta tixraaca ee website-ku kaydiyo si uu offline u shaqeeyo (qiimaha, laamaha, noocyada …). */
  @Get('bootstrap')
  async bootstrap(@CurrentUser() user: AuthUser) {
    const { start, end } = businessDayRange(businessDate());
    const [branches, routes, categories, settings, company, rate, trips] = await Promise.all([
      this.prisma.branch.findMany({ where: { isActive: true } }),
      this.prisma.route.findMany({ where: { isActive: true } }),
      this.prisma.parcelCategory.findMany({ where: { isActive: true } }),
      this.settings.get(),
      this.settings.company(),
      this.settings.currentRate(),
      this.prisma.trip.findMany({
        where: {
          departureAt: { gte: start, lt: end },
          ...(!isSuperAdmin(user) && { route: { OR: [{ fromBranchId: user.branchId! }, { toBranchId: user.branchId! }] } }),
        },
        include: { route: true, vehicle: { select: { plate: true, capacity: true } }, driver: { select: { name: true, phone: true } } },
      }),
    ]);
    return { serverTime: new Date(), businessDate: businessDate(), user, branches, routes, categories, settings, company, exchangeRate: rate, todayTrips: trips };
  }

  /** Alaabta offline lagu diiwaangeliyay. Mid kasta natiijadiisa ayaa la soo celiyaa (ok / error). */
  @EmitEvent('PARCEL_CHANGED', (r) => ({
    branchIds: (r.results ?? []).filter((x: { ok: boolean }) => x.ok).map((x: { toBranchId: string }) => x.toBranchId),
    data: { synced: r.synced },
  }))
  @Post('parcels')
  async parcelsSync(@CurrentUser() user: AuthUser, @Body() dto: SyncParcelsDto) {
    const results = [];
    for (const item of dto.items) {
      try {
        const at = new Date(item.offlineCreatedAt).getTime();
        if (at > Date.now() + 5 * 60_000 || at < Date.now() - 7 * 86400_000) {
          throw Errors.bad('OFFLINE_TIME_INVALID', 'offlineCreatedAt must be within the last 7 days (check the PC clock)');
        }
        const p = await this.parcels.create(user, item.parcel, item.idempotencyKey, {
          pickupPin: item.pickupPin,
          offlineCreatedAt: new Date(item.offlineCreatedAt),
        });
        results.push({ idempotencyKey: item.idempotencyKey, ok: true, trackingCode: p.trackingCode, receiptNo: p.receiptNo, id: p.id, toBranchId: p.toBranchId, replayed: 'replayed' in p });
      } catch (e) {
        const err = e as { code?: string; message?: string; details?: unknown };
        results.push({ idempotencyKey: item.idempotencyKey, ok: false, error: { code: err.code ?? 'ERROR', message: err.message, details: err.details } });
      }
    }
    return { synced: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
  }
}

@Module({ imports: [ParcelsModule], controllers: [SyncController] })
export class SyncModule {}
