import { Body, Controller, Get, Global, Module, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser, MANAGERS, Roles } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { IdempotencyKey } from '../common/idempotency';
import { DriverPayService } from './driver-pay.service';
import { BonusDto, DriverPayDto, PayRuleDto, PeriodDto, RangeDto, VoidDto } from './driver-pay.dto';

@ApiTags('driver-pay')
@ApiBearerAuth()
@Roles(...MANAGERS)
@Controller('driver-pay')
export class DriverPayController {
  constructor(private readonly svc: DriverPayService) {}

  /** Dhammaan darawallada: kasbasho, bixin, haraaga */
  @Get()
  summary(@CurrentUser() u: AuthUser, @Query() q: RangeDto) {
    return this.svc.summary(u, q);
  }

  @Get(':driverId/statement')
  statement(@CurrentUser() u: AuthUser, @Param('driverId') id: string, @Query() q: RangeDto) {
    return this.svc.statement(u, id, q);
  }

  @Get(':driverId/rules')
  async rules(@CurrentUser() u: AuthUser, @Param('driverId') id: string) {
    await this.svc.driverFor(u, id);
    return this.svc.rules(id);
  }

  @Put(':driverId/rule')
  setRule(@CurrentUser() u: AuthUser, @Param('driverId') id: string, @Body() dto: PayRuleDto) {
    return this.svc.setRule(u, id, dto);
  }

  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @Post(':driverId/payments')
  pay(@CurrentUser() u: AuthUser, @Param('driverId') id: string, @Body() dto: DriverPayDto, @IdempotencyKey() key?: string) {
    return this.svc.pay(u, id, dto, key);
  }

  @Post(':driverId/bonus')
  bonus(@CurrentUser() u: AuthUser, @Param('driverId') id: string, @Body() dto: BonusDto) {
    return this.svc.bonus(u, id, dto.amountCents, dto.note);
  }

  /** Rasiidka bixinta (daabacaad) */
  @Get('payments/:id/voucher')
  voucher(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.voucher(u, id);
  }

  @Post('payments/:id/void')
  voidPayment(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: VoidDto) {
    return this.svc.voidPayment(u, id, dto.reason);
  }

  @Post('earnings/:id/void')
  voidEarning(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: VoidDto) {
    return this.svc.voidEarning(u, id, dto.reason);
  }

  /** Mushaharka bille gacanta (job-ku 1-da bisha ayuu sameeyaa) */
  @Roles(Role.SUPER_ADMIN)
  @Post('run-monthly')
  runMonthly(@Body() dto: PeriodDto) {
    return this.svc.accrueMonthly(dto.period);
  }
}

@Global()
@Module({ controllers: [DriverPayController], providers: [DriverPayService], exports: [DriverPayService] })
export class DriverPayModule {}
