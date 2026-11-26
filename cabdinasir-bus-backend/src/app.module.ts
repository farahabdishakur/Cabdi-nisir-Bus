import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env';
import { RequestLoggerMiddleware } from './common/request-logger.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AuditModule } from './audit/audit.module';
import { AuditInterceptor } from './audit/audit.interceptor';
import { SettingsModule } from './settings/settings.module';
import { CashModule } from './cash/cash.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BranchesModule } from './branches/branches.module';
import { UsersModule } from './users/users.module';
import { RoutesModule } from './routes/routes.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { DriversModule } from './drivers/drivers.module';
import { ParcelCategoriesModule } from './parcel-categories/parcel-categories.module';
import { TripsModule } from './trips/trips.module';
import { BookingsModule } from './bookings/bookings.module';
import { ParcelsModule } from './parcels/parcels.module';
import { FinanceModule } from './finance/finance.module';
import { PaymentsModule } from './payments/payments.module';
import { DriverPayModule } from './driver-pay/driver-pay.module';
import { EvidenceModule } from './evidence/evidence.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { FinesModule } from './fines/fines.module';
import { LedgerModule } from './ledger/ledger.module';
import { VoidRequestsModule } from './void-requests/void-requests.module';
import { ReportsModule } from './reports/reports.module';
import { CustomersModule } from './customers/customers.module';
import { PublicModule } from './public/public.module';
import { SyncModule } from './sync/sync.module';
import { JobsModule } from './jobs/jobs.module';
import { HealthController } from './health.controller';
import { EventsModule } from './events/events.module';
import { BranchDirectoryModule } from './common/branch-directory.service';
import { EmitInterceptor } from './events/emit';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }], skipIf: () => process.env.THROTTLE_DISABLED === 'true' }),
    PrismaModule,
    BranchDirectoryModule,
    EventsModule,
    AuditModule,
    AuthModule,
    SettingsModule,
    CashModule,
    DriverPayModule,
    NotificationsModule,
    BranchesModule,
    UsersModule,
    RoutesModule,
    VehiclesModule,
    DriversModule,
    ParcelCategoriesModule,
    TripsModule,
    BookingsModule,
    ParcelsModule,
    FinanceModule,
    LedgerModule,
    EvidenceModule,
    DispatchModule,
    FinesModule,
    PaymentsModule,
    VoidRequestsModule,
    ReportsModule,
    CustomersModule,
    PublicModule,
    SyncModule,
    JobsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: EmitInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*path');
  }
}
