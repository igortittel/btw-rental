'use server'

import { revalidatePath } from 'next/cache'
import { staffAction, text, type ActionState } from '@/lib/admin/action'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Removes the 2FA factors of another staff member (lost phone). They set up a new one at
 * their next sign-in. Owner only, never for oneself; recorded in the audit log.
 */
export async function resetStaffMfaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('owner', async ({ supabase, userId }) => {
    const target = text(formData, 'userId')
    if (!/^[0-9a-f-]{36}$/i.test(target)) return { error: 'Zamestnanec sa nenašiel.' }
    if (target === userId) return { error: 'Vlastné overenie si zresetovať nemôžete – požiadajte iného majiteľa.' }
    const { data: member } = await supabase.from('staff_roles').select('user_id').eq('user_id', target).maybeSingle()
    if (!member) return { error: 'Zamestnanec sa nenašiel.' }

    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: target })
    if (error) return { error: 'Overenie sa nepodarilo zresetovať.' }
    for (const factor of data.factors) {
      const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: target })
      if (deleteError) return { error: 'Overenie sa nepodarilo zresetovať.' }
    }
    await admin.from('audit_log').insert({ actor_id: userId, entity: 'staff_roles', entity_id: target, action: 'staff.mfa_reset', diff: { factors: data.factors.length } })
    revalidatePath('/admin/zamestnanci')
    return { ok: true, message: 'Dvojstupňové overenie zresetované. Pri ďalšom prihlásení si ho zamestnanec nastaví znova.' }
  })
}
