import { Body, Controller, Delete, Get, Global, Module, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { createHash } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { Errors } from '../common/errors';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { SettingsService } from './settings.service';
import { BranchDirectory } from '../common/branch-directory.service';

const uploadDir = () => resolve(process.env.UPLOAD_DIR ?? './uploads');

export class UpdateSettingsDto {
  @IsOptional() @IsInt() @Min(0) @Max(10_000_000) fragileSurchargeCents?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10000) insuranceBps?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10000) maxDiscountBps?: number;
  @IsOptional() @IsInt() @Min(30) @Max(1800) seatHoldSeconds?: number;
  @IsOptional() @IsInt() @Min(1) @Max(90) uncollectedDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10_000_000) storageFeePerDayCents?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1) shareTripsWithinCity?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1440) reservationCutoffMinutes?: number;
  @IsOptional() @IsInt() @Min(1) @Max(14) maxReservationsPerPhone?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1) requireDeliveryPhoto?: number;
}
export class UpdateCompanyDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional() @IsString() @Length(0, 200) tagline?: string;
  @IsOptional() @IsString() @Length(0, 500) mission?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) slogans?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) passengerRules?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) parcelRules?: string[];
  @IsOptional() @IsString() @Length(0, 200) receiptFooter?: string;
}

class RateHistoryQuery {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
}

export class SetRateDto {
  @IsInt() @Min(1) @Max(1_000_000) usdToSlsh: number;
}

@ApiTags('settings')
@ApiBearerAuth()
@Controller()
export class SettingsController {
  constructor(private readonly settings: SettingsService, private readonly prisma: PrismaService, private readonly dir: BranchDirectory) {}

  /** Taariikhda sicirka (warbixinada SLSH) */
  @Get('exchange-rates')
  rates(@Query() q: RateHistoryQuery) {
    return this.prisma.exchangeRate.findMany({
      where: { date: { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined } },
      orderBy: { date: 'desc' },
      take: 366,
    });
  }

  @Get('pricing-settings')
  get() {
    return this.settings.get();
  }

  @Roles(Role.SUPER_ADMIN)
  @Put('pricing-settings')
  async update(@Body() dto: UpdateSettingsDto) {
    const s = await this.settings.update(dto);
    this.dir.invalidate();
    return s;
  }

  /** Macluumaadka shirkadda (rasiidka, label-ka, bogga tracking-ka) — public */
  @Public()
  @Get('company')
  company() {
    return this.settings.company();
  }

  @Roles(Role.SUPER_ADMIN)
  @Put('company')
  updateCompany(@Body() dto: UpdateCompanyDto) {
    return this.settings.updateCompany(dto);
  }

  /** Logo-ga shirkadda: PNG/JPEG/WEBP ≤ 1MB (SVG maya — script ayuu qaadi karaa) */
  @Roles(Role.SUPER_ADMIN)
  @ApiConsumes('multipart/form-data')
  @Post('company/logo')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 1024 * 1024, files: 1 } }))
  async uploadLogo(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw Errors.bad('FILE_REQUIRED', 'Upload an image in field "file"');
    const b = file.buffer;
    const ext = b[0] === 0xff && b[1] === 0xd8 ? 'jpg' : b.subarray(0, 4).toString('hex') === '89504e47' ? 'png' : b.subarray(8, 12).toString() === 'WEBP' ? 'webp' : null;
    if (!ext) throw Errors.bad('INVALID_FILE_TYPE', 'Logo must be PNG, JPEG or WEBP');
    const v = createHash('sha256').update(b).digest('hex').slice(0, 12);
    const dir = join(uploadDir(), 'branding');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `logo-${v}.${ext}`), b);
    return this.settings.updateCompany({ logoUrl: `/api/v1/public/logo?v=${v}`, logoPath: `branding/logo-${v}.${ext}` });
  }

  @Roles(Role.SUPER_ADMIN)
  @Delete('company/logo')
  removeLogo() {
    return this.settings.updateCompany({ logoUrl: null, logoPath: null });
  }

  /** Dadweyne (login, rasiid, bogga raadinta) */
  @Public()
  @Get('public/logo')
  async logo(@Query('v') v: string | undefined, @Res() res: Response) {
    const c = await this.settings.company();
    if (!c.logoPath) throw Errors.notFound('Logo', 'company');
    // ?v=<hash> → weligiis isma beddelo; la'aanteed → 5 daqiiqo (logo cusub si dhakhso ah ayuu u muuqdaa)
    res.setHeader('Cache-Control', v && c.logoUrl?.endsWith(`v=${v}`) ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(resolve(uploadDir(), c.logoPath));
  }

  @Get('exchange-rates/today')
  today() {
    return this.settings.currentRate();
  }

  @Roles(Role.SUPER_ADMIN)
  @Put('exchange-rates/today')
  setToday(@CurrentUser() user: AuthUser, @Body() dto: SetRateDto) {
    return this.settings.setTodayRate(dto.usdToSlsh, user.id);
  }
}

@Global()
@Module({ controllers: [SettingsController], providers: [SettingsService], exports: [SettingsService] })
export class SettingsModule {}
