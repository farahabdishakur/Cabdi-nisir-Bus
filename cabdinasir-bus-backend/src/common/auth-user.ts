import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  branchId: string | null;
}

export const isSuperAdmin = (u: AuthUser) => u.role === Role.SUPER_ADMIN;
export const isManagerOrAbove = (u: AuthUser) => u.role === Role.SUPER_ADMIN || u.role === Role.BRANCH_MANAGER;
