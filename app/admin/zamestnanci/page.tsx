import type { Metadata } from 'next'
import { InviteStaffForm, StaffRowActions } from '@/components/admin/staff-forms'
import { STAFF_ROLE_LABELS } from '@/lib/auth/roles'
import { requireStaff } from '@/lib/auth/session'
import { ResetMfaButton } from '@/components/admin/reset-mfa-button'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Zamestnanci' }

export default async function StaffPage() {
  const owner = await requireStaff('owner', '/admin/zamestnanci')
  const supabase = await createClient()
  const { data: staff } = await supabase
    .from('staff_roles')
    .select('user_id, role, is_active, created_at, profiles!staff_roles_user_id_fkey(first_name, last_name, email, password_set)')
    .order('created_at')

  // 2FA status of each staff member (Auth admin API; the list is short).
  const mfa = new Map<string, boolean>()
  try {
    const admin = createAdminClient()
    await Promise.all(
      (staff ?? []).map(async (member) => {
        const { data } = await admin.auth.admin.mfa.listFactors({ userId: member.user_id })
        mfa.set(member.user_id, (data?.factors ?? []).some((f) => f.status === 'verified'))
      }),
    )
  } catch {
    // Without the service key (local development) the status is simply not shown.
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold tracking-wide text-white">Zamestnanci</h1>

      <section className="rounded-xl border border-gold/50 bg-surface p-6">
        <h2 className="mb-2 text-lg font-bold text-white">Pozvať zamestnanca</h2>
        <p className="mb-6 text-sm text-muted2">
          Zamestnanec dostane e-mailom jednorazový odkaz na nastavenie hesla (platí 72 hodín). Heslo sa e-mailom neposiela.
        </p>
        <InviteStaffForm />
      </section>

      <ul className="space-y-4">
        {(staff ?? []).map((member) => {
          const profile = member.profiles
          const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || '—'
          return (
            <li key={member.user_id} className="rounded-xl border border-line bg-surface p-6">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <div>
                  <p className="font-semibold text-white">{name}</p>
                  <p className="break-all text-sm text-muted2">{profile?.email}</p>
                </div>
                <p className="text-sm text-muted2">
                  {STAFF_ROLE_LABELS[member.role]} · {member.is_active ? 'aktívny' : 'deaktivovaný'}
                  {profile?.password_set ? '' : ' · heslo ešte nenastavené'}
                  {mfa.has(member.user_id) ? (mfa.get(member.user_id) ? ' · 2FA zapnuté' : ' · 2FA zatiaľ nenastavené') : ''}
                </p>
              </div>
              <StaffRowActions
                userId={member.user_id}
                role={member.role}
                isActive={member.is_active}
                isSelf={member.user_id === owner.id}
                passwordSet={profile?.password_set ?? false}
              />
              {member.user_id !== owner.id && mfa.get(member.user_id) ? (
                <div className="mt-3 border-t border-line pt-3">
                  <ResetMfaButton userId={member.user_id} name={name} />
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
