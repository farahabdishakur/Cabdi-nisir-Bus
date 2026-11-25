import type { SessionUser } from './api';

/**
 * UI kaliya: qari badhamada/bogagga aan qofka khusayn. Amniga dhabta ah waa backend-ka (CLAUDE.md §3.2).
 */
export type Action =
  | 'sell'
  | 'manageTrips'
  | 'void'
  | 'discount'
  | 'reports'
  | 'admin'
  | 'adminStaff'
  | 'approveCash'
  | 'reconcileZaad'
  | 'markParcel'
  | 'confirmDeposit'
  | 'integrity';

const MANAGER = new Set<Action>(['sell', 'manageTrips', 'void', 'discount', 'reports', 'adminStaff', 'approveCash', 'reconcileZaad', 'markParcel', 'integrity']);
const CASHIER = new Set<Action>(['sell']);

export function can(user: SessionUser | null, action: Action): boolean {
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role === 'BRANCH_MANAGER') return MANAGER.has(action);
  if (user.role === 'CASHIER') return CASHIER.has(action);
  return false;
}

export const isManager = (u: SessionUser | null) => u?.role === 'SUPER_ADMIN' || u?.role === 'BRANCH_MANAGER';
export const isSuperAdmin = (u: SessionUser | null) => u?.role === 'SUPER_ADMIN';
