import { Controller, Get, Module, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import { toCsv } from '../common/csv';
import { CurrentUser, MANAGERS, Roles } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { ReportsService } from './reports.service';

class RangeDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsUUID() branchId?: string;
  /** csv → Excel-ka ayaa lagu furi karaa */
  @IsOptional() @IsIn(['json', 'csv']) format?: 'json' | 'csv';
}

class DriverTripsDto extends RangeDto {
  @IsOptional() @IsUUID() driverId?: string;
}

class DayDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @IsUUID() branchId?: string;
}

function send(res: Response, q: RangeDto, name: string, data: unknown, rows: () => Record<string, unknown>[]) {
  if (q.format !== 'csv') return data;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${q.from ?? 'today'}.csv"`);
  return toCsv(rows());
}

@ApiTags('reports')
@ApiBearerAuth()
@Roles(...MANAGERS)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() u: AuthUser, @Query() q: RangeDto) {
    return this.reports.dashboard(u, q.branchId);
  }

  @Get('revenue')
  async revenue(@CurrentUser() u: AuthUser, @Query() q: RangeDto, @Res({ passthrough: true }) res: Response) {
    const d = await this.reports.revenue(u, q);
    return send(res, q, 'revenue', d, () => d.daily.map((x) => ({ day: x.day, usd: (x.usdCents / 100).toFixed(2) })));
  }

  @Get('occupancy')
  async occupancy(@CurrentUser() u: AuthUser, @Query() q: RangeDto, @Res({ passthrough: true }) res: Response) {
    const d = await this.reports.occupancy(u, q);
    return send(res, q, 'occupancy', d, () => d.trips.map(({ tripId: _t, ...x }) => ({ ...x, departureAt: x.departureAt.toISOString() })));
  }

  @Get('driver-trips')
  async driverTrips(@CurrentUser() u: AuthUser, @Query() q: DriverTripsDto, @Res({ passthrough: true }) res: Response) {
    const d = await this.reports.driverTrips(u, q);
    const t = (x: Date | null) => (x ? x.toISOString() : '');
    return send(res, q, 'driver-trips', d, () =>
      d.trips.map((x) => ({ driver: x.driver, phone: x.driverPhone, bus: x.fleetNo ?? '', plate: x.vehicle, route: x.route, status: x.status, planned: t(x.departureAt), departed: t(x.departedAt), arrived: t(x.arrivedAt), passengers: x.passengers })),
    );
  }

  @Get('trips-profit')
  async tripsProfit(@CurrentUser() u: AuthUser, @Query() q: RangeDto, @Res({ passthrough: true }) res: Response) {
    const d = await this.reports.tripsProfit(u, q);
    return send(res, q, 'trips-profit', d, () => d.trips.map(({ tripId: _t, ...x }) => ({ ...x, departureAt: x.departureAt.toISOString() })));
  }

  /** Hubinta daacadnimada lacagta — liis madhan = wax walba waa sax */
  @Get('integrity')
  integrity(@CurrentUser() u: AuthUser, @Query() q: RangeDto) {
    return this.reports.integrity(u, q);
  }

  @Get('daily-close')
  dailyClose(@CurrentUser() u: AuthUser, @Query() q: DayDto) {
    return this.reports.dailyClose(u, q);
  }

  @Get('cashiers')
  async cashiers(@CurrentUser() u: AuthUser, @Query() q: RangeDto, @Res({ passthrough: true }) res: Response) {
    const d = await this.reports.cashiers(u, q);
    return send(res, q, 'cashiers', d, () => d.cashiers.map(({ userId: _u, ...x }) => x));
  }

  @Get('parcels')
  parcels(@CurrentUser() u: AuthUser, @Query() q: RangeDto) {
    return this.reports.parcels(u, q);
  }

  @Get('exceptions')
  exceptions(@CurrentUser() u: AuthUser, @Query() q: RangeDto) {
    return this.reports.exceptions(u, q);
  }

  @Get('inter-branch')
  interBranch(@CurrentUser() u: AuthUser, @Query() q: RangeDto) {
    return this.reports.interBranch(u, q);
  }
}

@Module({ controllers: [ReportsController], providers: [ReportsService], exports: [ReportsService] })
export class ReportsModule {}
