import { describe, expect, it } from 'vitest'
import { BLOCKING_STATUSES, TRANSITIONS, canTransition, isEditable, isTerminal, type BookingStatus } from '@/lib/booking-status'
import { cancellationQuote } from '@/lib/cancellation'
import { buildIcs } from '@/lib/ics'
import { computeKpi } from '@/lib/kpi'
import { formatIban, paymentDueDate, variableSymbol } from '@/lib/payment'
import { applyPriceOverride, calculatePrice } from '@/lib/pricing'
import { staffRuleErrors, type StaffBookingValues } from '@/lib/booking/staff-schema'

const ALL: BookingStatus[] = ['new', 'confirmed', 'modified', 'active', 'completed', 'cancelled']

describe('status transitions', () => {
  it('allows exactly the transitions from the brief', () => {
    const allowed = ['new>confirmed', 'new>cancelled', 'confirmed>modified', 'confirmed>active', 'confirmed>cancelled', 'modified>confirmed', 'modified>cancelled', 'active>completed']
    for (const from of ALL) for (const to of ALL) expect(canTransition(from, to), `${from}>${to}`).toBe(allowed.includes(`${from}>${to}`))
  })

  it('completed and cancelled are terminal; nothing leads back to new', () => {
    expect(ALL.filter(isTerminal)).toEqual(['completed', 'cancelled'])
    expect(Object.values(TRANSITIONS).flat()).not.toContain('new')
  })

  it('an active rental cannot be cancelled, only completed', () => {
    expect(canTransition('active', 'cancelled')).toBe(false)
    expect(TRANSITIONS.active).toEqual(['completed'])
  })

  it('blocking and editable statuses', () => {
    expect(BLOCKING_STATUSES).toEqual(['confirmed', 'modified', 'active'])
    expect(ALL.filter(isEditable)).toEqual(['new', 'confirmed', 'active'])
  })
})

describe('cancellationQuote', () => {
  const TIERS = [
    { min_hours: 0, fee_percent: 100 },
    { min_hours: 72, fee_percent: 0 },
    { min_hours: 24, fee_percent: 20 },
  ]
  const pickup = new Date('2027-06-10T08:00:00Z')
  const before = (hours: number) => new Date(pickup.getTime() - hours * 3600_000)

  it.each([
    [200, 0, 0],
    [72.01, 0, 0],
    [72, 20, 4740],
    [48, 20, 4740],
    [24.01, 20, 4740],
    [24, 100, 23700],
    [1, 100, 23700],
    [0, 100, 23700],
    [-5, 100, 23700],
  ])('%s h before pick-up → %s %%', (hours, percent, fee) => {
    expect(cancellationQuote(pickup, 23700, TIERS, before(hours))).toMatchObject({ feePercent: percent, feeCents: fee })
  })

  it('a booking without a price is cancelled free of charge', () => {
    expect(cancellationQuote(pickup, null, TIERS, before(1))).toMatchObject({ feePercent: 0, feeCents: 0 })
  })

  it('rounds to whole cents and reports the hours left', () => {
    expect(cancellationQuote(pickup, 3333, TIERS, before(30))).toEqual({ hoursBeforePickup: 30, feePercent: 20, feeCents: 667 })
  })

  it('uses custom tiers from settings', () => {
    const tiers = [
      { min_hours: 168, fee_percent: 0 },
      { min_hours: 0, fee_percent: 50 },
    ]
    expect(cancellationQuote(pickup, 10000, tiers, before(100)).feeCents).toBe(5000)
    expect(cancellationQuote(pickup, 10000, tiers, before(169)).feeCents).toBe(0)
    expect(cancellationQuote(pickup, 10000, [], before(1)).feeCents).toBe(0)
  })
})

describe('payment helpers', () => {
  it('variable symbol is the numeric part of the booking number', () => {
    expect(variableSymbol('BTW-2026-0001')).toBe('20260001')
    expect(variableSymbol('BTW-2027-12345')).toBe('202712345')
  })

  it('formats an IBAN in groups of four', () => {
    expect(formatIban('SK3112000000198742637541')).toBe('SK31 1200 0000 1987 4263 7541')
    expect(formatIban('SK31 1200 0000 1987 4263 7541')).toBe('SK31 1200 0000 1987 4263 7541')
  })

  it('payment is due in N days but no later than the day before pick-up', () => {
    const confirmed = new Date('2027-06-01T10:00:00Z')
    expect(paymentDueDate(confirmed, new Date('2027-06-20T08:00:00Z'), 3).toISOString()).toBe('2027-06-04T10:00:00.000Z')
    expect(paymentDueDate(confirmed, new Date('2027-06-03T08:00:00Z'), 3).toISOString()).toBe('2027-06-02T08:00:00.000Z')
    expect(paymentDueDate(confirmed, new Date('2027-06-01T20:00:00Z'), 3).toISOString()).toBe(confirmed.toISOString())
  })
})

