import { Body, Controller, Get, Global, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { CurrentUser, MANAGERS, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { CashService } from './cash.service';
import { EmitEvent } from '../events/emit';
import { ApproveSessionDto, CloseSessionDto, OpenSessionDto } from './payment.dto';

class SessionQuery {
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() pendingApproval?: boolean;
  /** true = sanduuqyada weli furan (taariikh kasta) — kuwa karraanigu ka tagay maalin hore */
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() open?: boolean;
}

@ApiTags('cash-sessions')
@ApiBearerAuth()
@Roles(...STAFF)
@Controller('cash-sessions')
export class CashController {
  constructor(private readonly cash: CashService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: SessionQuery) {
    return this.cash.list(user, q);
  }

  @Get('current')
  current(@CurrentUser() user: AuthUser) {
    return this.cash.current(user);
  }

  @Post('open')
  open(@CurrentUser() user: AuthUser, @Body() dto: OpenSessionDto) {
    return this.cash.open(user, dto.openingUsdCents, dto.openingSlsh);
  }

  @EmitEvent('CASH_SESSION', (s) => ({ branchIds: [s.branchId], data: { sessionId: s.id, closed: true, variance: s.variance } }))
  @Post(':id/close')
  close(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CloseSessionDto) {
    return this.cash.close(user, id, dto.countedUsdCents, dto.countedSlsh, dto.note);
  }

  /** Manager: xir sanduuq karraani ka tagay (sabab waajib) */
  @Roles(...MANAGERS)
  @EmitEvent('CASH_SESSION', (s) => ({ branchIds: [s.branchId], data: { sessionId: s.id, closed: true, forced: true } }))
  @Post(':id/force-close')
  forceClose(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CloseSessionDto) {
    return this.cash.close(user, id, dto.countedUsdCents, dto.countedSlsh, dto.note, true);
  }

  @Roles(...MANAGERS)
  @Post(':id/approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ApproveSessionDto) {
    return this.cash.approve(user, id, dto.note);
  }
}

@Global()
@Module({ controllers: [CashController], providers: [CashService], exports: [CashService] })
export class CashModule {}
