import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuthUser } from '../common/auth-user';
import { AppEventType, EventsService } from './events.service';

type Req = { user: AuthUser; params: Record<string, string>; body: Record<string, unknown> };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mapper = (result: any, req: Req) => { branchIds: (string | null | undefined)[]; data: Record<string, unknown> } | null;

const EMIT_KEY = 'emitEvent';

/**
 * Dir live event MARKA request-ku guulaysto (transaction-ku wuu dhammaaday) —
 * event weligiis lama diro wax aan database-ka gelin.
 */
export const EmitEvent = (type: AppEventType, mapper: Mapper) => SetMetadata(EMIT_KEY, { type, mapper });

@Injectable()
export class EmitInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector, private readonly events: EventsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<{ type: AppEventType; mapper: Mapper } | undefined>(EMIT_KEY, ctx.getHandler());
    if (!meta) return next.handle();
    const req = ctx.switchToHttp().getRequest<Req>();
    return next.handle().pipe(
      tap((result) => {
        try {
          const e = meta.mapper(result, req);
          if (e) this.events.publish(meta.type, [...e.branchIds, req.user?.branchId], e.data);
        } catch {
          /* event khalad ah request-ka ma jebiyo */
        }
      }),
    );
  }
}

/** Mappers la wadaago */
export const parcelEvent: Mapper = (p) =>
  p?.id ? { branchIds: [p.fromBranchId, p.toBranchId], data: { parcelId: p.id, trackingCode: p.trackingCode, status: p.status } } : null;
