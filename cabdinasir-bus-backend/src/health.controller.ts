import { Controller, Get } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from './prisma/prisma.service';
import { Public, Roles } from './common/decorators';

const startedAt = new Date();

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Monitoring (UptimeRobot …): 200 = API + database way shaqaynayaan. */
  @Public()
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', time: new Date().toISOString() };
  }

  /** Super Admin: xaaladda nidaamka — SMS sugaya/fashilmay, sanduuqyo furan, database latency. */
  @Roles(Role.SUPER_ADMIN)
  @Get('details')
  async details() {
    const t0 = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - t0;
    const [pendingSms, failedSms, oldestPending, openSessions, dbSize] = await Promise.all([
      this.prisma.notification.count({ where: { status: 'PENDING' } }),
      this.prisma.notification.count({ where: { status: 'FAILED' } }),
      this.prisma.notification.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      this.prisma.cashSession.count({ where: { closedAt: null } }),
      this.prisma.$queryRaw<{ size: string }[]>`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`,
    ]);
    return {
      status: 'ok',
      version: process.env.npm_package_version ?? '0.4.0',
      startedAt,
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      db: { latencyMs: dbLatencyMs, size: dbSize[0]?.size },
      sms: { pending: pendingSms, failed: failedSms, oldestPendingAt: oldestPending?.createdAt ?? null },
      openCashSessions: openSessions,
      jobsEnabled: process.env.JOBS_ENABLED !== 'false',
    };
  }
}
