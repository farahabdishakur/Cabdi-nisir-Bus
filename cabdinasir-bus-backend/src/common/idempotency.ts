import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Errors } from './errors';

/**
 * Header `Idempotency-Key` (CLAUDE.md §3.9): badhanka laba jeer la riixo ama offline sync —
 * lacag laba jeer ma noqoto. Haddii key-gu horay u jiray, natiijadii hore ayaa la celinayaa.
 */
export const IdempotencyKey = createParamDecorator((_d: unknown, ctx: ExecutionContext): string | undefined => {
  const v = ctx.switchToHttp().getRequest().headers['idempotency-key'];
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(v)) {
    throw Errors.bad('INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be 8-100 chars [A-Za-z0-9_-]');
  }
  return v;
});

export function isUniqueViolation(e: unknown, target?: string): boolean {
  const err = e as { code?: string; meta?: { target?: unknown } };
  if (err?.code !== 'P2002') return false;
  if (!target) return true;
  const t = err.meta?.target;
  return Array.isArray(t) ? t.some((x) => String(x).includes(target)) : String(t ?? '').includes(target);
}
