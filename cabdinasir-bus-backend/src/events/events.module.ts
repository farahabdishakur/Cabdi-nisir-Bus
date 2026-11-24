import { Controller, Global, MessageEvent, Module, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { map, Observable } from 'rxjs';
import { CurrentUser, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { EventsService } from './events.service';
import { EmitInterceptor } from './emit';

@ApiTags('events')
@ApiBearerAuth()
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /**
   * Server-Sent Events. Website-ku wuxuu isticmaalaa fetch-event-source (Authorization header) —
   * token-ka URL-ka laguma rido (logs ayuu galayaa).
   */
  @Roles(...STAFF)
  @Sse()
  stream(@CurrentUser() user: AuthUser): Observable<MessageEvent> {
    return this.events.stream(user).pipe(map((e) => ({ type: e.type, data: e.data })));
  }
}

@Global()
@Module({ controllers: [EventsController], providers: [EventsService, EmitInterceptor], exports: [EventsService, EmitInterceptor] })
export class EventsModule {}
