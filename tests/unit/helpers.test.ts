import { describe, expect, it } from 'vitest'
import { centsToInput, formatEuro, parseEuroToCents } from '@/lib/format'
import { utcToZonedLocal, zonedLocalToUtc } from '@/lib/time'
import { buildVehicleName, buildVehicleSlug, isReservedSlug, normalizeVin, parseVehicleSegment, slugify, vehiclePath, VIN_PATTERN } from '@/lib/vehicle-url'

describe('money', () => {
  it('parses what people type into integer cents', () => {
    expect(parseEuroToCents('79')).toBe(7900)
    expect(parseEuroToCents('79,5')).toBe(7950)
    expect(parseEuroToCents('0.62')).toBe(62)
    expect(parseEuroToCents('1 000,00 €')).toBe(100000)
    expect(parseEuroToCents('19,99')).toBe(1999) // no float rounding error
  })
  it('distinguishes empty from invalid', () => {
    expect(parseEuroToCents('')).toBeNull()
    expect(parseEuroToCents('  ')).toBeNull()
    for (const bad of ['abc', '-5', '1,234', '1.2.3', '5e2']) expect(parseEuroToCents(bad)).toBeNaN()
  })
  it('round-trips through the input value', () => {
    for (const cents of [0, 62, 400, 7900, 100000, 1999]) expect(parseEuroToCents(centsToInput(cents))).toBe(cents)
    expect(centsToInput(null)).toBe('')
  })
  it('formats for display', () => {
    expect(formatEuro(7900).replace(/\s/g, ' ')).toBe('79 €')
    expect(formatEuro(62).replace(/\s/g, ' ')).toBe('0,62 €')
    expect(formatEuro(null)).toBe('—')
  })
})

describe('vehicle URL', () => {
  it('slugifies names including diacritics', () => {
    expect(slugify('Mercedes-Benz E 220 d')).toBe('mercedes-benz-e-220-d')
    expect(slugify('  Škoda Superb – L&K  ')).toBe('skoda-superb-l-k')
  })
  it('builds slug and name from brand, model and variant', () => {
    const v = { brand: 'Mercedes-Benz', model: 'V 250 d', variant: '4MATIC Extra-Long' }
    expect(buildVehicleSlug(v)).toBe('mercedes-benz-v-250-d-4matic-extra-long')
    expect(buildVehicleName(v)).toBe('Mercedes-Benz V 250 d 4MATIC Extra-Long')
    expect(buildVehicleName({ brand: 'Hyundai', model: 'Staria', variant: null })).toBe('Hyundai Staria')
  })
  it('puts the upper-case VIN after the last dash', () => {
    expect(vehiclePath('sedan', 'mercedes-benz-e-220-d', 'wdd2130041a123456')).toBe('/sedan/mercedes-benz-e-220-d-WDD2130041A123456')
  })
  it('finds the VIN after the last dash', () => {
    expect(parseVehicleSegment('mercedes-benz-e-220-d-WDD2130041A123456')).toEqual({
      namePart: 'mercedes-benz-e-220-d',
      vin: 'WDD2130041A123456',
    })
    expect(parseVehicleSegment('novin')).toBeNull()
    expect(parseVehicleSegment('trailing-')).toBeNull()
  })
  it('validates VINs (no dashes, upper case)', () => {
    expect(VIN_PATTERN.test(normalizeVin(' testbtw0000000001 '))).toBe(true)
    expect(VIN_PATTERN.test('ABC-123')).toBe(false)
    expect(VIN_PATTERN.test('abc12345')).toBe(false)
  })
  it('knows the reserved category slugs', () => {
    for (const slug of ['admin', 'rezervacia', 'moj-ucet', 'en', 'api']) expect(isReservedSlug(slug)).toBe(true)
    expect(isReservedSlug('sedan')).toBe(false)
  })
})

