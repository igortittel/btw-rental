import { describe, expect, it } from 'vitest'
import { maskTypedDate } from '@/components/booking/fields'
import { abroadRuleErrors, ageOn, bookingSchema, customerSchema, fieldErrors, formatTypedDate, parseTypedDate, termInstants, termSchema, validateDriverAge, validateTerm } from '@/lib/booking/schema'

const RULES = { minLeadHours: 24, minRentalDays: 1, toleranceMinutes: 59 }
const NOW = new Date('2027-05-30T08:00:00Z') // 10:00 in Bratislava
const term = (pickupDate: string, pickupTime: string, returnDate: string, returnTime: string) => ({ pickupDate, pickupTime, returnDate, returnTime })

const UUID = '11111111-1111-4111-8111-111111111111'
const valid = {
  vin: 'TESTBTW0000000001',
  ...term('2027-06-01', '10:00', '2027-06-04', '10:00'),
  pickupLocationId: UUID,
  returnLocationId: UUID,
  pickupCustom: false,
  pickupAddress: '',
  pickupOutsideCity: false,
  returnCustom: false,
  returnAddress: '',
  returnOutsideCity: false,
  abroadTrip: false,
  abroadCountries: '',
  firstName: ' Anna ',
  lastName: 'Nováková',
  email: ' Anna.Novakova@Example.com ',
  phonePrefix: '+421',
  phoneNumber: '0900 123 456',
  note: '',
  dateOfBirth: '1990-05-17',
  licenseConfirmed: true,
  isCompany: false,
  companyName: '',
  ico: '',
  dic: '',
  icDph: '',
  street: 'Hlavná 1',
  city: 'Bratislava',
  zip: '811 01',
  country: 'SK',
  depositConsent: true,
  kmLimitConsent: true,
  rentalPaymentMethod: 'transfer',
  depositPaymentMethod: 'cash',
  extras: { [UUID]: 2 },
  termsConsent: true,
  gdprConsent: true,
  marketingConsent: false,
}

describe('validateTerm', () => {
  it('accepts a term far enough in the future', () => {
    expect(validateTerm(term('2027-06-01', '10:00', '2027-06-04', '10:00'), RULES, NOW)).toEqual({})
  })

  it('enforces the minimum lead time to the minute', () => {
    expect(validateTerm(term('2027-05-31', '09:30', '2027-06-02', '10:00'), RULES, NOW)).toEqual({ pickupDate: 'lead_time' })
    expect(validateTerm(term('2027-05-31', '10:00', '2027-06-02', '10:00'), RULES, NOW)).toEqual({})
  })

  it('rejects a return that is not after the pick-up', () => {
    expect(validateTerm(term('2027-06-04', '10:00', '2027-06-01', '10:00'), RULES, NOW)).toEqual({ returnDate: 'return_before_pickup' })
    expect(validateTerm(term('2027-06-04', '10:00', '2027-06-04', '10:00'), RULES, NOW)).toEqual({ returnDate: 'return_before_pickup' })
  })

  it('enforces the minimum rental length', () => {
    const rules = { ...RULES, minRentalDays: 3 }
    expect(validateTerm(term('2027-06-01', '10:00', '2027-06-03', '10:00'), rules, NOW)).toEqual({ returnDate: 'min_rental' })
    expect(validateTerm(term('2027-06-01', '10:00', '2027-06-04', '10:00'), rules, NOW)).toEqual({})
  })

  it('reads times as Europe/Bratislava wall time', () => {
    const { pickupAt, returnAt } = termInstants(term('2027-06-01', '10:00', '2027-12-01', '10:00'))!
    expect(pickupAt.toISOString()).toBe('2027-06-01T08:00:00.000Z') // summer time, UTC+2
    expect(returnAt.toISOString()).toBe('2027-12-01T09:00:00.000Z') // winter time, UTC+1
  })
})

