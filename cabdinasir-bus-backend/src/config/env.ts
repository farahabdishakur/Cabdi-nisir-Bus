import { plainToInstance, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUrl, Max, Min, MinLength, ValidateIf, validateSync } from 'class-validator';

/** Hubinta .env marka server-ku kacayo — haddii wax maqan yihiin, wuu diidaa inuu kaco. */
class Env {
  @IsOptional() @IsIn(['development', 'test', 'production']) NODE_ENV?: string;
  @IsString() DATABASE_URL: string;
  @IsString() @MinLength(32) JWT_ACCESS_SECRET: string;
  @IsString() @MinLength(32) JWT_REFRESH_SECRET: string;
  @IsOptional() @IsString() JWT_ACCESS_TTL?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(90) JWT_REFRESH_TTL_DAYS?: number;
  @IsOptional() @Type(() => Number) @IsInt() PORT?: number;
  @IsOptional() @IsString() CORS_ORIGIN?: string;
  @IsOptional() @IsIn(['log', 'http']) SMS_PROVIDER?: string;
  @ValidateIf((o) => !!o.SMS_HTTP_URL) @IsUrl({ require_tld: false }) SMS_HTTP_URL?: string;
  @IsOptional() @IsString() SMS_HTTP_TOKEN?: string;
  @IsOptional() @IsString() SMS_SENDER?: string;
  @IsOptional() @IsString() UPLOAD_DIR?: string;
  @IsOptional() @IsIn(['true', 'false']) JOBS_ENABLED?: string;
  @IsOptional() @IsIn(['true', 'false']) THROTTLE_DISABLED?: string;
  @IsOptional() @IsIn(['true', 'false']) SWAGGER_ENABLED?: string;
  @IsOptional() @IsString() TRUST_PROXY?: string;
}

export function validateEnv(raw: Record<string, unknown>) {
  const env = plainToInstance(Env, raw, { enableImplicitConversion: false });
  const errors = validateSync(env, { skipMissingProperties: false, whitelist: false });
  if (errors.length) {
    const msg = errors.map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${msg}`);
  }
  if (raw.NODE_ENV === 'production') {
    for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      if (String(raw[k]).startsWith('change-me')) throw new Error(`${k} must be changed in production`);
    }
    if (raw.SMS_PROVIDER === 'http' && !raw.SMS_HTTP_URL) throw new Error('SMS_HTTP_URL is required when SMS_PROVIDER=http');
  }
  return raw;
}
