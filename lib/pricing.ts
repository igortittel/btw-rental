import { TIME_ZONE, utcToZonedLocal } from '@/lib/time'

export type PricingTier = { minDays: number; maxDays: number | null; pricePerDayCents: number | null }
export type PricingExtra = {
  id: string
  name: { sk?: string; en?: string }
  priceCents: number
  pricingType: 'per_day' | 'per_rental'
  maxQuantity: number
  maxChargeCents: number | null
}

export type PriceInput = {
  pickupAt: Date
  returnAt: Date
  tiers: PricingTier[]
  /** Selected extras; unknown IDs and non-positive quantities are ignored, quantities are capped. */
  extras: { extra: PricingExtra; quantity: number }[]
  pickupSurchargeCents: number
  returnSurchargeCents: number
  /** VAT rate in percent (prices already include it). */
  vatRate: number
  /** Late-return tolerance that does not start another day. */
  toleranceMinutes: number
  /** Rentals of this many days or more are priced individually by staff. */
  individualFromDays: number
  timeZone?: string
}

export type PriceExtraLine = {
  extraId: string
  name: { sk?: string; en?: string }
  pricingType: 'per_day' | 'per_rental'
  quantity: number
  unitPriceCents: number
  totalCents: number
  /** TRUE when max_charge capped the line. */
  capped: boolean
}

export type PriceBreakdown = {
  days: number
  /** No rate applies (long rental or a tier without a price): staff sets the price. */
  isIndividual: boolean
  tier: { minDays: number; maxDays: number | null } | null
  ratePerDayCents: number | null
  /** days × rate; null for an individual price. */
  rentalCents: number | null
  extras: PriceExtraLine[]
  extrasCents: number
  pickupSurchargeCents: number
  returnSurchargeCents: number
  /** Everything incl. VAT; null for an individual price. */
  totalCents: number | null
  /** VAT base and VAT contained in totalCents. */
  netCents: number | null
  vatCents: number | null
  vatRate: number
}

const MINUTES_PER_DAY = 24 * 60

/** Wall-clock minutes since the epoch as seen on a clock in the given time zone. */
function wallMinutes(instant: Date, timeZone: string): number {
  return Math.floor(Date.parse(`${utcToZonedLocal(instant, timeZone)}:00Z`) / 60000)
}

/**
 * Number of rental days = started 24-hour blocks counted from pick-up, where returning
 * up to `toleranceMinutes` late does not start another day.
 *
 * Blocks are measured on the local clock (Europe/Bratislava), not in elapsed time:
 * Saturday 10:00 -> Sunday 10:00 is one day even on the night the clocks change, when
 * 23 or 25 real hours pass. Always at least 1.
 */
export function countRentalDays(pickupAt: Date, returnAt: Date, toleranceMinutes = 0, timeZone: string = TIME_ZONE): number {
  const minutes = wallMinutes(returnAt, timeZone) - wallMinutes(pickupAt, timeZone)
  return Math.max(1, Math.ceil((minutes - Math.max(0, toleranceMinutes)) / MINUTES_PER_DAY))
}

/** The tier whose range contains `days`; null when none matches. */
export function findTier<T extends PricingTier>(tiers: T[], days: number): T | null {
  return tiers.find((t) => days >= t.minDays && (t.maxDays === null || days <= t.maxDays)) ?? null
}

/** Splits an amount that includes VAT into base and VAT (rounded to whole cents). */
export function splitVat(grossCents: number, vatRate: number): { netCents: number; vatCents: number } {
  const netCents = Math.round((grossCents * 100) / (100 + vatRate))
  return { netCents, vatCents: grossCents - netCents }
}

/**
 * Price of a rental. Pure: everything it needs comes in through `input`.
 *
 * - The rate of the tier matching the TOTAL length applies to every day.
 * - Extras: per_day × days × quantity, per_rental × quantity; `maxChargeCents` caps the
 *   charge for ONE piece over the whole rental.
 * - All amounts are integer cents including VAT.
 */
export function calculatePrice(input: PriceInput): PriceBreakdown {
  const days = countRentalDays(input.pickupAt, input.returnAt, input.toleranceMinutes, input.timeZone)
  const tier = findTier(input.tiers, days)
  const isIndividual = days >= input.individualFromDays || !tier || tier.pricePerDayCents === null
  const ratePerDayCents = isIndividual ? null : tier!.pricePerDayCents

  const extras: PriceExtraLine[] = []
  for (const { extra, quantity: requested } of input.extras) {
    const quantity = Math.min(Math.floor(requested), extra.maxQuantity)
    if (!(quantity >= 1) || extras.some((line) => line.extraId === extra.id)) continue
    const perPiece = extra.pricingType === 'per_day' ? extra.priceCents * days : extra.priceCents
    const capped = extra.maxChargeCents !== null && perPiece > extra.maxChargeCents
    extras.push({
      extraId: extra.id,
      name: extra.name,
      pricingType: extra.pricingType,
      quantity,
      unitPriceCents: extra.priceCents,
      totalCents: (capped ? extra.maxChargeCents! : perPiece) * quantity,
      capped,
    })
  }
  const extrasCents = extras.reduce((sum, line) => sum + line.totalCents, 0)

  const rentalCents = ratePerDayCents === null ? null : ratePerDayCents * days
  const totalCents = rentalCents === null ? null : rentalCents + extrasCents + input.pickupSurchargeCents + input.returnSurchargeCents
  const vat = totalCents === null ? null : splitVat(totalCents, input.vatRate)

  return {
    days,
    isIndividual,
    tier: tier ? { minDays: tier.minDays, maxDays: tier.maxDays } : null,
    ratePerDayCents,
    rentalCents,
    extras,
    extrasCents,
    pickupSurchargeCents: input.pickupSurchargeCents,
    returnSurchargeCents: input.returnSurchargeCents,
    totalCents,
    netCents: vat?.netCents ?? null,
    vatCents: vat?.vatCents ?? null,
    vatRate: input.vatRate,
  }
}

/**
 * Price set by staff instead of the price list (individual price for a long rental, an
 * agreed discount…). `totalCents` is the final amount incl. VAT and incl. extras; the
 * rental part is what remains after the extras and location surcharges.
 */
export function applyPriceOverride(price: PriceBreakdown, totalCents: number): PriceBreakdown & { overridden: true } {
  const { netCents, vatCents } = splitVat(totalCents, price.vatRate)
  return {
    ...price,
    ratePerDayCents: null,
    rentalCents: Math.max(0, totalCents - price.extrasCents - price.pickupSurchargeCents - price.returnSurchargeCents),
    totalCents,
    netCents,
    vatCents,
    overridden: true,
  }
}