describe('buildIcs', () => {
  const ics = buildIcs(
    {
      uid: 'BTW-2027-0042@rental.btw.sk',
      start: new Date('2027-06-14T08:00:00Z'),
      end: new Date('2027-06-19T08:00:00Z'),
      summary: 'Prenájom: Mercedes-Benz E 220 d',
      description: 'Rezervácia BTW-2027-0042\nVyzdvihnutie; odovzdanie, depozit',
      location: 'Trenčianska 56/A, 821 09 Bratislava',
    },
    new Date('2027-06-01T00:00:00Z'),
  )

  it('is a valid single-event calendar in UTC with CRLF line ends', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('DTSTART:20270614T080000Z')
    expect(ics).toContain('DTEND:20270619T080000Z')
    expect(ics).toContain('UID:BTW-2027-0042@rental.btw.sk')
    expect(ics.split('\r\n').every((line) => Buffer.byteLength(line, 'utf8') <= 75)).toBe(true)
  })

  it('escapes commas, semicolons and new lines', () => {
    expect(ics).toContain('LOCATION:Trenčianska 56/A\\, 821 09 Bratislava')
    expect(ics.replace(/\r\n /g, '')).toContain('DESCRIPTION:Rezervácia BTW-2027-0042\\nVyzdvihnutie\; odovzdanie\\, depozit')
  })
})

describe('applyPriceOverride', () => {
  const base = calculatePrice({
    pickupAt: new Date('2027-06-01T08:00:00Z'),
    returnAt: new Date('2027-06-04T08:00:00Z'),
    tiers: [{ minDays: 1, maxDays: 30, pricePerDayCents: 7900 }],
    extras: [{ extra: { id: 'x', name: { sk: 'Autosedačka' }, priceCents: 400, pricingType: 'per_day', maxQuantity: 4, maxChargeCents: null }, quantity: 1 }],
    pickupSurchargeCents: 0,
    returnSurchargeCents: 0,
    vatRate: 23,
    toleranceMinutes: 59,
    individualFromDays: 31,
  })

  it('replaces the total, recalculates VAT and keeps the extras', () => {
    const price = applyPriceOverride(base, 20000)
    expect(price).toMatchObject({ totalCents: 20000, netCents: 16260, vatCents: 3740, ratePerDayCents: null, extrasCents: 1200, rentalCents: 18800, overridden: true, days: 3 })
    expect(price.extras).toEqual(base.extras)
  })

  it('gives a price to a rental that the price list leaves individual', () => {
    const long = calculatePrice({
      pickupAt: new Date('2027-06-01T08:00:00Z'),
      returnAt: new Date('2027-07-16T08:00:00Z'),
      tiers: [{ minDays: 1, maxDays: 30, pricePerDayCents: 7900 }],
      extras: [],
      pickupSurchargeCents: 0,
      returnSurchargeCents: 0,
      vatRate: 23,
      toleranceMinutes: 59,
      individualFromDays: 31,
    })
    expect(long.totalCents).toBeNull()
    expect(applyPriceOverride(long, 250000).totalCents).toBe(250000)
  })

  it('never produces a negative rental part', () => {
    expect(applyPriceOverride(base, 500).rentalCents).toBe(0)
  })
})

describe('computeKpi', () => {
  const from = new Date('2027-06-01T00:00:00Z')
  const to = new Date('2027-07-01T00:00:00Z')
  const booking = (pickup: string, ret: string, total: number | null) => ({ pickup_at: `${pickup}T00:00:00Z`, return_at: `${ret}T00:00:00Z`, total_cents: total })

  it('counts bookings starting in the period and their revenue', () => {
    const kpi = computeKpi(
      [booking('2027-06-05', '2027-06-08', 23700), booking('2027-05-30', '2027-06-02', 10000), booking('2027-06-29', '2027-07-04', 39500), booking('2027-06-10', '2027-06-11', null)],
      from,
      to,
      2,
    )
    expect(kpi.count).toBe(3)
    expect(kpi.revenueCents).toBe(63200)
  })

  it('utilisation counts only the part of a rental inside the period', () => {
    // 3 + 1 (of 3) + 2 (of 5) days out of 2 vehicles × 30 days
    const kpi = computeKpi([booking('2027-06-05', '2027-06-08', 1), booking('2027-05-30', '2027-06-02', 1), booking('2027-06-29', '2027-07-04', 1)], from, to, 2)
    expect(kpi.utilization).toBeCloseTo(6 / 60, 5)
    expect(computeKpi([], from, to, 0).utilization).toBe(0)
    expect(computeKpi([booking('2027-05-01', '2027-08-01', 1)], from, to, 1).utilization).toBe(1)
  })
})

describe('staffRuleErrors', () => {
  const base = {
    phonePrefix: '+421',
    phoneNumber: '900123456',
    isCompany: false,
    companyName: '',
    ico: '',
    pickupCustom: false,
    pickupAddress: '',
    returnCustom: false,
    returnAddress: '',
    priceMode: 'auto',
    customPrice: '',
    priceReason: '',
  } as StaffBookingValues

  it('a custom price needs a valid amount and a reason', () => {
    expect(staffRuleErrors(base)).toEqual({})
    expect(staffRuleErrors({ ...base, priceMode: 'custom' })).toEqual({ customPrice: 'required', priceReason: 'required' })
    expect(staffRuleErrors({ ...base, priceMode: 'custom', customPrice: 'abc', priceReason: 'zľava' })).toEqual({ customPrice: 'price_invalid' })
    expect(staffRuleErrors({ ...base, priceMode: 'custom', customPrice: '450,50', priceReason: 'zľava' })).toEqual({})
  })

  it('shares the phone, company and address rules with the public form', () => {
    expect(staffRuleErrors({ ...base, phoneNumber: '12345678', isCompany: true, pickupCustom: true })).toEqual({
      phoneNumber: 'phone_length',
      companyName: 'required',
      ico: 'required',
      pickupAddress: 'address_required',
    })
  })
})
