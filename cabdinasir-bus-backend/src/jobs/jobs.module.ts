import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { JobsService } from './jobs.service';
import { ReportsModule } from '../reports/reports.module';

@Module({ imports: [ScheduleModule.forRoot(), ReportsModule], providers: [JobsService], exports: [JobsService] })
export class JobsModule {}
