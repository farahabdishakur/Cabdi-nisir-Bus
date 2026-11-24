import { Controller, Get, Global, Module, Param, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationStatus, Role } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { CurrentUser, MANAGERS, Roles } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { NotificationsService } from './notifications.service';
import { HttpSmsProvider, LogSmsProvider, SMS_PROVIDER } from './sms.provider';

class NotificationQuery {
  @IsOptional() @IsEnum(NotificationStatus) status?: NotificationStatus;
  @IsOptional() @IsUUID() parcelId?: string;
  @IsOptional() @IsUUID() branchId?: string;
}

@ApiTags('notifications')
@ApiBearerAuth()
@Roles(...MANAGERS)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: NotificationQuery) {
    return this.notifications.list(user, q);
  }

  @Post(':id/retry')
  retry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.retry(user, id);
  }

  /** Dir hadda (worker-ka gacanta) — Super Admin */
  @Roles(Role.SUPER_ADMIN)
  @Post('process')
  process() {
    return this.notifications.processPending();
  }
}

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService],
      useFactory: (c: ConfigService) =>
        c.get('SMS_PROVIDER') === 'http'
          ? new HttpSmsProvider(c.getOrThrow('SMS_HTTP_URL'), c.get('SMS_HTTP_TOKEN', ''), c.get('SMS_SENDER', 'CabdinasirBus'))
          : new LogSmsProvider(),
    },
  ],
  exports: [NotificationsService, SMS_PROVIDER],
})
export class NotificationsModule {}
