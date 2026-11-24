import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString() @IsNotEmpty()
  phone: string;

  @IsString() @IsNotEmpty()
  password: string;
}

export class RefreshDto {
  /** Browser-ka: cookie `refresh_token` ayaa la isticmaalaa; body waa ikhtiyaari (tools/tests). */
  @IsOptional() @IsString()
  refreshToken?: string;
}

export class ChangePasswordDto {
  @IsString() @IsNotEmpty()
  currentPassword: string;

  @IsString() @MinLength(8)
  newPassword: string;
}
