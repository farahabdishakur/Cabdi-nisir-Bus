import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Errors } from '../common/errors';
import { UserStatusCache } from './user-status.cache';

/** Isku day khaldan (taleefan + IP) → 5 ayaa la oggol yahay 15 daqiiqo gudahood (qofka weeraraya kaliya ayaa la xiraa). */
const MAX_FAILED_PER_IP = 5;
/** Akoonka laftiisa waxaa la xiraa kaliya marka weerar ballaaran (IP badan) dhaco. */
const MAX_FAILED = 20;
const LOCK_MINUTES = 15;
const WINDOW_MS = LOCK_MINUTES * 60_000;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly status: UserStatusCache,
  ) {}

  static hashPassword(password: string) {
    return argon2.hash(password);
  }

  private readonly attempts = new Map<string, { count: number; first: number }>();

  private ipLimited(phone: string, ip?: string) {
    const a = this.attempts.get(`${phone}|${ip ?? '-'}`);
    return !!a && Date.now() - a.first < WINDOW_MS && a.count >= MAX_FAILED_PER_IP;
  }

  private noteFailure(phone: string, ip?: string) {
    const key = `${phone}|${ip ?? '-'}`;
    const a = this.attempts.get(key);
    if (!a || Date.now() - a.first >= WINDOW_MS) this.attempts.set(key, { count: 1, first: Date.now() });
    else a.count++;
    if (this.attempts.size > 10_000) this.attempts.clear();
  }

  async login(phone: string, password: string, ip?: string) {
    if (this.ipLimited(phone, ip)) throw Errors.conflict('TOO_MANY_ATTEMPTS', 'Too many wrong attempts, try again in 15 minutes');
    const user = await this.prisma.user.findUnique({ where: { phone } });
    const log = (action: string, extra: object = {}) =>
      this.prisma.auditLog
        .create({ data: { userId: user?.id, branchId: user?.branchId, action, entity: 'auth', entityId: user?.id, after: { phone, ...extra }, ip } })
        .catch(() => undefined);
    if (!user || !user.isActive) {
      this.noteFailure(phone, ip);
      await log('LOGIN_FAILED', { reason: user ? 'inactive' : 'unknown_phone' });
      throw new UnauthorizedException('Invalid phone or password');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await log('LOGIN_FAILED', { reason: 'locked' });
      throw Errors.forbidden('Account locked, try again later');
    }
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) {
      this.noteFailure(phone, ip);
      // atomic increment (isku day isku mar ah si sax ah ayaa loo tiriyaa)
      const { failedLogins: failed } = await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: { increment: 1 } } });
      if (failed >= MAX_FAILED) {
        await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: new Date(Date.now() + WINDOW_MS) } });
      }
      await log('LOGIN_FAILED', { reason: 'wrong_password', attempt: failed });
      throw new UnauthorizedException('Invalid phone or password');
    }
    this.attempts.delete(`${phone}|${ip ?? '-'}`);
    await log('LOGIN');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    return this.issueTokens(user);
  }

  /** Refresh token rotation: kii hore waa la burinayaa, mid cusub ayaa la bixinayaa. */
  async refresh(token: string | undefined) {
    if (!token) throw new UnauthorizedException('Missing refresh token');
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!row || row.revokedAt || row.expiresAt < new Date() || !row.user.isActive) {
      // Token la isticmaalay oo dib loo isticmaalay = suurtagal xatooyo → dhammaan xir
      if (row?.revokedAt) await this.revokeAll(row.userId);
      throw new UnauthorizedException('Invalid refresh token');
    }
    // Atomic: laba refresh isku mar oo isku token ah → hal kaliya ayaa guulaysta (kan kale = dib-u-isticmaal)
    const used = await this.prisma.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (used.count !== 1) {
      await this.revokeAll(row.userId);
      throw new UnauthorizedException('Invalid refresh token');
    }
    return this.issueTokens(row.user);
  }

  async logout(token: string | undefined) {
    if (!token) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Ka saar qalab kasta: refresh tokens + access tokens (tokenVersion kor u kac). */
  async revokeAll(userId: string) {
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } }),
    ]);
    this.status.invalidate(userId);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { branch: true } });
    return AuthService.publicUser(user);
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, current))) throw Errors.bad('WRONG_PASSWORD', 'Current password is wrong');
    if (await argon2.verify(user.passwordHash, next)) throw Errors.bad('SAME_PASSWORD', 'New password must be different');
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await AuthService.hashPassword(next), mustChangePassword: false },
    });
    // qalab kasta oo kale waa laga saarayaa; kan hadda wuxuu helayaa tokens cusub
    await this.revokeAll(userId);
    return this.issueTokens(await this.prisma.user.findUniqueOrThrow({ where: { id: userId } }));
  }

  static publicUser(u: User & { branch?: unknown }) {
    const { passwordHash: _p, failedLogins: _f, lockedUntil: _l, ...rest } = u;
    return rest;
  }

  private async issueTokens(user: User) {
    const accessToken = await this.jwt.signAsync(
      // role/branch token-ka laguma kalsoona — guard-ku DB-ga ayuu ka akhriyaa
      { sub: user.id, tv: user.tokenVersion, name: user.name, role: user.role, branchId: user.branchId },
      { secret: this.config.getOrThrow('JWT_ACCESS_SECRET'), expiresIn: this.config.get('JWT_ACCESS_TTL', '15m'), algorithm: 'HS256' },
    );
    const refreshToken = randomBytes(48).toString('base64url');
    const days = Number(this.config.get('JWT_REFRESH_TTL_DAYS', 7));
    const expiresAt = new Date(Date.now() + days * 86400_000);
    await this.prisma.refreshToken.create({ data: { userId: user.id, tokenHash: sha256(refreshToken), expiresAt } });
    return {
      accessToken,
      refreshToken,
      refreshExpiresAt: expiresAt,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        branchId: user.branchId,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }
}
