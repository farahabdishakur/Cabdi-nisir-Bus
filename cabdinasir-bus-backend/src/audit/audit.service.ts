import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth-user';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Qor audit leh before/after (ficillada xasaasiga ah). */
  log(
    db: Tx | PrismaService,
    user: AuthUser,
    action: string,
    entity: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    return db.auditLog.create({
      data: {
        userId: user.id,
        branchId: user.branchId,
        action,
        entity,
        entityId,
        before: (before ?? undefined) as Prisma.InputJsonValue,
        after: (after ?? undefined) as Prisma.InputJsonValue,
      },
    });
  }
}
