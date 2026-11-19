import { z } from 'zod'
import { COUNTRY_CODES, PHONE_PREFIXES } from '@/lib/booking/countries'
import { customerRuleErrors, type FieldErrors } from '@/lib/booking/schema'
import { parseEuroToCents } from '@/lib/format'

// Booking entered or edited by staff. Looser than the public form on purpose: a phone
// order may lack the billing address or date of birth, the lead time does not apply and
// staff may set the price by hand.

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const text = (max: number) => z.string().trim().max(max, { message: 'too_long' })
const requiredText = (max: number) => text(max).min(1, { message: 'required' })
const method = z.enum(['transfer', 'terminal', 'cash'], { message: 'required' })

export const staffBookingSchema = z.object({
  vin: z.string().regex(/^[A-Z0-9]{5,20}$/, { message: 'vehicle_required' }),
  pickupDate: z.string().regex(DATE, { message: 'required' }),
  pickupTime: z.string().regex(TIME, { message: 'required' }),
  returnDate: z.string().regex(DATE, { message: 'required' }),
  returnTime: z.string().regex(TIME, { message: 'required' }),
  pickupLocationId: z.string().regex(UUID, { message: 'required' }),
  returnLocationId: z.string().regex(UUID, { message: 'required' }),
  pickupCustom: z.boolean(),
  pickupAddress: text(200),
  pickupOutsideCity: z.boolean(),
  returnCustom: z.boolean(),
  returnAddress: text(200),
  returnOutsideCity: z.boolean(),
  abroadTrip: z.boolean(),
  abroadCountries: text(300),
  firstName: requiredText(80),
  lastName: requiredText(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: 'email_invalid' }).max(254, { message: 'email_invalid' })),
  phonePrefix: z.enum(PHONE_PREFIXES.map((p) => p.dial) as [string, ...string[]], { message: 'required' }),
  phoneNumber: z
    .string()
    .transform((v) => v.replace(/[\s\-()/.]/g, '').replace(/^0+/, ''))
    .pipe(z.string().regex(/^\d{6,12}$/, { message: 'phone_invalid' })),
  dateOfBirth: z.string().regex(DATE, { message: 'required' }).or(z.literal('')),
  isCompany: z.boolean(),
  companyName: text(160),
  ico: text(20),
  dic: text(20),
  icDph: text(20),
  street: text(160),
  city: text(100),
  zip: text(12),
  country: z.enum(COUNTRY_CODES, { message: 'required' }),
  extras: z.record(z.string().regex(UUID), z.number().int().min(0).max(20)),
  rentalPaymentMethod: method,
  depositPaymentMethod: method,
  note: text(2000),
  /** auto = price list; custom = amount entered by staff (needs a reason); keep = leave the stored price (edit only). */
  priceMode: z.enum(['auto', 'custom', 'keep']),
  customPrice: z.string().trim().max(20),
  priceReason: text(300),
  locale: z.enum(['sk', 'en']),
})

export type StaffBookingValues = z.input<typeof staffBookingSchema>
export type StaffBookingData = z.output<typeof staffBookingSchema>
export type StaffFieldErrors = Partial<Record<keyof StaffBookingValues | 'form', string>>

/** Rules across fields; returned together with the per-field errors. */
export function staffRuleErrors(v: StaffBookingValues): StaffFieldErrors {
  const errors: StaffFieldErrors = { ...(customerRuleErrors(v) as FieldErrors) }
  if (v.pickupCustom && v.pickupAddress.trim().length < 5) errors.pickupAddress = 'address_required'
  if (v.returnCustom && v.returnAddress.trim().length < 5) errors.returnAddress = 'address_required'
  if (v.priceMode === 'custom') {
    const cents = parseEuroToCents(v.customPrice)
    if (cents === null) errors.customPrice = 'required'
    else if (Number.isNaN(cents)) errors.customPrice = 'price_invalid'
    if (!v.priceReason.trim()) errors.priceReason = 'required'
  }
  return errors
}

export function staffFieldErrors(error: z.ZodError): StaffFieldErrors {
  const result: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form')
    if (!(key in result)) result[key] = issue.message
  }
  return result as StaffFieldErrors
}

export const STAFF_ERROR_MESSAGES: Record<string, string> = {
  required: 'Toto pole je povinné.',
  too_long: 'Text je príliš dlhý.',
  email_invalid: 'Zadajte platný e-mail.',
  phone_invalid: 'Zadajte číslo bez predvoľby (6 – 12 číslic).',
  phone_length: 'Číslo musí mať 9 číslic bez predvoľby a úvodnej nuly.',
  vehicle_required: 'Vyberte vozidlo.',
  address_required: 'Zadajte celú adresu.',
  ico_invalid: 'Zadajte platné IČO.',
  price_invalid: 'Zadajte sumu v eurách, napr. 450 alebo 450,50.',
  return_before_pickup: 'Odovzdanie musí byť neskôr ako vyzdvihnutie.',
  unavailable: 'Vozidlo je v tomto termíne obsadené (potvrdená rezervácia alebo blokácia).',
  individual_needs_price: 'Pri tejto dĺžke prenájmu cenník cenu neurčuje. Zvoľte „Vlastná cena“, alebo rezerváciu uložte ako novú bez ceny.',
  not_editable: 'Túto rezerváciu už nie je možné upravovať.',
  forbidden: 'Na túto akciu nemáte oprávnenie.',
  unknown: 'Uloženie sa nepodarilo. Skúste to znova.',
}
