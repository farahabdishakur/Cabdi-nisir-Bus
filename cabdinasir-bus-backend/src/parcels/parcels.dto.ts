import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length,
  Matches, Max, Min, ValidateNested,
} from 'class-validator';
import { ParcelStatus, Payer, PaymentMethod } from '@prisma/client';
import { PaymentInputDto } from '../cash/payment.dto';
import { PageQuery } from '../common/pagination';
import { PHONE_RE } from '../bookings/bookings.dto';

export class QuoteParcelDto {
  /** Super Admin kaliya ayaa cayima; shaqaalaha laantooda ayaa la qaataa */
  @IsOptional() @IsUUID() fromBranchId?: string;
  @IsUUID() toBranchId: string;
  @IsUUID() categoryId: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(2000) weightKg: number;
  @IsOptional() @IsBoolean() isFragile?: boolean;
  @IsOptional() @IsBoolean() insured?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) declaredValueCents?: number;
}

export class CreateParcelDto extends QuoteParcelDto {
  @IsString() @Length(2, 80) senderName: string;
  @Matches(PHONE_RE) senderPhone: string;
  @IsString() @Length(2, 80) receiverName: string;
  @Matches(PHONE_RE) receiverPhone: string;
  @IsInt() @Min(1) @Max(500) pieces: number;
  @IsOptional() @IsString() @Length(0, 500) description?: string;
  @IsOptional() @IsBoolean() packagingOk?: boolean;
  @IsEnum(Payer) payer: Payer;
  /** Waajib marka payer = SENDER */
  @IsOptional() @ValidateNested() @Type(() => PaymentInputDto) payment?: PaymentInputDto;
}

export class LoadParcelDto {
  @IsUUID() tripId: string;
}

export class ArriveBatchDto {
  @IsUUID() tripId: string;
  /** Alaabta la xaqiijiyay inay timid (scan/riix). Kuwa kale ee safarka → waa la soo celiyaa "maqan". */
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID('all', { each: true }) parcelIds: string[];
}

export class DeliverParcelDto {
  @Matches(/^\d{4}$/) pin: string;
  @IsString() @Length(2, 80) receivedByName: string;
  /** Waajib haddii COD ama khidmad kayd (storage fee) jirto */
  @IsOptional() @ValidateNested() @Type(() => PaymentInputDto) payment?: PaymentInputDto;
}

export class VoidParcelDto {
  @IsString() @Length(3, 300) reason: string;
  @IsOptional() @IsBoolean() refund?: boolean;
  @IsOptional() @ValidateNested() @Type(() => PaymentInputDto) refundPayment?: PaymentInputDto;
}

/** Sixitaan qalad qoraal (magac/taleefan/sharraxaad). Qiimaha/miisaanka lama beddelo — void + mid cusub. */
export class CorrectParcelDto {
  @IsOptional() @IsString() @Length(2, 80) senderName?: string;
  @IsOptional() @Matches(PHONE_RE) senderPhone?: string;
  @IsOptional() @IsString() @Length(2, 80) receiverName?: string;
  @IsOptional() @Matches(PHONE_RE) receiverPhone?: string;
  @IsOptional() @IsString() @Length(0, 500) description?: string;
  @IsString() @Length(3, 300) reason: string;
}

export class NoteDto {
  @IsString() @Length(3, 500) note: string;
}

export class ParcelQuery extends PageQuery {
  @IsOptional() @IsEnum(['incoming', 'outgoing', 'all']) direction?: 'incoming' | 'outgoing' | 'all';
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsEnum(ParcelStatus) status?: ParcelStatus;
  @IsOptional() @IsUUID() tripId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  /** koodh, rasiid, taleefan ama magac */
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(PaymentMethod) paidVia?: PaymentMethod;
}
