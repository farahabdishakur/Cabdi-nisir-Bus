import { Body, Controller, Get, Global, Module, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { SettingsService } from './settings.service';

export class UpdateSettingsDto {
  @IsOptional() @IsInt() @Min(0) fragileSurchargeCents?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10000) insuranceBps?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10000) maxDiscountBps?: number;
  @IsOptional() @IsInt() @Min(30) @Max(1800) seatHoldSeconds?: number;
  @IsOptional() @IsInt() @Min(1) @Max(90) uncollectedDays?: number;
  @IsOptional() @IsInt() @Min(0) storageFeePerDayCents?: number;
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

export class SetRateDto {
  @IsInt() @Min(1) usdToSlsh: number;
}

@ApiTags('settings')
@ApiBearerAuth()
@Controller()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('pricing-settings')
  get() {
    return this.settings.get();
  }

  @Roles(Role.SUPER_ADMIN)
  @Put('pricing-settings')
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto);
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
