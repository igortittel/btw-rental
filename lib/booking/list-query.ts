import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BookingStatus } from '@/lib/booking-status'
import { zonedLocalToUtc } from '@/lib/time'
import type { Database } from '@/types/database'

export const BOOKING_STATUSES: BookingStatus[] = ['new', 'confirmed', 'modified', 'active', 'completed', 'cancelled']
const DATE = /^\d{4}-\d{2}-\d{2}$/

export type BookingFilters = { status: BookingStatus | null; vehicleId: string | null; from: string | null; to: string | null; q: string | null }

export function parseBookingFilters(query: Record<string, string | undefined>): BookingFilters {
  const q = (query.q ?? '').trim().slice(0, 80)
  return {
    status: BOOKING_STATUSES.includes(query.stav as BookingStatus) ? (query.stav as BookingStatus) : null,
    vehicleId: /^[0-9a-f-]{36}$/i.test(query.vozidlo ?? '') ? query.vozidlo! : null,
    from: DATE.test(query.od ?? '') ? query.od! : null,
    to: DATE.test(query.do ?? '') ? query.do! : null,
    q: q || null,
  }
}

export function bookingFilterParams(filters: BookingFilters, override: Partial<Record<'stav', string | null>> = {}): URLSearchParams {
  const params = new URLSearchParams()
  const status = override.stav === undefined ? filters.status : override.stav
  if (status) params.set('stav', status)
  if (filters.vehicleId) params.set('vozidlo', filters.vehicleId)
  if (filters.from) params.set('od', filters.from)
  if (filters.to) params.set('do', filters.to)
  if (filters.q) params.set('q', filters.q)
  return params
}

export const BOOKING_LIST_COLUMNS =
  'id, number, status, pickup_at, return_at, days, total_cents, pickup_custom_address, return_custom_address, outside:price_snapshot->delivery_outside_city, customer_id, customer_snapshot, rental_payment_method, deposit_payment_method, rental_payment_status, deposit_status, deposit_cents, rental_paid_cents, rental_refunded_cents, deposit_received_cents, created_at, vehicles(name, license_plate)' as const

/** Bookings matching the filters. The date range matches bookings that overlap it; the search covers number, name, email, phone and company. */
export function bookingListQuery(supabase: SupabaseClient<Database>, filters: BookingFilters, limit: number) {
  let request = supabase.from('bookings').select(BOOKING_LIST_COLUMNS).order('pickup_at', { ascending: true }).limit(limit)
  if (filters.status) request = request.eq('status', filters.status)
  if (filters.vehicleId) request = request.eq('vehicle_id', filters.vehicleId)
  if (filters.from) request = request.gte('return_at', zonedLocalToUtc(`${filters.from}T00:00`)!.toISOString())
  if (filters.to) request = request.lte('pickup_at', zonedLocalToUtc(`${filters.to}T23:59`)!.toISOString())
  if (filters.q) {
    // Characters with a meaning in PostgREST filters or LIKE patterns are dropped.
    const term = filters.q.replace(/[,()%_*\\"']/g, ' ').trim()
    if (term) {
      const like = `%${term.replace(/\s+/g, '%')}%`
      request = request.or(
        ['number', 'customer_snapshot->>first_name', 'customer_snapshot->>last_name', 'customer_snapshot->>email', 'customer_snapshot->>phone', 'customer_snapshot->>company_name'].map((column) => `${column}.ilike.${like}`).join(','),
      )
    }
  }
  return request
}
