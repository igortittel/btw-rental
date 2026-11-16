import 'server-only'
import { revalidateTag } from 'next/cache'
import type { PostgrestError } from '@supabase/supabase-js'
import type { StaffRole } from '@/lib/auth/roles'
import { getStaff } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

export type ActionState = { error?: string; ok?: boolean; message?: string; link?: string }

/** Human-readable Slovak message for the Postgres errors an admin can realistically trigger. */
export function dbErrorMessage(error: PostgrestError | { code?: string; message: string }): string {
  switch (error.code) {
    case '23505':
      return 'Takýto záznam už existuje (duplicitná hodnota).'
    case '23503':
      return 'Záznam sa nedá zmazať ani zmeniť, pretože ho používajú iné údaje (napr. rezervácie).'
    case '23514':
      return 'Niektorá hodnota je mimo povoleného rozsahu.'
    case '23P01':
      return 'Termín sa prekrýva s existujúcou blokáciou alebo potvrdenou rezerváciou.'
    case '42501':
      return 'Na túto akciu nemáte oprávnenie.'
    default:
      console.error('admin action failed', error.code, error.message)
      return 'Akcia sa nepodarila. Skúste to znova.'
  }
}

/**
 * Runs an admin mutation as the signed-in staff member. The role is checked here and
 * again by RLS; the session client makes the audit log record the real actor.
 */
export async function staffAction(
  min: StaffRole,
  run: (ctx: { supabase: Awaited<ReturnType<typeof createClient>>; userId: string; role: StaffRole }) => Promise<ActionState>,
): Promise<ActionState> {
  const staff = await getStaff(min)
  if (!staff) return { error: 'Na túto akciu nemáte oprávnenie.' }
  try {
    const result = await run({ supabase: await createClient(), userId: staff.id, role: staff.role })
    // Anything an admin saves may be visible on the public site: refresh the cached catalogue.
    if (result.ok) revalidateTag('catalog')
    return result
  } catch (e) {
    // redirect() / notFound() work by throwing – let them through.
    if (e && typeof e === 'object' && 'digest' in e) throw e
    console.error('admin action crashed', e)
    return { error: 'Akcia sa nepodarila. Skúste to znova.' }
  }
}

// ── FormData helpers ─────────────────────────────────────────────────────
export function text(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}
export function optionalText(formData: FormData, name: string): string | null {
  return text(formData, name) || null
}
export function checkbox(formData: FormData, name: string): boolean {
  return formData.get(name) === 'on' || formData.get(name) === 'true'
}
/** Integer field: null when empty, NaN when not a whole number. */
export function optionalInt(formData: FormData, name: string): number | null {
  const raw = text(formData, name)
  if (raw === '') return null
  return /^-?\d+$/.test(raw) ? Number(raw) : Number.NaN
}
/** {sk, en} object from `<name>_sk` / `<name>_en` fields, omitting empty languages. */
export function localized(formData: FormData, name: string): { sk?: string; en?: string } {
  const result: { sk?: string; en?: string } = {}
  const sk = text(formData, `${name}_sk`)
  const en = text(formData, `${name}_en`)
  if (sk) result.sk = sk
  if (en) result.en = en
  return result
}
