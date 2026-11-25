import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { ReportsService } from '../reports/reports.service';
import { EventsService } from '../events/events.service';
import { expireReservations } from '../common/booking-status';
import { DriverPayService } from '../driver-pay/driver-pay.service';
import { businessDate } from '../common/time';

const DAY_MS = 86400_000;
const REMIND_AFTER_DAYS = 3;
const MAX_REMINDERS = 2;

/** Shaqooyinka gadaal ka socda. JOBS_ENABLED=false → way joogsadaan (tests). */
@Injectable()
export class JobsService {
  private readonly logger = new Logger('Jobs');
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
    private readonly reports: ReportsService,
    private readonly events: EventsService,
    private readonly driverPay: DriverPayService,
  ) {}

  private get enabled() {
    return this.config.get('JOBS_ENABLED', 'true') !== 'false';
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async sendSms() {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      await this.notifications.processPending();
    } catch (e) {
      this.logger.error(`SMS worker: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanup() {
    if (!this.enabled) return;
    await this.runCleanup();
  }

  /** 09:00 Africa/Mogadishu (06:00 UTC) */
  @Cron('0 6 * * *')
  async reminders() {
    if (!this.enabled) return;
    await this.runReminders();
  }

  /** Ballamaha wakhtigoodu dhacay → kursigu wuu furmayaa (daqiiqad kasta) + seat map-ka si toos ah ayuu u cusboonaadaa */
  @Cron(CronExpression.EVERY_MINUTE)
  async expireReservationsJob() {
    if (!this.enabled) return;
    await this.runExpireReservations();
  }

  async runExpireReservations() {
    const expired = await expireReservations(this.prisma);
    for (const tripId of new Set(expired.map((e) => e.tripId))) {
      const branches = expired.filter((e) => e.tripId === tripId).map((e) => e.branchId);
      this.events.publish('SEAT_CHANGED', branches, { tripId, expired: true });
    }
    if (expired.length) this.logger.log(`Reservations expired: ${expired.length}`);
    return { expired: expired.length };
  }

  /** 1-da bisha 03:00 Africa/Mogadishu (00:00 UTC): mushaharka darawallada bishii hore */
  @Cron('0 0 1 * *')
  async monthlySalaries() {
    if (!this.enabled) return;
    const [y, m] = businessDate().split('-').map(Number);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    await this.driverPay.accrueMonthly(prev);
  }

  /** 08:00 Africa/Mogadishu (05:00 UTC): hubinta lacagta → SMS Super Admin haddii dhibaato jirto */
  @Cron('0 5 * * *')
  async integrityAlert() {
    if (!this.enabled) return;
    await this.runIntegrityAlert();
  }

  async runIntegrityAlert() {
    const r = await this.reports.integrity({ id: 'system', name: 'system', role: 'SUPER_ADMIN', branchId: null }, {});
    if (r.ok) return { issues: 0, notified: 0 };
    const admins = await this.prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true }, select: { phone: true } });
    let notified = 0;
    for (const a of admins) {
      if (await this.notifications.enqueue(this.prisma, a.phone, 'INTEGRITY_ALERT', { issues: r.issues })) notified++;
    }
    this.logger.warn(`Integrity: ${r.issues} issue(s), ${notified} admin(s) notified`);
    return { issues: r.issues, notified };
  }

  async runCleanup() {
    const holds = await this.prisma.seatHold.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const tokens = await this.prisma.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date(Date.now() - DAY_MS) } }, { revokedAt: { lt: new Date(Date.now() - 7 * DAY_MS) } }] },
    });
    return { seatHolds: holds.count, refreshTokens: tokens.count };
  }

  /** Alaab aan la qaadin → xusuusin SMS (ugu badnaan 2). */
  async runReminders() {
    const s = await this.settings.get();
    const parcels = await this.prisma.parcel.findMany({
      where: { status: 'ARRIVED', remindersSent: { lt: MAX_REMINDERS }, arrivedAt: { lt: new Date(Date.now() - REMIND_AFTER_DAYS * DAY_MS) } },
      include: { toBranch: true },
      take: 500,
    });
    let queued = 0;
    for (const p of parcels) {
      // xusuusinta 2aad: kaliya ka dib 3 maalmood oo kale
      const due = p.arrivedAt!.getTime() + REMIND_AFTER_DAYS * (p.remindersSent + 1) * DAY_MS < Date.now();
      if (!due) continue;
      const daysLeft = Math.max(0, s.uncollectedDays - Math.floor((Date.now() - p.arrivedAt!.getTime()) / DAY_MS));
      await this.prisma.$transaction(async (tx) => {
        await this.notifications.enqueue(tx, p.receiverPhone, 'PARCEL_REMINDER', { code: p.trackingCode, to: p.toBranch.name, days: daysLeft }, p.id);
        await tx.parcel.update({ where: { id: p.id }, data: { remindersSent: { increment: 1 } } });
      });
      queued++;
    }
    return { queued };
  }
}
