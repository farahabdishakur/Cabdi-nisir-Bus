import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID, Length, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TripStatus } from '@prisma/client';

export class CreateTripDto {
  @IsUUID() routeId: string;
  @IsUUID() vehicleId: string;
  @IsUUID() driverId: string;
  @IsDateString() departureAt: string;
}

/** Jadwalka maalinta hal mar (tusaale 6 safar oo subax kasta) */
export class BulkTripsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => CreateTripDto)
  trips: CreateTripDto[];
}

export class UpdateTripDto {
  @IsOptional() @IsUUID() vehicleId?: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsDateString() departureAt?: string;
}

export class TripStatusDto {
  @IsEnum(TripStatus) status: TripStatus;
  @IsOptional() @IsString() @Length(0, 300) reason?: string;
}

export class TripQuery {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @IsUUID() fromBranchId?: string;
  @IsOptional() @IsUUID() toBranchId?: string;
  @IsOptional() @IsEnum(TripStatus) status?: TripStatus;
}
