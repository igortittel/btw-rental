import type { Database } from '@/types/database'

export type StaffRole = Database['public']['Enums']['staff_role']

const RANK: Record<StaffRole, number> = { operator: 1, manager: 2, owner: 3 }

export const STAFF_ROLES: StaffRole[] = ['operator', 'manager', 'owner']

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  owner: 'Majiteľ',
  manager: 'Manažér',
  operator: 'Operátor',
}

/** TRUE when `role` is at least `min` (operator < manager < owner). */
export function hasRole(role: StaffRole | null | undefined, min: StaffRole): boolean {
  return !!role && RANK[role] >= RANK[min]
}

/** Only same-origin relative paths are allowed as post-login redirect targets. */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\') || next.includes('://')) {
    return fallback
  }
  return next
}
