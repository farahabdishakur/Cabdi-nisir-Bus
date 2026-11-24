import { AuthUser, isSuperAdmin } from './auth-user';
import { Errors } from './errors';

/**
 * Branch scoping (CLAUDE.md §3.3): shaqaale kasta wuxuu arkaa laantiisa oo keliya.
 * Super Admin kaliya ayaa ka badbaada.
 */
export function assertBranch(user: AuthUser, branchId: string | null | undefined) {
  if (isSuperAdmin(user)) return;
  if (!user.branchId || user.branchId !== branchId) throw Errors.forbiddenBranch();
}

/** Laanta user-ku u shaqaynayo; Super Admin waa inuu cayimaa (branchId param). */
export function effectiveBranch(user: AuthUser, requested?: string): string {
  if (isSuperAdmin(user)) {
    if (!requested) throw Errors.bad('BRANCH_REQUIRED', 'Super admin must specify branchId');
    return requested;
  }
  if (requested && requested !== user.branchId) throw Errors.forbiddenBranch();
  return user.branchId!;
}

/** Filter-ka liisaska: Super Admin → wixii la codsaday ama dhammaan; kuwa kale → laantooda. */
export function branchFilter(user: AuthUser, requested?: string): string | undefined {
  if (isSuperAdmin(user)) return requested;
  if (requested && requested !== user.branchId) throw Errors.forbiddenBranch();
  return user.branchId!;
}