describe('Europe/Bratislava wall time', () => {
  it('converts winter and summer time', () => {
    expect(zonedLocalToUtc('2027-01-15T10:00')?.toISOString()).toBe('2027-01-15T09:00:00.000Z')
    expect(zonedLocalToUtc('2027-07-15T10:00')?.toISOString()).toBe('2027-07-15T08:00:00.000Z')
  })
  it('handles the days when the clocks change', () => {
    // 28 Mar 2027: 02:00 -> 03:00; 31 Oct 2027: 03:00 -> 02:00
    expect(zonedLocalToUtc('2027-03-28T01:30')?.toISOString()).toBe('2027-03-28T00:30:00.000Z')
    expect(zonedLocalToUtc('2027-03-28T03:30')?.toISOString()).toBe('2027-03-28T01:30:00.000Z')
    expect(zonedLocalToUtc('2027-10-31T01:30')?.toISOString()).toBe('2027-10-30T23:30:00.000Z')
    expect(zonedLocalToUtc('2027-10-31T02:30')?.toISOString()).toBe('2027-10-31T00:30:00.000Z') // first occurrence
    expect(zonedLocalToUtc('2027-10-31T03:30')?.toISOString()).toBe('2027-10-31T02:30:00.000Z')
  })
  it('round-trips', () => {
    for (const local of ['2027-01-15T10:00', '2027-07-15T23:45', '2027-03-28T03:30', '2027-10-31T03:30']) {
      expect(utcToZonedLocal(zonedLocalToUtc(local)!)).toBe(local)
    }
  })
  it('rejects malformed input', () => {
    expect(zonedLocalToUtc('15.1.2027 10:00')).toBeNull()
    expect(zonedLocalToUtc('')).toBeNull()
  })
})

import { formatIban, isValidIban } from '@/lib/iban'
import { DEFAULT_SETTINGS, parseSettings } from '@/lib/settings'

describe('IBAN', () => {
  it('accepts valid IBANs with or without spaces', () => {
    expect(isValidIban('SK31 1200 0000 1987 4263 7541')).toBe(true)
    expect(isValidIban('sk3112000000198742637541')).toBe(true)
    expect(isValidIban('DE89370400440532013000')).toBe(true)
  })
  it('rejects wrong checksums, lengths and placeholders', () => {
    expect(isValidIban('SK31 1200 0000 1987 4263 7542')).toBe(false)
    expect(isValidIban('SK00 0000 0000 0000 0000 0000')).toBe(false)
    expect(isValidIban('SK31 1200 0000 1987 4263')).toBe(false)
    expect(isValidIban('')).toBe(false)
  })
  it('formats in groups of four', () => {
    expect(formatIban('sk3112000000198742637541')).toBe('SK31 1200 0000 1987 4263 7541')
  })
})

describe('settings', () => {
  it('uses the defaults from the brief when nothing is stored', () => {
    const s = parseSettings([])
    expect(s.deposit_cents).toBe(100000)
    expect(s.km_limit_per_day).toBe(300)
    expect(s.extra_km_cents).toBe(62)
    expect(s.min_driver_age).toBe(21)
    expect(s.min_license_months).toBe(6)
    expect(s.vat_rate).toBe(23)
    expect(s.min_lead_hours).toBe(24)
    expect(s.return_tolerance_minutes).toBe(59)
    expect(s.default_buffer_minutes).toBe(240)
    expect(s.modification_deadline_hours).toBe(48)
    expect(s.cancellation_tiers).toEqual([
      { min_hours: 72, fee_percent: 0 },
      { min_hours: 24, fee_percent: 20 },
      { min_hours: 0, fee_percent: 100 },
    ])
  })
  it('takes stored values and ignores malformed or unknown ones', () => {
    const s = parseSettings([
      { key: 'deposit_cents', value: 150000 },
      { key: 'vat_rate', value: 'not a number' },
      { key: 'something_else', value: 1 },
    ])
    expect(s.deposit_cents).toBe(150000)
    expect(s.vat_rate).toBe(DEFAULT_SETTINGS.vat_rate)
  })
})
