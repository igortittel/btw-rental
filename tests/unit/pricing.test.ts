import { describe, expect, it } from 'vitest'
import { calculatePrice, countRentalDays, findTier, splitVat, type PriceInput, type PricingExtra } from '@/lib/pricing'
import { zonedLocalToUtc } from '@/lib/time'

const at = (local: string) => zonedLocalToUtc(local)!

// Distinct rates per tier so a wrong tier is visible in the result.
const TIERS = [
  { minDays: 1, maxDays: 1, pricePerDayCents: 10000 },
  { minDays: 2, maxDays: 5, pricePerDayCents: 9000 },
  { minDays: 6, maxDays: 14, pricePerDayCents: 8000 },
  { minDays: 15, maxDays: 30, pricePerDayCents: 7000 },
  { minDays: 31, maxDays: null, pricePerDayCents: null },
]

const extra = (over: Partial<PricingExtra> = {}): PricingExtra => ({ id: 'x', name: { sk: 'Doplnok' }, priceCents: 400, pricingType: 'per_day', maxQuantity: 4, maxChargeCents: null, ...over })

const input = (pickup: string, ret: string, over: Partial<PriceInput> = {}): PriceInput => ({
  pickupAt: at(pickup),
  returnAt: at(ret),
  tiers: TIERS,
  extras: [],
  pickupSurchargeCents: 0,
  returnSurchargeCents: 0,
  vatRate: 23,
  toleranceMinutes: 59,
  individualFromDays: 31,
  ...over,
})

/** Rental starting 1 June 2027 10:00 and lasting exactly `days` × 24 h. */
const forDays = (days: number, over: Partial<PriceInput> = {}) => {
  const end = new Date(Date.UTC(2027, 5, 1 + days))
  return input('2027-06-01T10:00', `${end.toISOString().slice(0, 10)}T10:00`, over)
}

describe('countRentalDays', () => {
  it('counts started 24-hour blocks', () => {
    expect(countRentalDays(at('2027-06-01T10:00'), at('2027-06-02T10:00'))).toBe(1)
    expect(countRentalDays(at('2027-06-01T10:00'), at('2027-06-02T10:01'))).toBe(2)
    expect(countRentalDays(at('2027-06-01T10:00'), at('2027-06-04T09:00'))).toBe(3)
  })

  it('is never less than one day', () => {
    expect(countRentalDays(at('2027-06-01T10:00'), at('2027-06-01T12:00'))).toBe(1)
    expect(countRentalDays(at('2027-06-01T10:00'), at('2027-06-01T10:30'), 59)).toBe(1)
  })

  it('does not start another day within the tolerance', () => {
    expect(countRentalDays(at('2027-06-01T10:00'), at('2027-06-03T10:59'), 59)).toBe(2)
    expect(countRentalDays(at('2027-06-01T10:00'), at('2027-06-03T11:00'), 59)).toBe(3)
    expect(countRentalDays(at('2027-06-01T10:00'), at('2027-06-03T10:59'), 0)).toBe(3)
  })

  it('counts by the local clock across the spring DST change (23 real hours)', () => {
    // 28 March 2027: clocks go 02:00 -> 03:00.
    const pickup = at('2027-03-27T10:00')
    const ret = at('2027-03-28T10:00')
    expect((ret.getTime() - pickup.getTime()) / 3600_000).toBe(23)
    expect(countRentalDays(pickup, ret)).toBe(1)
    expect(countRentalDays(pickup, at('2027-03-28T10:01'))).toBe(2)
    expect(countRentalDays(pickup, at('2027-03-29T10:00'))).toBe(2)
  })

  it('counts by the local clock across the autumn DST change (25 real hours)', () => {
    // 31 October 2027: clocks go 03:00 -> 02:00.
    const pickup = at('2027-10-30T10:00')
    const ret = at('2027-10-31T10:00')
    expect((ret.getTime() - pickup.getTime()) / 3600_000).toBe(25)
    expect(countRentalDays(pickup, ret)).toBe(1)
    expect(countRentalDays(pickup, at('2027-10-31T10:59'), 59)).toBe(1)
    expect(countRentalDays(pickup, at('2027-10-31T11:00'), 59)).toBe(2)
    expect(countRentalDays(at('2027-10-25T10:00'), at('2027-11-01T10:00'))).toBe(7)
  })
})