describe('driver age', () => {
  it('counts completed years on the pick-up day', () => {
    expect(ageOn('2006-06-01', '2027-06-01')).toBe(21)
    expect(ageOn('2006-06-02', '2027-06-01')).toBe(20)
    expect(ageOn('2004-02-29', '2025-02-28')).toBe(20)
    expect(ageOn('2004-02-29', '2025-03-01')).toBe(21)
  })

  it('requires the minimum age on the day of pick-up, not today', () => {
    expect(validateDriverAge('2006-06-01', '2027-06-01', 21)).toEqual({})
    expect(validateDriverAge('2006-06-02', '2027-06-01', 21)).toEqual({ dateOfBirth: 'too_young' })
    expect(validateDriverAge('2006-06-02', '2027-06-01', 18)).toEqual({})
  })

  it('rejects nonsense dates', () => {
    expect(validateDriverAge('', '2027-06-01', 21)).toEqual({ dateOfBirth: 'date_invalid' })
    expect(validateDriverAge('1800-01-01', '2027-06-01', 21)).toEqual({ dateOfBirth: 'date_invalid' })
    expect(validateDriverAge('2031-01-01', '2027-06-01', 21)).toEqual({ dateOfBirth: 'too_young' })
  })
})

describe('bookingSchema', () => {
  it('accepts a complete form and normalises email, phone and whitespace', () => {
    const parsed = bookingSchema.parse(valid)
    expect(parsed).toMatchObject({ firstName: 'Anna', email: 'anna.novakova@example.com', phoneNumber: '900123456' })
  })

  it('requires every mandatory consent', () => {
    for (const key of ['licenseConfirmed', 'depositConsent', 'kmLimitConsent', 'termsConsent', 'gdprConsent'] as const) {
      const result = bookingSchema.safeParse({ ...valid, [key]: false })
      expect(result.success).toBe(false)
      if (!result.success) expect(fieldErrors(result.error)).toEqual({ [key]: 'must_accept' })
    }
    expect(bookingSchema.safeParse({ ...valid, marketingConsent: false }).success).toBe(true)
  })

  it('requires company name and ID only for companies', () => {
    const result = customerSchema.safeParse({ ...valid, isCompany: true })
    expect(result.success).toBe(false)
    if (!result.success) expect(fieldErrors(result.error)).toEqual({ companyName: 'required', ico: 'required' })
    expect(customerSchema.safeParse({ ...valid, isCompany: true, companyName: 'Firma s.r.o.', ico: '12345678' }).success).toBe(true)
    const bad = customerSchema.safeParse({ ...valid, isCompany: true, companyName: 'Firma s.r.o.', ico: '12' })
    if (!bad.success) expect(fieldErrors(bad.error)).toEqual({ ico: 'ico_invalid' })
  })

  it('reports one error code per invalid field', () => {
    const result = bookingSchema.safeParse({ ...valid, firstName: '', email: 'not-an-email', phoneNumber: '12', street: ' ', rentalPaymentMethod: 'bitcoin', vin: 'x' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(fieldErrors(result.error)).toEqual({
        vin: 'vehicle_required',
        firstName: 'required',
        email: 'email_invalid',
        phoneNumber: 'phone_invalid',
        street: 'required',
        rentalPaymentMethod: 'required',
      })
    }
  })

  it('rejects a price or other unknown amounts sent by the client only by ignoring them', () => {
    const parsed = bookingSchema.parse({ ...valid, totalCents: 1, price: { totalCents: 1 } }) as Record<string, unknown>
    expect(parsed.totalCents).toBeUndefined()
    expect(parsed.price).toBeUndefined()
  })

  it('limits extras to sane quantities and valid IDs', () => {
    expect(bookingSchema.safeParse({ ...valid, extras: { [UUID]: 21 } }).success).toBe(false)
    expect(bookingSchema.safeParse({ ...valid, extras: { [UUID]: -1 } }).success).toBe(false)
    expect(bookingSchema.safeParse({ ...valid, extras: { 'not-a-uuid': 1 } }).success).toBe(false)
  })

  it('requires exactly 9 digits for Slovak and Czech numbers', () => {
    const codes = (over: Record<string, unknown>) => {
      const result = customerSchema.safeParse({ ...valid, ...over })
      return result.success ? {} : fieldErrors(result.error)
    }
    expect(codes({ phoneNumber: '900 123 456' })).toEqual({})
    expect(codes({ phoneNumber: '0900123456' })).toEqual({}) // leading zero is dropped
    expect(codes({ phoneNumber: '90012345' })).toEqual({ phoneNumber: 'phone_length' })
    expect(codes({ phoneNumber: '9001234567' })).toEqual({ phoneNumber: 'phone_length' })
    expect(codes({ phonePrefix: '+420', phoneNumber: '60112345' })).toEqual({ phoneNumber: 'phone_length' })
    expect(codes({ phonePrefix: '+43', phoneNumber: '6641234567' })).toEqual({}) // other countries: 6–12 digits
    expect(codes({ phoneNumber: '12345' })).toEqual({ phoneNumber: 'phone_invalid' })
  })

  it('requires an address when delivery to an own address is chosen', () => {
    const codes = (over: Record<string, unknown>) => {
      const result = termSchema.safeParse({ ...valid, ...over })
      return result.success ? {} : fieldErrors(result.error)
    }
    expect(codes({})).toEqual({})
    expect(codes({ pickupCustom: true })).toEqual({ pickupAddress: 'address_required' })
    expect(codes({ returnCustom: true, returnAddress: 'BA' })).toEqual({ returnAddress: 'address_required' })
    expect(codes({ pickupCustom: true, pickupAddress: 'Letisko M. R. Štefánika, Bratislava' })).toEqual({})
  })

  it('requires an answer about travel abroad and the countries when it is yes', () => {
    const codes = (over: Record<string, unknown>) => {
      const result = termSchema.safeParse({ ...valid, ...over })
      return result.success ? {} : fieldErrors(result.error)
    }
    expect(codes({ abroadTrip: null })).toEqual({ abroadTrip: 'abroad_required' })
    expect(codes({ abroadTrip: true, abroadCountries: ' ' })).toEqual({ abroadCountries: 'abroad_countries_required' })
    expect(codes({ abroadTrip: true, abroadCountries: 'Rakúsko, Chorvátsko' })).toEqual({})
    expect(codes({ abroadTrip: false, abroadCountries: '' })).toEqual({})
    // The form calls the rule directly, so it shows up together with other errors.
    expect(abroadRuleErrors({ abroadTrip: null, abroadCountries: '' })).toEqual({ abroadTrip: 'abroad_required' })
  })
})

describe('typed date of birth', () => {
  it('parses D.M.YYYY and rejects impossible dates', () => {
    expect(parseTypedDate('24.05.1990')).toBe('1990-05-24')
    expect(parseTypedDate('1.5.1990')).toBe('1990-05-01')
    expect(parseTypedDate('24/05/1990')).toBe('1990-05-24')
    expect(parseTypedDate('31.02.1990')).toBe('')
    expect(parseTypedDate('24.05.90')).toBe('')
    expect(parseTypedDate('24.05')).toBe('')
    expect(formatTypedDate('1990-05-24')).toBe('24.05.1990')
    expect(formatTypedDate('')).toBe('')
  })

  it('adds the dots while typing and normalises pasted or autofilled dates', () => {
    expect(maskTypedDate('2')).toBe('2')
    expect(maskTypedDate('245')).toBe('24.5')
    expect(maskTypedDate('24051990')).toBe('24.05.1990')
    expect(maskTypedDate('1.')).toBe('01.')
    expect(maskTypedDate('24.')).toBe('24.')
    expect(maskTypedDate('24')).toBe('24') // deleting back over a dot works
    expect(maskTypedDate('1.5.1990')).toBe('01.05.1990')
    expect(maskTypedDate('1990-05-24')).toBe('24.05.1990')
    expect(maskTypedDate('240519901')).toBe('24.05.1990')
  })
})
