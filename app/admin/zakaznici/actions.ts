'use server'

import { revalidatePath } from 'next/cache'
import { checkbox, dbErrorMessage, staffAction, text, type ActionState } from '@/lib/admin/action'
import { sendPasswordLink } from '@/lib/auth/password-links'
import { ERASE_CONFIRMATION } from '@/lib/customers/list'
import { isValidIban, normalizeIban } from '@/lib/iban'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID = /^[0-9a-f-]{36}$/i

type Result = ActionState & { redirectTo?: string }

function refresh(id: string) {
  revalidatePath(`/admin/zakaznici/${id}`)
  revalidatePath('/admin/zakaznici')
  revalidatePath('/admin')
}

function profileId(formData: FormData): string | null {
  const id = text(formData, 'id')
  return UUID.test(id) ? id : null
}

/** Staff-only note about the customer (customer_internal; the customer never reads it). */
export async function saveCustomerNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase, userId }) => {
    const id = profileId(formData)
    if (!id) return { error: 'Zákazník sa nenašiel.' }
    const note = text(formData, 'note').slice(0, 4000) || null
    const { error } = await supabase.from('customer_internal').upsert({ profile_id: id, internal_note: note, updated_by: userId }, { onConflict: 'profile_id' })
    if (error) return { error: dbErrorMessage(error) }
    refresh(id)
    return { ok: true, message: 'Poznámka uložená.' }
  })
}

/** Blacklist flag with a mandatory reason; staff see a warning at the customer's next booking. */
export async function saveBlacklistAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase, userId }) => {
    const id = profileId(formData)
    if (!id) return { error: 'Zákazník sa nenašiel.' }
    const on = checkbox(formData, 'blacklisted')
    const note = text(formData, 'reason').slice(0, 1000)
    if (on && !note) return { error: 'Napíšte dôvod – zobrazí sa kolegom pri ďalšej rezervácii.' }
    const { error } = await supabase
      .from('customer_internal')
      .upsert({ profile_id: id, is_blacklisted: on, blacklist_note: on ? note : null, updated_by: userId }, { onConflict: 'profile_id' })
    if (error) return { error: dbErrorMessage(error) }
    refresh(id)
    return { ok: true, message: on ? 'Zákazník je na blackliste.' : 'Zákazník odstránený z blacklistu.' }
  })
}

/** Account for returning the deposit (the customer can set it in their profile too). */
export async function saveRefundIbanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const id = profileId(formData)
    if (!id) return { error: 'Zákazník sa nenašiel.' }
    const iban = normalizeIban(text(formData, 'iban'))
    if (iban && !isValidIban(iban)) return { error: 'IBAN nie je platný.' }
    const { error } = await supabase.from('profiles').update({ refund_iban: iban || null }).eq('id', id).eq('type', 'customer')
    if (error) return { error: dbErrorMessage(error) }
    refresh(id)
    return { ok: true, message: 'Účet na vrátenie depozitu uložený.' }
  })
}

/** E-mails the customer a one-time link to set a new password (72 h / 2 h like every other link). */
export async function sendCustomerPasswordLinkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase, userId }) => {
    const id = profileId(formData)
    if (!id) return { error: 'Zákazník sa nenašiel.' }
    const { data: profile } = await supabase.from('profiles').select('email, locale, password_set, anonymized_at, type').eq('id', id).maybeSingle()
    if (!profile || profile.type !== 'customer' || profile.anonymized_at || !profile.email) return { error: 'Zákazník nemá e-mail, odkaz sa nedá poslať.' }
    const result = await sendPasswordLink({
      profileId: id,
      email: profile.email,
      locale: profile.locale,
      purpose: profile.password_set ? 'reset_password' : 'set_password',
      createdBy: userId,
      next: profile.locale === 'en' ? '/en/moj-ucet' : '/moj-ucet',
    })
    return result.emailSent
      ? { ok: true, message: `Odkaz na nastavenie hesla bol odoslaný na ${profile.email}.` }
      : { ok: true, message: 'E-mail sa nepodarilo odoslať. Odovzdajte zákazníkovi tento jednorazový odkaz:', link: result.link }
  })
}

/** Closes a deletion request without erasing (e.g. the customer withdrew it). Recorded in the audit log. */
export async function declineDeletionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const id = profileId(formData)
    if (!id) return { error: 'Zákazník sa nenašiel.' }
    const { error } = await supabase.from('profiles').update({ deletion_requested_at: null }).eq('id', id)
    if (error) return { error: dbErrorMessage(error) }
    refresh(id)
    return { ok: true, message: 'Žiadosť o vymazanie je uzavretá bez vymazania.' }
  })
}

/**
 * GDPR erasure. The database removes or anonymises the personal data in one transaction
 * (anonymize_customer, manager+), then the sign-in account is deleted with the service
 * role. Repeating the action finishes a half-done erasure (e.g. if Auth was unavailable).
 */
export async function eraseCustomerAction(_prev: Result, formData: FormData): Promise<Result> {
  return staffAction('manager', async ({ supabase }) => {
    const id = profileId(formData)
    if (!id) return { error: 'Zákazník sa nenašiel.' }
    if (text(formData, 'confirm').toUpperCase() !== ERASE_CONFIRMATION) return { error: `Pre potvrdenie napíšte ${ERASE_CONFIRMATION}.` }

    const { data: outcome, error } = await supabase.rpc('anonymize_customer', { p_profile_id: id })
    if (error) {
      if (error.message.includes('customer_has_open_bookings')) return { error: 'Zákazník má novú, potvrdenú alebo prebiehajúcu rezerváciu. Vymazať ho možno až po jej ukončení alebo zrušení.' }
      if (error.message.includes('not_a_customer')) return { error: 'Toto nie je zákaznícky účet.' }
      return { error: dbErrorMessage(error) }
    }

    const { error: authError } = await createAdminClient().auth.admin.deleteUser(id)
    if (authError && authError.status !== 404) {
      console.error('auth user delete failed', authError.message)
      refresh(id)
      return { error: 'Osobné údaje sú odstránené, ale prihlasovací účet sa nepodarilo zrušiť. Skúste akciu zopakovať.' }
    }
    refresh(id)
    if (outcome === 'deleted') return { ok: true, message: 'Zákazník bez rezervácií bol úplne vymazaný.', redirectTo: '/admin/zakaznici' }
    return { ok: true, message: 'Zákazník je anonymizovaný a prihlasovací účet zrušený. Rezervácie a doklady ostali zachované.' }
  })
}
