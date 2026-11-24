import { IsEnum, IsInt, IsOptional, IsString, Length, Min, ValidateIf } from 'class-validator';
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
  @IsOptional() @IsInt() @Min(0) openingUsdCents?: number;
  @IsOptional() @IsInt() @Min(0) openingSlsh?: number;
}

export class CloseSessionDto {
  @IsInt() @Min(0) countedUsdCents: number;
  @IsInt() @Min(0) countedSlsh: number;
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

export class ApproveSessionDto {
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}
