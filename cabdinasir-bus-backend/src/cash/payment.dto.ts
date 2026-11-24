import { IsEnum, IsInt, IsOptional, IsString, Length, Max, Min, ValidateIf } from 'class-validator';

/** Xadka sare ee lacag kasta (int4 ammaan ah) — USD $10M / SLSH 1B */
const MAX_AMOUNT = 1_000_000_000;
import { Currency, PaymentMethod } from '@prisma/client';

/** Sida macmiilku u bixinayo. Qadarka server-ka ayaa xisaabiya (qiimaha), client-ku wuxuu doortaa habka iyo lacagta. */
export class PaymentInputDto {
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsEnum(Currency) currency: Currency;
  /** Zaad/eDahab: lambarka transaction-ka — waajib */
  @ValidateIf((o) => o.method !== PaymentMethod.CASH)
  @IsString() @Length(3, 64)
  reference?: string;
}

export class OpenSessionDto {
  @IsOptional() @IsInt() @Min(0) @Max(MAX_AMOUNT) openingUsdCents?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_AMOUNT) openingSlsh?: number;
}

export class CloseSessionDto {
  @IsInt() @Min(0) @Max(MAX_AMOUNT) countedUsdCents: number;
  @IsInt() @Min(0) @Max(MAX_AMOUNT) countedSlsh: number;
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

export class ApproveSessionDto {
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}
