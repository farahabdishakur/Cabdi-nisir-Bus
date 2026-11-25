import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min, ValidateNested } from 'class-validator';
import { BookingStatus, PaymentMethod } from '@prisma/client';
import { PaymentInputDto } from '../cash/payment.dto';
import { PageQuery } from '../common/pagination';

export const PHONE_RE = /^\+?[0-9 ]{6,20}$/;

export class CreateBookingDto {
  @IsUUID() tripId: string;
  @IsString() @Length(1, 4) seatNo: string;
  @IsString() @Length(2, 80) passengerName: string;
  @Matches(PHONE_RE) passengerPhone: string;
  /** Manager kaliya, ≤ maxDiscountBps */
  @IsOptional() @IsInt() @Min(0) @Max(10_000_000) discountCents?: number;
  @ValidateNested() @Type(() => PaymentInputDto) payment: PaymentInputDto;
  /** Lambarka tigidhka warqadda (buugga) — waajib haddii dejinta ticketMode = 1 */
  @IsOptional() @Matches(/^[A-Za-z0-9-]{1,20}$/) paperTicketNo?: string;
}

export class VoidBookingDto {
  @IsString() @Length(3, 300) reason: string;
  /** Lacagta dib ma loo celinayaa? (sanduuqa manager-ka ayay ka baxaysaa) */
  @IsOptional() @IsBoolean() refund?: boolean;
  @IsOptional() @ValidateNested() @Type(() => PaymentInputDto) refundPayment?: PaymentInputDto;
}

/** Ballan taleefan: macmiilku wuu soo wacay — kursi lacag la'aan ah, wakhti leh. */
export class ReserveBookingDto {
  @IsUUID() tripId: string;
  @IsString() @Length(1, 4) seatNo: string;
  @IsString() @Length(2, 80) passengerName: string;
  @Matches(PHONE_RE) passengerPhone: string;
}

/** Macmiilka ballanta lahaa wuu yimid oo wuu bixiyay. */
export class ConfirmReservationDto {
  @IsOptional() @IsInt() @Min(0) @Max(10_000_000) discountCents?: number;
  @ValidateNested() @Type(() => PaymentInputDto) payment: PaymentInputDto;
  /** Lambarka tigidhka warqadda (buugga) — waajib haddii dejinta ticketMode = 1 */
  @IsOptional() @Matches(/^[A-Za-z0-9-]{1,20}$/) paperTicketNo?: string;
}

export class CancelReservationDto {
  @IsString() @Length(3, 300) reason: string;
}

export class CorrectBookingDto {
  @IsOptional() @IsString() @Length(2, 80) passengerName?: string;
  @IsOptional() @Matches(PHONE_RE) passengerPhone?: string;
  @IsOptional() @Matches(/^[A-Za-z0-9-]{1,20}$/) paperTicketNo?: string;
  @IsString() @Length(3, 300) reason: string;
}

export class TransferBookingDto {
  @IsUUID() tripId: string;
  @IsString() @Length(1, 4) seatNo: string;
  /** Waajib haddii qiimaha cusub ka badan yahay kii hore */
  @IsOptional() @ValidateNested() @Type(() => PaymentInputDto) payment?: PaymentInputDto;
}

export class BookingQuery extends PageQuery {
  @IsOptional() @IsUUID() tripId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(BookingStatus) status?: BookingStatus;
  /** ZAAD / EDAHAB / CASH — tigidhada lagu bixiyay habkaas */
  @IsOptional() @IsEnum(PaymentMethod) paidVia?: PaymentMethod;
}
