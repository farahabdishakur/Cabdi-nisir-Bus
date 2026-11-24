import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

/** Ugu yaraan 8 xaraf, xaraf + tiro. */
export const STRONG_PASSWORD = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;
export const STRONG_PASSWORD_MSG = 'Password must be 8-128 characters with at least one letter and one number';

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

  @IsString() @Matches(STRONG_PASSWORD, { message: STRONG_PASSWORD_MSG })
  newPassword: string;
}
