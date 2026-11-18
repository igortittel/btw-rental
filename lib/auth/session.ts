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
  /** Authenticator assurance level of the session: 'aal2' after the second factor (TOTP). */
  aal: 'aal1' | 'aal2'
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

  const [{ data: profile }, { data: staff }, { data: assurance }] = await Promise.all([
    supabase.from('profiles').select('first_name, last_name, locale, anonymized_at').eq('id', user.id).maybeSingle(),
    supabase.from('staff_roles').select('role, is_active').eq('user_id', user.id).maybeSingle(),
    // Read from the (already verified) session token, no extra request.
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  if (!profile || profile.anonymized_at) return null

  return {
    id: user.id,
    email: user.email ?? '',
    firstName: profile.first_name,
    lastName: profile.last_name,
    locale: profile.locale,
    role: staff?.is_active ? staff.role : null,
    aal: assurance?.currentLevel === 'aal2' ? 'aal2' : 'aal1',
  }
})

export async function requireUser(nextPath: string): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect(`/prihlasenie?next=${encodeURIComponent(nextPath)}`)
  return user
}

/**
 * For admin pages: signed in AND an active staff member with at least `min`.
 * The second factor is enforced by the admin layout, which shows the 2FA step instead of
 * the page while the session is only aal1 (a redirect would loop through the layout).
 */
export async function requireStaff(min: StaffRole = 'operator', nextPath = '/admin'): Promise<SessionUser & { role: StaffRole }> {
  const user = await requireUser(nextPath)
  if (!user.role) redirect('/moj-ucet')
  if (!hasRole(user.role, min)) redirect('/admin?chyba=opravnenie')
  return user as SessionUser & { role: StaffRole }
}

/** For server actions and route handlers: returns null instead of redirecting. Requires the second factor (aal2). */
export async function getStaff(min: StaffRole = 'operator') {
  const user = await getSessionUser()
  if (!user || !hasRole(user.role, min) || user.aal !== 'aal2') return null
  return user as SessionUser & { role: StaffRole }
}
