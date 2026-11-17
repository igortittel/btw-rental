import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { accessoriesOf, cleanlinessOf, latestSigned, loadProtocols, type LoadedProtocol } from '@/lib/protocol/load'
import { CLEANLINESS_LABEL, DAMAGE_KIND_LABEL, DAMAGE_VIEW_LABEL, missingAccessories } from '@/lib/protocol/model'
import { proposeSettlement, type DamageItem, type SettlementProposal } from '@/lib/settlement'
import { getSettings } from '@/lib/settings'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>
export type SettlementRow = Database['public']['Tables']['settlements']['Row']
export type SettlementContext = {
  booking: Database['public']['Tables']['bookings']['Row'] & { vehicles: { name: string; license_plate: string | null } | null }
  pickup: LoadedProtocol | null
  returned: LoadedProtocol | null
  settlement: SettlementRow | null
  proposal: SettlementProposal | null
  /** New damages of the return protocol, numbered as in the protocol (after the pickup ones). */
  damages: { id: string; no: number; label: string }[]
  /** Things from the protocol that staff may want to charge under "Iné". */
  remarks: string[]
  ratePerDayCents: number | null
}

/** Everything the settlement screen and its action need, read with the caller's rights. */
export async function loadSettlementContext(supabase: Client, bookingId: string): Promise<SettlementContext | null> {
  const [{ data: booking }, protocols, { data: settlement }, settings] = await Promise.all([
    supabase.from('bookings').select('*, vehicles(name, license_plate)').eq('id', bookingId).maybeSingle(),
    loadProtocols(supabase, bookingId),
    supabase.from('settlements').select('*').eq('booking_id', bookingId).maybeSingle(),
    getSettings(supabase),
  ])
  if (!booking) return null
  const pickup = latestSigned(protocols, 'pickup')
  const returned = latestSigned(protocols, 'return')
  const ratePerDayCents = ((booking.price_snapshot ?? {}) as { ratePerDayCents?: number | null }).ratePerDayCents ?? null

  const proposal = returned
    ? proposeSettlement({
        pickupOdometerKm: pickup?.odometer_km ?? null,
        returnOdometerKm: returned.odometer_km,
        pickupFuel: pickup?.fuel_level ?? null,
        returnFuel: returned.fuel_level,
        days: booking.days,
        kmLimitPerDay: booking.km_limit_per_day,
        extraKmCents: booking.extra_km_cents,
        pickupAt: new Date(booking.pickup_at),
        plannedReturnAt: new Date(booking.return_at),
        actualReturnAt: returned.handover_at ? new Date(returned.handover_at) : null,
        toleranceMinutes: settings.return_tolerance_minutes,
        ratePerDayCents,
      })
    : null

  const offset = pickup?.damages.length ?? 0
  const damages = (returned?.damages ?? []).map((damage, index) => ({
    id: damage.id,
    no: offset + index + 1,
    label: [DAMAGE_KIND_LABEL[damage.kind] ?? damage.kind, DAMAGE_VIEW_LABEL[damage.view], damage.description].filter(Boolean).join(' · '),
  }))

  const remarks: string[] = []
  if (returned && pickup) {
    for (const item of missingAccessories(accessoriesOf(pickup), accessoriesOf(returned))) remarks.push(`nevrátené: ${item}`)
  }
  if (returned) {
    const clean = cleanlinessOf(returned)
    if (clean.interior !== 'clean') remarks.push(`interiér: ${CLEANLINESS_LABEL[clean.interior].toLowerCase()}`)
    if (clean.exterior !== 'clean') remarks.push(`exteriér: ${CLEANLINESS_LABEL[clean.exterior].toLowerCase()}`)
  }

  return { booking, pickup, returned, settlement, proposal, damages, remarks, ratePerDayCents }
}

export type { DamageItem }