describe('calculatePrice – tiers', () => {
  it.each([
    [1, 10000],
    [2, 9000],
    [5, 9000],
    [6, 8000],
    [14, 8000],
    [15, 7000],
    [30, 7000],
  ])('%i day(s) use the rate %i for every day', (days, rate) => {
    const price = calculatePrice(forDays(days))
    expect(price.days).toBe(days)
    expect(price.isIndividual).toBe(false)
    expect(price.ratePerDayCents).toBe(rate)
    expect(price.rentalCents).toBe(days * rate)
    expect(price.totalCents).toBe(days * rate)
  })

  it('31 days and more are priced individually', () => {
    const price = calculatePrice(forDays(31))
    expect(price).toMatchObject({ days: 31, isIndividual: true, ratePerDayCents: null, rentalCents: null, totalCents: null, netCents: null, vatCents: null })
    expect(calculatePrice(forDays(90)).isIndividual).toBe(true)
  })

  it('the individual-price threshold from settings wins over the tiers', () => {
    expect(calculatePrice(forDays(20, { individualFromDays: 20 })).isIndividual).toBe(true)
    expect(calculatePrice(forDays(19, { individualFromDays: 20 })).ratePerDayCents).toBe(7000)
  })

  it('a tier without a price or no matching tier means an individual price', () => {
    expect(calculatePrice(forDays(3, { tiers: [{ minDays: 1, maxDays: 5, pricePerDayCents: null }] })).isIndividual).toBe(true)
    expect(calculatePrice(forDays(3, { tiers: [{ minDays: 1, maxDays: 2, pricePerDayCents: 5000 }] })).isIndividual).toBe(true)
  })

  it('the tolerance keeps a slightly late return in the lower day count', () => {
    expect(calculatePrice(input('2027-06-01T10:00', '2027-06-06T10:59')).days).toBe(5)
    expect(calculatePrice(input('2027-06-01T10:00', '2027-06-06T10:59')).ratePerDayCents).toBe(9000)
    expect(calculatePrice(input('2027-06-01T10:00', '2027-06-06T11:00')).days).toBe(6)
    expect(calculatePrice(input('2027-06-01T10:00', '2027-06-06T11:00')).totalCents).toBe(6 * 8000)
  })

  it('findTier returns null outside every range', () => {
    expect(findTier(TIERS, 0)).toBeNull()
    expect(findTier(TIERS, 40)?.minDays).toBe(31)
  })
})

describe('calculatePrice – extras, locations, VAT', () => {
  it('per_day extras are multiplied by days and quantity', () => {
    const price = calculatePrice(forDays(3, { extras: [{ extra: extra(), quantity: 2 }] }))
    expect(price.extras).toEqual([{ extraId: 'x', name: { sk: 'Doplnok' }, pricingType: 'per_day', quantity: 2, unitPriceCents: 400, totalCents: 2400, capped: false }])
    expect(price.totalCents).toBe(3 * 9000 + 2400)
  })

  it('per_rental extras are charged once per piece', () => {
    const price = calculatePrice(forDays(7, { extras: [{ extra: extra({ pricingType: 'per_rental', priceCents: 2500 }), quantity: 1 }] }))
    expect(price.extrasCents).toBe(2500)
  })

  it('max_charge caps the charge for one piece', () => {
    const price = calculatePrice(forDays(10, { extras: [{ extra: extra({ maxChargeCents: 3000 }), quantity: 2 }] }))
    expect(price.extras[0]).toMatchObject({ totalCents: 6000, capped: true })
    expect(calculatePrice(forDays(7, { extras: [{ extra: extra({ maxChargeCents: 3000 }), quantity: 1 }] })).extras[0]).toMatchObject({ totalCents: 2800, capped: false })
  })

  it('caps the quantity and ignores zero, negative and duplicate lines', () => {
    const e = extra({ maxQuantity: 2 })
    const price = calculatePrice(forDays(1, { extras: [{ extra: e, quantity: 9 }, { extra: e, quantity: 1 }, { extra: extra({ id: 'y' }), quantity: 0 }, { extra: extra({ id: 'z' }), quantity: -3 }] }))
    expect(price.extras).toHaveLength(1)
    expect(price.extras[0].quantity).toBe(2)
  })

  it('adds location surcharges', () => {
    const price = calculatePrice(forDays(2, { pickupSurchargeCents: 1500, returnSurchargeCents: 2000 }))
    expect(price.totalCents).toBe(2 * 9000 + 3500)
  })

  it('splits the total into base and 23 % VAT that always add up', () => {
    const price = calculatePrice(forDays(1, { tiers: [{ minDays: 1, maxDays: 30, pricePerDayCents: 7900 }] }))
    expect(price).toMatchObject({ totalCents: 7900, netCents: 6423, vatCents: 1477, vatRate: 23 })
    for (const gross of [1, 99, 7900, 12345, 99999]) {
      const { netCents, vatCents } = splitVat(gross, 23)
      expect(netCents + vatCents).toBe(gross)
    }
    expect(splitVat(12300, 23)).toEqual({ netCents: 10000, vatCents: 2300 })
    expect(splitVat(5000, 0)).toEqual({ netCents: 5000, vatCents: 0 })
  })

  it('keeps extras in the snapshot of an individual price but gives no total', () => {
    const price = calculatePrice(forDays(45, { extras: [{ extra: extra(), quantity: 1 }] }))
    expect(price.extrasCents).toBe(45 * 400)
    expect(price.totalCents).toBeNull()
  })

  it('works only with integer cents', () => {
    const price = calculatePrice(forDays(7, { extras: [{ extra: extra({ priceCents: 333 }), quantity: 3 }], pickupSurchargeCents: 1 }))
    for (const value of [price.rentalCents, price.extrasCents, price.totalCents, price.netCents, price.vatCents]) expect(Number.isInteger(value)).toBe(true)
  })
})
