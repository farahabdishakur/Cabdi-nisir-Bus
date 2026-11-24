import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { AppError, Errors } from '../common/errors';
import { UserStatusCache } from './user-status.cache';

interface AccessPayload {
  sub: string;
  tv: number;
}

/** Inta password-ka la beddelayo, kaliya kuwan ayaa la oggol yahay. */
const PASSWORD_CHANGE_ALLOWED = ['/api/v1/auth/me', '/api/v1/auth/change-password', '/api/v1/auth/logout', '/api/v1/auth/logout-all'];

/**
 * Global guard:
 * 1. JWT sax ah
 * 2. User weli firfircoon + tokenVersion la mid (deactivate / role / password → isla markiiba dhac)
 * 3. Password ku-meel-gaar ah → waa in la beddelaa ka hor shaqo kale
 * 4. Role (@Roles) — laga akhriyo DB-ga (ma aha token-ka), sidaa darteed beddelku isla markiiba wuu dhaqan galaa
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly status: UserStatusCache,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Missing token');
    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(header.slice(7), {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    const s = await this.status.get(payload.sub);
    if (!s || !s.isActive || s.tokenVersion !== payload.tv) {
      throw new AppError('SESSION_REVOKED', 'Session ended, please log in again', 401);
    }
    const user: AuthUser = { id: s.id, name: s.name, role: s.role, branchId: s.branchId };
    req.user = user;

    if (s.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.includes(req.path)) {
      throw new AppError('PASSWORD_CHANGE_REQUIRED', 'Change your temporary password first', 403);
    }

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (roles && !roles.includes(user.role)) throw Errors.forbidden('Your role cannot perform this action');
    return true;
  }
}
