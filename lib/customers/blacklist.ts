import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type BlacklistEntry = { profileId: string; name: string; email: string | null; phone: string | null; note: string | null }
export type BlacklistHit = BlacklistEntry & { via: 'account' | 'email' | 'phone' }

/** Last nine digits of a phone number – the same number written with or without the prefix. */
export function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits.length >= 6 ? digits.slice(-9) : null
}

/**
 * Which blacklisted customers a booking matches: the same account, or another account
 * with the same e-mail or phone (a problematic customer booking under a new account).
 */
export function matchBlacklist(entries: BlacklistEntry[], who: { customerId?: string | null; email?: string | null; phone?: string | null }): BlacklistHit[] {
  const email = who.email?.trim().toLowerCase() || null
  const phone = phoneKey(who.phone)
  const hits: BlacklistHit[] = []
  for (const entry of entries) {
    if (who.customerId && entry.profileId === who.customerId) hits.push({ ...entry, via: 'account' })
    else if (email && entry.email?.toLowerCase() === email) hits.push({ ...entry, via: 'email' })
    else if (phone && phoneKey(entry.phone) === phone) hits.push({ ...entry, via: 'phone' })
  }
  return hits
}

/** All blacklisted customers (a short list). Needs a staff session or the service role. */
export async function loadBlacklist(supabase: SupabaseClient<Database>): Promise<BlacklistEntry[]> {
  const { data } = await supabase.from('customer_internal').select('profile_id, blacklist_note, profiles(first_name, last_name, email, phone)').eq('is_blacklisted', true)
  return (data ?? []).map((row) => ({
    profileId: row.profile_id,
    name: `${row.profiles?.first_name ?? ''} ${row.profiles?.last_name ?? ''}`.trim(),
    email: row.profiles?.email ?? null,
    phone: row.profiles?.phone ?? null,
    note: row.blacklist_note,
  }))
}
