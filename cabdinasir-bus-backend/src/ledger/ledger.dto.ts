import { Currency, LedgerDirection, PaymentMethod } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

export class LedgerEntryDto {
  @IsEnum(LedgerDirection) direction: LedgerDirection;
  @IsString() @Length(2, 40) category: string;
  @IsString() @Length(2, 300) description: string;
  /** USD → senti · SLSH → shilin */
  @IsInt() @Min(1) @Max(1_000_000_000) amount: number;
  @IsEnum(Currency) currency: Currency;
  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
  @IsOptional() @IsString() @Length(0, 64) reference?: string;
  @IsOptional() @IsDateString() entryDate?: string;
  /** P&L: laanta / gaariga uu khuseeyo */
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() vehicleId?: string;
}

export class BookQuery {
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsIn(['CASH_USD', 'CASH_SLSH', 'ZAAD', 'EDAHAB']) account?: 'CASH_USD' | 'CASH_SLSH' | 'ZAAD' | 'EDAHAB';
  @IsOptional() @IsIn(['json', 'csv']) format?: 'json' | 'csv';
}

export class VoidLedgerDto {
  @IsString() @Length(3, 300) reason: string;
}
