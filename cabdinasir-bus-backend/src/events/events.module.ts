import { Controller, Global, MessageEvent, Module, Req, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { filter, from, interval, map, Observable, switchMap, takeUntil } from 'rxjs';
import { UserStatusCache } from '../auth/user-status.cache';

/** Inta xiriirku furan yahay: user la xiray / logout-all → stream-ka waa la jarayaa. */
export const EVENTS_REVALIDATE_MS = 5_000;
import { CurrentUser, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { EventsService } from './events.service';
import { EmitInterceptor } from './emit';

@ApiTags('events')
@ApiBearerAuth()
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService, private readonly status: UserStatusCache) {}

  /**
   * Server-Sent Events. Website-ku wuxuu isticmaalaa fetch-event-source (Authorization header) —
   * token-ka URL-ka laguma rido (logs ayuu galayaa).
   */
  @Roles(...STAFF)
  @Sse()
  stream(@CurrentUser() user: AuthUser, @Req() req: { tokenVersion: number }): Observable<MessageEvent> {
    const tv = req.tokenVersion;
    const revoked$ = interval(EVENTS_REVALIDATE_MS).pipe(
      switchMap(() => from(this.status.get(user.id))),
      filter((s) => !s || !s.isActive || s.tokenVersion !== tv || s.role !== user.role || s.branchId !== user.branchId),
    );
    return this.events.stream(user).pipe(
      takeUntil(revoked$),
      map((e) => ({ type: e.type, data: e.data })),
    );
  }
}

@Global()
@Module({ controllers: [EventsController], providers: [EventsService, EmitInterceptor], exports: [EventsService, EmitInterceptor] })
export class EventsModule {}
