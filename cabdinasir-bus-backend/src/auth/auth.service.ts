import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Errors } from '../common/errors';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  static hashPassword(password: string) {
    return argon2.hash(password);
  }

  async login(phone: string, password: string, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    const log = (action: string, extra: object = {}) =>
      this.prisma.auditLog
        .create({ data: { userId: user?.id, branchId: user?.branchId, action, entity: 'auth', entityId: user?.id, after: { phone, ...extra }, ip } })
        .catch(() => undefined);
    if (!user || !user.isActive) {
      await log('LOGIN_FAILED', { reason: user ? 'inactive' : 'unknown_phone' });
      throw new UnauthorizedException('Invalid phone or password');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await log('LOGIN_FAILED', { reason: 'locked' });
      throw Errors.forbidden('Account locked, try again later');
    }
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) {
      const failed = user.failedLogins + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: failed >= MAX_FAILED ? 0 : failed,
          lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      await log('LOGIN_FAILED', { reason: 'wrong_password', attempt: failed });
      throw new UnauthorizedException('Invalid phone or password');
    }
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
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    return this.issueTokens(row.user);
  }

  async logout(token: string | undefined) {
    if (!token) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  revokeAll(userId: string) {
    return this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { branch: true } });
    return AuthService.publicUser(user);
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, current))) throw Errors.bad('WRONG_PASSWORD', 'Current password is wrong');
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await AuthService.hashPassword(next), mustChangePassword: false },
    });
    await this.revokeAll(userId);
  }

  static publicUser(u: User & { branch?: unknown }) {
    const { passwordHash: _p, failedLogins: _f, lockedUntil: _l, ...rest } = u;
    return rest;
  }

  private async issueTokens(user: User) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, name: user.name, role: user.role, branchId: user.branchId },
      { secret: this.config.getOrThrow('JWT_ACCESS_SECRET'), expiresIn: this.config.get('JWT_ACCESS_TTL', '15m') },
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
