import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { Errors } from '../common/errors';

interface AccessPayload {
  sub: string;
  name: string;
  role: Role;
  branchId: string | null;
}

/** Global guard: hubiya JWT-ga, kadibna role-ka (@Roles). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    const user: AuthUser = { id: payload.sub, name: payload.name, role: payload.role, branchId: payload.branchId };
    req.user = user;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (roles && !roles.includes(user.role)) throw Errors.forbidden('Your role cannot perform this action');
    return true;
  }
}
