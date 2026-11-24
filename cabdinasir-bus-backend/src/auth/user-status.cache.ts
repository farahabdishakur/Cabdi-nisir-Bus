import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface UserStatus {
  id: string;
  name: string;
  role: Role;
  branchId: string | null;
  isActive: boolean;
  tokenVersion: number;
  mustChangePassword: boolean;
}

const TTL_MS = 10_000;

/**
 * Xaaladda user-ka (cache 10s). Guard-ku request kasta wuu hubiyaa:
 * user la xiray / role la beddelay / password la beddelay → token-kii hore isla markiiba wuu dhacaa
 * (ma sugayo 15-ka daqiiqo ee access token-ka).
 */
@Injectable()
export class UserStatusCache {
  private cache = new Map<string, { s: UserStatus | null; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async get(id: string): Promise<UserStatus | null> {
    const hit = this.cache.get(id);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.s;
    const s = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, role: true, branchId: true, isActive: true, tokenVersion: true, mustChangePassword: true },
    });
    this.cache.set(id, { s, at: Date.now() });
    if (this.cache.size > 5000) this.cache.clear();
    return s;
  }

  invalidate(id: string) {
    this.cache.delete(id);
  }
}
