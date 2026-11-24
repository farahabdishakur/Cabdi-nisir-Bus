import { Inject, Injectable, Logger } from '@nestjs/common';
import { Notification, NotificationStatus, Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth-user';
import { branchFilter } from '../common/branch-scope';
import { Errors } from '../common/errors';
import { isSmsCapable, normalizePhone } from '../common/phone';
import { redactPin, render, TemplateKey } from './templates';
import { SMS_PROVIDER, SmsProvider } from './sms.provider';

const MAX_ATTEMPTS = 5;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(private readonly prisma: PrismaService, @Inject(SMS_PROVIDER) private readonly sms: SmsProvider) {}

  /**
   * Ku dar outbox-ka (isla transaction-ka ficilka) — haddii internet-ka SMS-ku go'o, fariinta ma lumayso,
   * worker-ka ayaa mar dambe diraya.
   */
  async enqueue(db: Tx | PrismaService, to: string, template: TemplateKey, vars: Record<string, string | number>, parcelId?: string) {
    if (!isSmsCapable(to)) return null;
    return db.notification.create({ data: { to: normalizePhone(to), template, body: render(template, vars), parcelId } });
  }

  /** Dir fariimaha sugaya. FOR UPDATE SKIP LOCKED → laba worker isku fariin ma diraan. */
  async processPending(limit = 50) {
    const batch = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Notification[]>`
        SELECT * FROM "notifications"
        WHERE "status" = 'PENDING' AND "sendAfter" <= now()
        ORDER BY "createdAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED`;
      if (rows.length) {
        // kor u qaad sendAfter si worker kale u qaadan inta la dirayo
        await tx.notification.updateMany({
          where: { id: { in: rows.map((r) => r.id) } },
          data: { sendAfter: new Date(Date.now() + 5 * 60_000) },
        });
      }
      return rows;
    });
    let sent = 0;
    for (const n of batch) {
      try {
        await this.sms.send(n.to, n.body);
        await this.prisma.notification.update({
          where: { id: n.id },
          data: { status: NotificationStatus.SENT, sentAt: new Date(), attempts: n.attempts + 1, body: redactPin(n.body), lastError: null },
        });
        sent++;
      } catch (e) {
        const attempts = n.attempts + 1;
        const failed = attempts >= MAX_ATTEMPTS;
        await this.prisma.notification.update({
          where: { id: n.id },
          data: {
            attempts,
            lastError: String((e as Error).message).slice(0, 500),
            status: failed ? NotificationStatus.FAILED : NotificationStatus.PENDING,
            sendAfter: new Date(Date.now() + 2 ** attempts * 60_000), // 2, 4, 8, 16 daqiiqo
            ...(failed && { body: redactPin(n.body) }),
          },
        });
        this.logger.warn(`SMS ${n.id} failed (${attempts}/${MAX_ATTEMPTS}): ${(e as Error).message}`);
      }
    }
    return { picked: batch.length, sent };
  }

  list(user: AuthUser, q: { status?: NotificationStatus; parcelId?: string; branchId?: string }) {
    const branchId = branchFilter(user, q.branchId);
    const where: Prisma.NotificationWhereInput = {
      status: q.status,
      parcelId: q.parcelId,
      ...(branchId && { parcel: { OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] } }),
    };
    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, to: true, template: true, body: true, status: true, attempts: true, lastError: true, sentAt: true, parcelId: true, createdAt: true },
    }).then((rows) => rows.map((r) => ({ ...r, body: redactPin(r.body) })));
  }

  async retry(user: AuthUser, id: string) {
    const n = await this.prisma.notification.findUnique({ where: { id }, include: { parcel: true } });
    if (!n) throw Errors.notFound('Notification', id);
    if (n.parcel) branchFilter(user, user.branchId === n.parcel.toBranchId ? n.parcel.toBranchId : n.parcel.fromBranchId);
    if (n.status !== NotificationStatus.FAILED) throw Errors.conflict('NOT_FAILED', 'Only failed notifications can be retried');
    return this.prisma.notification.update({ where: { id }, data: { status: 'PENDING', attempts: 0, sendAfter: new Date() } });
  }
}
