import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasRole, type StaffRole } from '@/lib/auth/roles'

export type SessionUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  locale: string
  /** Active staff role, or null for customers and deactivated staff. */
  role: StaffRole | null
}

/**
 * The signed-in user with their role, verified against Supabase Auth (not just the
 * cookie) and read from the database (never from user-editable JWT metadata).
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: profile }, { data: staff }] = await Promise.all([
    supabase.from('profiles').select('first_name, last_name, locale, anonymized_at').eq('id', user.id).maybeSingle(),
    supabase.from('staff_roles').select('role, is_active').eq('user_id', user.id).maybeSingle(),
  ])
  if (!profile || profile.anonymized_at) return null

  return {
    id: user.id,
    email: user.email ?? '',
    firstName: profile.first_name,
    lastName: profile.last_name,
    locale: profile.locale,
    role: staff?.is_active ? staff.role : null,
  }
})

export async function requireUser(nextPath: string): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect(`/prihlasenie?next=${encodeURIComponent(nextPath)}`)
  return user
}

/** For admin pages: signed in AND an active staff member with at least `min`. */
export async function requireStaff(min: StaffRole = 'operator', nextPath = '/admin'): Promise<SessionUser & { role: StaffRole }> {
  const user = await requireUser(nextPath)
  if (!user.role) redirect('/moj-ucet')
  if (!hasRole(user.role, min)) redirect('/admin?chyba=opravnenie')
  return user as SessionUser & { role: StaffRole }
}

/** For server actions: returns null instead of redirecting. */
export async function getStaff(min: StaffRole = 'operator') {
  const user = await getSessionUser()
  if (!user || !hasRole(user.role, min)) return null
  return user as SessionUser & { role: StaffRole }
}
