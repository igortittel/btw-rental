import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/** Word the staff member types to confirm a GDPR erasure. */
export const ERASE_CONFIRMATION = 'ANONYMIZOVAŤ'

export const CUSTOMER_FILTERS = { vsetci: 'Všetci', blacklist: 'Blacklist', vymazanie: 'Žiadosť o vymazanie', anonymizovani: 'Anonymizovaní' } as const
export type CustomerFilter = keyof typeof CUSTOMER_FILTERS
export type CustomerQuery = { filter: CustomerFilter; q: string | null }

export function parseCustomerQuery(query: Record<string, string | undefined>): CustomerQuery {
  const filter = query.filter && query.filter in CUSTOMER_FILTERS ? (query.filter as CustomerFilter) : 'vsetci'
  const q = query.q?.trim().slice(0, 100) || null
  return { filter, q }
}

export function customerQueryParams(query: CustomerQuery, override: Partial<CustomerQuery> = {}): URLSearchParams {
  const merged = { ...query, ...override }
  const params = new URLSearchParams()
  if (merged.filter !== 'vsetci') params.set('filter', merged.filter)
  if (merged.q) params.set('q', merged.q)
  return params
}

/** Customers (view admin_customers, staff only) matching a filter and a search over name, e-mail, phone, company and IČO. */
export function customerListQuery(supabase: SupabaseClient<Database>, query: CustomerQuery, limit: number) {
  let request = supabase.from('admin_customers').select('*').order('last_pickup_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(limit)
  if (query.filter === 'blacklist') request = request.eq('is_blacklisted', true)
  else if (query.filter === 'vymazanie') request = request.not('deletion_requested_at', 'is', null).is('anonymized_at', null)
  else if (query.filter === 'anonymizovani') request = request.not('anonymized_at', 'is', null)
  else request = request.is('anonymized_at', null)
  if (query.q) {
    // Characters with a meaning in PostgREST filters or LIKE patterns are dropped.
    const term = query.q.replace(/[,()%_*\\"']/g, ' ').trim()
    if (term) {
      const like = `%${term.replace(/\s+/g, '%')}%`
      request = request.or(['first_name', 'last_name', 'email', 'phone', 'company_name', 'ico'].map((column) => `${column}.ilike.${like}`).join(','))
    }
  }
  return request
}
