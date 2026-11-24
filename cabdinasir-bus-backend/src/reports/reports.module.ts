import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';
import { CurrentUser, MANAGERS, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { ReportsService } from './reports.service';

class RangeDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsUUID() branchId?: string;
}

@ApiTags('reports')
@ApiBearerAuth()
@Roles(...MANAGERS)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Roles(...STAFF)
  @Get('dashboard')
  dashboard(@CurrentUser() u: AuthUser, @Query() q: RangeDto) {
    return this.reports.dashboard(u, q.branchId);
  }

  @Get('revenue')
  revenue(@CurrentUser() u: AuthUser, @Query() q: RangeDto) {
    return this.reports.revenue(u, q);
  }

  @Get('occupancy')
  occupancy(@CurrentUser() u: AuthUser, @Query() q: RangeDto) {
    return this.reports.occupancy(u, q);
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

@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
