import { z } from 'zod'
import { COUNTRY_CODES, PHONE_PREFIXES } from '@/lib/booking/countries'
import { countRentalDays } from '@/lib/pricing'
import { zonedLocalToUtc } from '@/lib/time'

// Shared by the browser (step-by-step feedback) and the server (authoritative check).
// Messages are error codes; the UI translates them (messages/*.json → booking.errors).

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const text = (max: number) => z.string().trim().max(max, { message: 'too_long' })
const requiredText = (max: number) => text(max).min(1, { message: 'required' })
const mustAccept = z.literal(true, { message: 'must_accept' })
const paymentMethod = z.enum(['transfer', 'terminal', 'cash'], { message: 'required' })

export const PAYMENT_METHODS = ['transfer', 'terminal', 'cash'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const termSchema = z
  .object({
    vin: z.string().regex(/^[A-Z0-9]{5,20}$/, { message: 'vehicle_required' }),
    pickupDate: z.string().regex(DATE, { message: 'required' }),
    pickupTime: z.string().regex(TIME, { message: 'required' }),
    returnDate: z.string().regex(DATE, { message: 'required' }),
    returnTime: z.string().regex(TIME, { message: 'required' }),
    pickupLocationId: z.string().regex(UUID, { message: 'required' }),
    returnLocationId: z.string().regex(UUID, { message: 'required' }),
    /** Delivery / collection at the customer's own address; the fee depends on the distance and is set by staff. */
    pickupCustom: z.boolean(),
    pickupAddress: text(200),
    returnCustom: z.boolean(),
    returnAddress: text(200),
    abroadTrip: z.boolean(),
    abroadCountries: text(300),
  })
  .superRefine((value, ctx) => {
    if (value.pickupCustom && value.pickupAddress.length < 5) ctx.addIssue({ code: 'custom', path: ['pickupAddress'], message: 'address_required' })
    if (value.returnCustom && value.returnAddress.length < 5) ctx.addIssue({ code: 'custom', path: ['returnAddress'], message: 'address_required' })
  })

/** National number length (digits, without the leading zero) for dial codes where it is fixed. */
export const PHONE_DIGITS: Record<string, number> = { '+421': 9, '+420': 9 }

export const customerSchema = z
  .object({
    firstName: requiredText(80),
    lastName: requiredText(80),
    email: z.string().trim().toLowerCase().pipe(z.email({ message: 'email_invalid' }).max(254, { message: 'email_invalid' })),
    phonePrefix: z.enum(PHONE_PREFIXES.map((p) => p.dial) as [string, ...string[]], { message: 'required' }),
    phoneNumber: z
      .string()
      .transform((v) => v.replace(/[\s\-()/.]/g, '').replace(/^0+/, ''))
      .pipe(z.string().regex(/^\d{6,12}$/, { message: 'phone_invalid' })),
    note: text(2000),
    dateOfBirth: z.string().regex(DATE, { message: 'required' }),
    licenseConfirmed: mustAccept,
    isCompany: z.boolean(),
    companyName: text(160),
    ico: text(20),
    dic: text(20),
    icDph: text(20),
    street: requiredText(160),
    city: requiredText(100),
    zip: requiredText(12),
    country: z.enum(COUNTRY_CODES, { message: 'required' }),
    depositConsent: mustAccept,
    kmLimitConsent: mustAccept,
    rentalPaymentMethod: paymentMethod,
    depositPaymentMethod: paymentMethod,
    /** extra id -> quantity (0 or missing = not selected). */
    extras: z.record(z.string().regex(UUID), z.number().int().min(0).max(20)),
  })
  .superRefine((value, ctx) => {
    for (const [path, message] of Object.entries(customerRuleErrors(value))) ctx.addIssue({ code: 'custom', path: [path], message: message as string })
  })

/**
 * Rules that depend on more than one field. Zod runs cross-field checks only once every
 * single field is valid, so the forms call this directly as well – all problems of a
 * step are then reported together.
 */
export function customerRuleErrors(value: { phonePrefix: string; phoneNumber: string; isCompany: boolean; companyName: string; ico: string }): FieldErrors {
  const errors: FieldErrors = {}
  const phone = value.phoneNumber.replace(/[\s\-()/.]/g, '').replace(/^0+/, '')
  const digits = PHONE_DIGITS[value.phonePrefix]
  if (digits && /^\d{6,12}$/.test(phone) && phone.length !== digits) errors.phoneNumber = 'phone_length'
  if (value.isCompany) {
    if (!value.companyName.trim()) errors.companyName = 'required'
    if (!/^[A-Za-z0-9 ]{6,14}$/.test(value.ico.trim())) errors.ico = value.ico.trim() ? 'ico_invalid' : 'required'
  }
  return errors
}

export const confirmSchema = z.object({
  termsConsent: mustAccept,
  gdprConsent: mustAccept,
  marketingConsent: z.boolean(),
})

export const bookingSchema = z.intersection(z.intersection(termSchema, customerSchema), confirmSchema)

export type TermInput = z.input<typeof termSchema>
export type BookingData = z.output<typeof bookingSchema>

/** What the form holds while it is being filled in (consents may still be unticked). */
export type BookingFormState = TermInput & {
  firstName: string
  lastName: string
  email: string
  phonePrefix: string
  phoneNumber: string
  note: string
  dateOfBirth: string
  licenseConfirmed: boolean
  isCompany: boolean
  companyName: string
  ico: string
  dic: string
  icDph: string
  street: string
  city: string
  zip: string
  country: string
  depositConsent: boolean
  kmLimitConsent: boolean
  rentalPaymentMethod: string
  depositPaymentMethod: string
  extras: Record<string, number>
  termsConsent: boolean
  gdprConsent: boolean
  marketingConsent: boolean
}
export type FieldErrors = Partial<Record<keyof BookingFormState | 'form', string>>

/** First error code per field. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const result: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form')
    if (!(key in result)) result[key] = issue.message
  }
  return result as FieldErrors
}

export type TermRules = { minLeadHours: number; minRentalDays: number; toleranceMinutes: number }

/** Pick-up and return instants of a term entered as Europe/Bratislava wall time. */
export function termInstants(term: Pick<TermInput, 'pickupDate' | 'pickupTime' | 'returnDate' | 'returnTime'>): { pickupAt: Date; returnAt: Date } | null {
  const pickupAt = zonedLocalToUtc(`${term.pickupDate}T${term.pickupTime}`)
  const returnAt = zonedLocalToUtc(`${term.returnDate}T${term.returnTime}`)
  return pickupAt && returnAt ? { pickupAt, returnAt } : null
}

/** Business rules of the term that do not need the database. */
export function validateTerm(term: Pick<TermInput, 'pickupDate' | 'pickupTime' | 'returnDate' | 'returnTime'>, rules: TermRules, now: Date = new Date()): FieldErrors {
  const instants = termInstants(term)
  if (!instants) return { pickupDate: 'required' }
  const { pickupAt, returnAt } = instants
  if (pickupAt.getTime() < now.getTime() + rules.minLeadHours * 3600_000) return { pickupDate: 'lead_time' }
  if (returnAt <= pickupAt) return { returnDate: 'return_before_pickup' }
  // The minimum length is checked on real elapsed days: the tolerance may shorten the
  // billed days, but it must not make a too-short rental acceptable.
  if (returnAt.getTime() - pickupAt.getTime() < 3600_000) return { returnDate: 'return_before_pickup' }
  if (countRentalDays(pickupAt, returnAt, rules.toleranceMinutes) < rules.minRentalDays) return { returnDate: 'min_rental' }
  return {}
}

/** Completed years of age on the given day (both as YYYY-MM-DD calendar dates). */
export function ageOn(dateOfBirth: string, onDate: string): number {
  const [by, bm, bd] = dateOfBirth.split('-').map(Number)
  const [y, m, d] = onDate.split('-').map(Number)
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}

export function validateDriverAge(dateOfBirth: string, pickupDate: string, minAge: number): FieldErrors {
  if (!DATE.test(dateOfBirth) || Number.isNaN(Date.parse(dateOfBirth))) return { dateOfBirth: 'required' }
  const age = ageOn(dateOfBirth, pickupDate)
  if (age > 110) return { dateOfBirth: 'required' }
  return age < minAge ? { dateOfBirth: 'too_young' } : {}
}

/** Full phone number in international format. */
export function fullPhone(prefix: string, number: string): string {
  return `${prefix}${number}`
}
