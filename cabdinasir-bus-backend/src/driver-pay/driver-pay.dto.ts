import { Currency, DriverPaymentKind, DriverPayType, PaymentMethod } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Length, Matches, Max, Min, ValidateIf } from 'class-validator';

export class PayRuleDto {
  @IsEnum(DriverPayType) type: DriverPayType;
  /** PER_TRIP / MONTHLY_SALARY: senti (USD) */
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) amountCents?: number;
  /** PERCENT_*: basis points (1000 = 10%) */
  @IsOptional() @IsInt() @Min(0) @Max(10_000) bps?: number;
  @IsOptional() @IsDateString() effectiveFrom?: string;
}

export class DriverPayDto {
  @IsEnum(DriverPaymentKind) kind: DriverPaymentKind;
  /** Qadarka USD senti (haraaga darawalka waxaa lagu xisaabiyaa USD) */
  @IsInt() @Min(1) @Max(100_000_000) amountCents: number;
  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
  /** Lacagta gacanta laga bixinayo (SLSH → sicirka maanta) */
  @IsOptional() @IsEnum(Currency) currency?: Currency;
  @ValidateIf((o) => o.method && o.method !== PaymentMethod.CASH) @IsString() @Length(3, 64) reference?: string;
  @IsOptional() @IsString() @Length(0, 300) note?: string;
}

export class BonusDto {
  @IsInt() @Min(1) @Max(100_000_000) amountCents: number;
  @IsString() @Length(3, 300) note: string;
}

export class VoidDto {
  @IsString() @Length(3, 300) reason: string;
}

export class RangeDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
}

export class PeriodDto {
  @Matches(/^\d{4}-\d{2}$/) period: string;
}
