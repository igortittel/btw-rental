import { countRentalDays } from '@/lib/pricing'

export type SettlementInput = {
  pickupOdometerKm: number | null
  returnOdometerKm: number | null
  pickupFuel: number | null
  returnFuel: number | null
  days: number
  kmLimitPerDay: number
  extraKmCents: number
  pickupAt: Date
  plannedReturnAt: Date
  actualReturnAt: Date | null
  toleranceMinutes: number
  /** Daily rate agreed in the booking; null for an individually priced rental. */
  ratePerDayCents: number | null
}

export type SettlementProposal = {
  kmDriven: number | null
  kmLimit: number
  extraKm: number
  extraKmCents: number
  /** Percent points, return − pickup. Negative = fuel is missing. Informational: staff enter the amount. */
  fuelDiff: number | null
  lateMinutes: number
  /** Extra rental days started by the late return (after the tolerance). */
  lateDays: number
  lateCents: number
}

/**
 * Proposal of extra charges after the return protocol. Pure; staff may change every amount.
 *
 * - km over the limit: (km_end − km_start) − limit × days, × price per km
 * - late return: every rental day started beyond the booked ones (same day counting and
 *   tolerance as the price of the rental) × the daily rate of the booking
 */
export function proposeSettlement(input: SettlementInput): SettlementProposal {
  const kmLimit = input.kmLimitPerDay * input.days
  const kmDriven = input.pickupOdometerKm !== null && input.returnOdometerKm !== null ? input.returnOdometerKm - input.pickupOdometerKm : null
  const extraKm = kmDriven === null ? 0 : Math.max(0, kmDriven - kmLimit)

  let lateMinutes = 0
  let lateDays = 0
  if (input.actualReturnAt) {
    lateMinutes = Math.max(0, Math.round((input.actualReturnAt.getTime() - input.plannedReturnAt.getTime()) / 60000))
    if (lateMinutes > input.toleranceMinutes) {
      const booked = countRentalDays(input.pickupAt, input.plannedReturnAt, input.toleranceMinutes)
      lateDays = Math.max(0, countRentalDays(input.pickupAt, input.actualReturnAt, input.toleranceMinutes) - booked)
    }
  }

  return {
    kmDriven,
    kmLimit,
    extraKm,
    extraKmCents: extraKm * input.extraKmCents,
    fuelDiff: input.pickupFuel !== null && input.returnFuel !== null ? input.returnFuel - input.pickupFuel : null,
    lateMinutes,
    lateDays,
    lateCents: lateDays * (input.ratePerDayCents ?? 0),
  }
}

/** "1 h 40 min", "25 min", "2 d 3 h". */
export function formatDuration(minutes: number): string {
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  return [d ? `${d} d` : '', h ? `${h} h` : '', m || (!d && !h) ? `${m} min` : ''].filter(Boolean).join(' ')
}

export type SettlementTotals = { extraKmCents: number; fuelCents: number; damageCents: number; lateCents: number; otherCents: number }
export function settlementTotal(s: SettlementTotals): number {
  return s.extraKmCents + s.fuelCents + s.damageCents + s.lateCents + s.otherCents
}

/** What happens with the deposit: the part to give back, and anything owed beyond it. */
export function depositOutcome(depositCents: number, totalCents: number): { refundCents: number; dueCents: number } {
  return { refundCents: Math.max(0, depositCents - totalCents), dueCents: Math.max(0, totalCents - depositCents) }
}

export type DamageItem = { damage_id: string; label: string; cents: number }

type SettlementLike = {
  km_driven: number | null
  extra_km: number
  extra_km_cents: number
  fuel_diff: number | null
  fuel_cents: number
  damage_cents: number
  damage_items: unknown
  late_minutes: number
  late_cents: number
  other_cents: number
  other_label: string | null
}

const LINE_COPY = {
  sk: { km: 'Kilometre nad limit', fuel: 'Palivo', damage: 'Poškodenie', damages: 'Poškodenia', late: 'Meškanie pri vrátení', other: 'Iné' },
  en: { km: 'Mileage over the limit', fuel: 'Fuel', damage: 'Damage', damages: 'Damage', late: 'Late return', other: 'Other' },
}

export function damageItemsOf(value: unknown): DamageItem[] {
  return Array.isArray(value) ? (value as DamageItem[]).filter((item) => item && typeof item.cents === 'number') : []
}

/** Charged items of a settlement for display (customer area, email); zero items are left out. */
export function settlementLines(row: SettlementLike, locale: 'sk' | 'en' = 'sk'): { label: string; detail?: string; cents: number }[] {
  const c = LINE_COPY[locale]
  const lines: { label: string; detail?: string; cents: number }[] = []
  if (row.extra_km_cents > 0) lines.push({ label: c.km, detail: `${row.extra_km} km`, cents: row.extra_km_cents })
  if (row.fuel_cents > 0) lines.push({ label: c.fuel, cents: row.fuel_cents })
  const items = damageItemsOf(row.damage_items).filter((item) => item.cents > 0)
  if (items.length > 0) for (const item of items) lines.push({ label: c.damage, detail: item.label, cents: item.cents })
  else if (row.damage_cents > 0) lines.push({ label: c.damages, cents: row.damage_cents })
  if (row.late_cents > 0) lines.push({ label: c.late, detail: row.late_minutes > 0 ? formatDuration(row.late_minutes) : undefined, cents: row.late_cents })
  if (row.other_cents > 0) lines.push({ label: row.other_label || c.other, cents: row.other_cents })
  return lines
}
