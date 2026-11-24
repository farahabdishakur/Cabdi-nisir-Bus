import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from './auth-user';

export const ROLES_KEY = 'roles';
export const IS_PUBLIC_KEY = 'isPublic';

/** Kaliya role-yadan ayaa wici kara endpoint-ka. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Endpoint aan login u baahnayn. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

/** Shaqaalaha laamaha (aan ahayn darawal). */
export const STAFF: Role[] = [Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.CASHIER];
export const MANAGERS: Role[] = [Role.SUPER_ADMIN, Role.BRANCH_MANAGER];
