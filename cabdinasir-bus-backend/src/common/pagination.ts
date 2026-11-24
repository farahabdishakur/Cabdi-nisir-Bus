import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;
}

export function pageArgs(q: PageQuery) {
  return { skip: (q.page - 1) * q.limit, take: q.limit };
}

export function paged<T>(data: T[], total: number, q: PageQuery) {
  return { data, meta: { page: q.page, limit: q.limit, total } };
}
