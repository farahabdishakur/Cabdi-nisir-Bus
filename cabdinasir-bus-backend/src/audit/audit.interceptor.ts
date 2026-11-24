import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth-user';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SKIP = [/\/auth\/(login|refresh|logout|change-password)$/];
const REDACT = new Set(['password', 'newPassword', 'currentPassword', 'passwordHash', 'pickupPin', 'pin', 'refreshToken', 'accessToken']);

function redact(v: unknown, depth = 0): unknown {
  if (depth > 4 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => redact(x, depth + 1));
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, REDACT.has(k) ? '***' : redact(x, depth + 1)]),
  );
}

/**
 * Audit log (CLAUDE.md §3.5): request kasta oo wax beddela waa la qoraa — cidda, maxay, goorma.
 * Ficillada xasaasiga ah (void, cash close) services-ka ayaa sidoo kale qora "before".
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    if (!MUTATING.has(req.method) || SKIP.some((r) => r.test(req.path))) return next.handle();
    const user: AuthUser | undefined = req.user;
    return next.handle().pipe(
      tap((result) => {
        const segments = (req.route?.path ?? req.path).replace(/^\/api\/v1\//, '').split('/');
        const entity = segments[0];
        const entityId = req.params?.id ?? (result as { id?: string } | undefined)?.id ?? null;
        this.prisma.auditLog
          .create({
            data: {
              userId: user?.id,
              branchId: user?.branchId,
              action: `${req.method} ${req.route?.path ?? req.path}`,
              entity,
              entityId,
              before: undefined,
              after: redact({ body: req.body, result }) as object,
              ip: req.ip,
            },
          })
          .catch(() => undefined);
      }),
    );
  }
}
