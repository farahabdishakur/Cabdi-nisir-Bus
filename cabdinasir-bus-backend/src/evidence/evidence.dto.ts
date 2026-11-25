import { ClaimStatus, ClaimType, MediaStage } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import { PHONE_RE } from '../bookings/bookings.dto';
import { PageQuery } from '../common/pagination';

/** Multipart fields (file + kuwan) */
export class MediaUploadDto {
  @IsOptional() @IsEnum(MediaStage) stage?: MediaStage;
  @IsOptional() @IsString() @Length(0, 300) note?: string;
  @IsOptional() @IsUUID() claimId?: string;
}

export class OpenClaimDto {
  @IsEnum(ClaimType) type: ClaimType;
  @IsString() @Length(5, 1000) description: string;
  @IsString() @Length(2, 100) claimantName: string;
  @Matches(PHONE_RE) claimantPhone: string;
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) claimedAmountCents?: number;
}

export class ResolveClaimDto {
  @IsIn(['ACCEPTED', 'REJECTED']) decision: 'ACCEPTED' | 'REJECTED';
  @IsString() @Length(5, 1000) resolution: string;
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) compensationCents?: number;
}

export class ClaimQuery extends PageQuery {
  @IsOptional() @IsEnum(ClaimStatus) status?: ClaimStatus;
  @IsOptional() @IsUUID() parcelId?: string;
}
