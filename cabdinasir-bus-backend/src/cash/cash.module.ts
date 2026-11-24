import { Body, Controller, Get, Global, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { CurrentUser, MANAGERS, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { CashService } from './cash.service';
import { ApproveSessionDto, CloseSessionDto, OpenSessionDto } from './payment.dto';

class SessionQuery {
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() pendingApproval?: boolean;
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

  @Post(':id/close')
  close(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CloseSessionDto) {
    return this.cash.close(user, id, dto.countedUsdCents, dto.countedSlsh, dto.note);
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
