import { Prisma } from '@prisma/client';
import { Errors } from './errors';

/**
 * Xannibaad (block) — bas / darawal / shaqaale: isActive=false waxay u baahan tahay SABAB (BUSINESS_RULES §33).
 * Dib u furid (isActive=true) → sababta waa la tirtiraa. Audit log-ka ayaa haya taariikhda oo dhan.
 */
export function blockData(dto: { isActive?: boolean; blockReason?: string }): { isActive?: boolean; blockReason?: string | null; blockedAt?: Date | null } {
  if (dto.isActive === false) {
    const reason = dto.blockReason?.trim();
    if (!reason || reason.length < 3) throw Errors.bad('BLOCK_REASON_REQUIRED', 'A reason is required to block');
    return { isActive: false, blockReason: reason, blockedAt: new Date() };
  }
  if (dto.isActive === true) return { isActive: true, blockReason: null, blockedAt: null };
  return {};
}

/** Bas / darawal la xannibay → safka maanta (WAITING) waa laga saaraa */
export async function removeFromQueue(db: Prisma.TransactionClient, where: { vehicleId?: string; driverId?: string }, reason: string) {
  await db.dispatchEntry.updateMany({ where: { ...where, status: 'WAITING' }, data: { status: 'REMOVED', removedReason: `BLOCKED: ${reason}`.slice(0, 200) } });
}
