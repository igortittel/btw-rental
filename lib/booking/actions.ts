'use server'

import { after } from 'next/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { localizedPath } from '@/i18n/routing'
import { getClientIp, rateLimit } from '@/lib/auth/rate-limit'
import { getSessionUser } from '@/lib/auth/session'
import { issueAuthToken } from '@/lib/auth/tokens'
import { buildBookingEmailData } from '@/lib/booking/email-data'
import {
  bookingSchema,
  fieldErrors,
  fullPhone,
  termInstants,
  termSchema,
  validateDriverAge,
  validateTerm,
  type BookingFormState,
  type FieldErrors,
  type TermInput,
} from '@/lib/booking/schema'
import { createPublicClient, getCatalog, loadCatalog } from '@/lib/catalog'
import { sendBookingAdminNotification, sendBookingReceived } from '@/lib/email/booking-emails'
import { calculatePrice } from '@/lib/pricing'
import { getSettings } from '@/lib/settings'
import { getSiteOrigin } from '@/lib/site-url'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyTurnstile } from '@/lib/turnstile'
import type { Json } from '@/types/database'

export type BookingActionResult = { errors: FieldErrors }

const fail = (errors: FieldErrors): BookingActionResult => ({ errors })

/**
 * Step 1 → 2: is the term valid and the vehicle free? Uses only the public RPC, so it
 * reveals nothing beyond what the availability calendar already shows.
 */
export async function checkTermAction(input: TermInput): Promise<BookingActionResult> {
  const parsed = termSchema.safeParse(input)
  if (!parsed.success) return fail(fieldErrors(parsed.error))

  const catalog = await getCatalog()
  const vehicle = catalog.vehicles.find((v) => v.vin === parsed.data.vin)
  if (!vehicle) return fail({ vin: 'vehicle_required' })

  const rules = { minLeadHours: catalog.settings.min_lead_hours, minRentalDays: catalog.settings.min_rental_days, toleranceMinutes: catalog.settings.return_tolerance_minutes }
  const termErrors = validateTerm(parsed.data, rules)
  if (Object.keys(termErrors).length > 0) return fail(termErrors)

  const { pickupAt, returnAt } = termInstants(parsed.data)!
  const { data: available, error } = await createPublicClient().rpc('is_vehicle_available', {
    p_vehicle_id: vehicle.id,
    p_pickup_at: pickupAt.toISOString(),
    p_return_at: returnAt.toISOString(),
  })
  if (error) return fail({ form: 'unknown' })
  return available ? { errors: {} } : fail({ pickupDate: 'unavailable' })
}

export type CreateBookingInput = BookingFormState & {
  locale: string
  /** Honeypot – real visitors never see or fill this field. */
  website: string
  /** When the form was opened (ms since epoch); bots submit instantly. */
  startedAt: number
  turnstileToken: string | null
}

const MIN_FILL_MS = 4000

/**
 * Creates a booking from the public form. Everything is validated again here and the
 * price is calculated on the server from current data – the browser never sends a price.
 */
export async function createBookingAction(input: CreateBookingInput): Promise<BookingActionResult> {
  const locale: 'sk' | 'en' = input.locale === 'en' ? 'en' : 'sk'

  // ── Anti-spam ──
  if (input.website || !Number.isFinite(input.startedAt) || Date.now() - input.startedAt < MIN_FILL_MS) return fail({ form: 'spam' })
  const parsed = bookingSchema.safeParse(input)
  if (!parsed.success) return fail(fieldErrors(parsed.error))
  const data = parsed.data

  const ip = await getClientIp()
  const [ipOk, emailOk] = await Promise.all([rateLimit(`booking:ip:${ip}`, 10, 3600), rateLimit(`booking:email:${data.email}`, 5, 3600)])
  if (!ipOk || !emailOk) return fail({ form: 'rate_limited' })
  if (!(await verifyTurnstile(input.turnstileToken, ip))) return fail({ form: 'captcha_failed' })

  // ── Current data (never the 5-minute cache) ──
  const admin = createAdminClient()
  const [catalog, settings] = await Promise.all([loadCatalog(), getSettings(admin)])
  const vehicle = catalog.vehicles.find((v) => v.vin === data.vin)
  if (!vehicle) return fail({ vin: 'vehicle_required' })

  const defaultLocation = catalog.locations.find((l) => l.isDefault) ?? catalog.locations[0]
  const pickupLocation = catalog.locations.find((l) => l.id === data.pickupLocationId && l.forPickup)
  const returnLocation = catalog.locations.find((l) => l.id === data.returnLocationId && l.forReturn)
  if (!defaultLocation || !pickupLocation) return fail({ pickupLocationId: 'required' })
  if (!returnLocation) return fail({ returnLocationId: 'required' })

  const termErrors = validateTerm(data, { minLeadHours: settings.min_lead_hours, minRentalDays: settings.min_rental_days, toleranceMinutes: settings.return_tolerance_minutes })
  if (Object.keys(termErrors).length > 0) return fail(termErrors)
  const ageErrors = validateDriverAge(data.dateOfBirth, data.pickupDate, vehicle.minDriverAge)
  if (Object.keys(ageErrors).length > 0) return fail(ageErrors)
  if (!settings.payment_methods.includes(data.rentalPaymentMethod)) return fail({ rentalPaymentMethod: 'required' })
  if (!settings.payment_methods.includes(data.depositPaymentMethod)) return fail({ depositPaymentMethod: 'required' })

  const { pickupAt, returnAt } = termInstants(data)!
  // Own address: the vehicle is delivered / collected there. The standard location stays
  // as the base; the fee depends on the distance and is added by staff before confirming.
  const pickupAddress = data.pickupCustom ? data.pickupAddress : null
  const returnAddress = data.returnCustom ? data.returnAddress : null
  const price = calculatePrice({
    pickupAt,
    returnAt,
    tiers: vehicle.prices,
    extras: vehicle.extras.filter((extra) => (data.extras[extra.id] ?? 0) > 0).map((extra) => ({ extra, quantity: data.extras[extra.id] })),
    pickupSurchargeCents: pickupAddress ? 0 : pickupLocation.surchargeCents,
    returnSurchargeCents: returnAddress ? 0 : returnLocation.surchargeCents,
    vatRate: settings.vat_rate,
    toleranceMinutes: settings.return_tolerance_minutes,
    individualFromDays: settings.individual_price_from_days,
  })

  // Checked before an account is created, and again inside create_booking().
  const { data: available } = await admin.rpc('is_vehicle_available', { p_vehicle_id: vehicle.id, p_pickup_at: pickupAt.toISOString(), p_return_at: returnAt.toISOString() })
  if (!available) return fail({ pickupDate: 'unavailable' })

  // ── Customer account ──
  const sessionUser = await getSessionUser()
  const { data: existing } = await admin
    .from('profiles')
    .select('id, password_set, anonymized_at')
    .ilike('email', data.email.replace(/[%_\\]/g, '\\$&'))
    .is('anonymized_at', null)
    .maybeSingle()

  let customerId: string
  let createdAccount = false
  let passwordSet = existing?.password_set ?? false
  // The profile is written only for a new account or by its signed-in owner; an
  // anonymous visitor must not be able to rewrite somebody else's contact data.
  let updateProfile = false
  if (existing) {
    customerId = existing.id
    updateProfile = sessionUser?.id === existing.id
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: data.email,
      email_confirm: true,
      user_metadata: { first_name: data.firstName, last_name: data.lastName, locale },
    })
    if (error || !created.user) {
      console.error('booking: could not create account', error?.message)
      return fail({ form: 'unknown' })
    }
    customerId = created.user.id
    createdAccount = true
    passwordSet = false
    updateProfile = true
  }

  const phone = fullPhone(data.phonePrefix, data.phoneNumber)
  const billingAddress = { street: data.street, city: data.city, zip: data.zip, country: data.country }
  const company = data.isCompany ? { company_name: data.companyName, ico: data.ico, dic: data.dic || null, ic_dph: data.icDph || null } : { company_name: null, ico: null, dic: null, ic_dph: null }
  const profile = { first_name: data.firstName, last_name: data.lastName, phone, date_of_birth: data.dateOfBirth, is_company: data.isCompany, ...company, billing_address: billingAddress, locale }

  const requestHeaders = await headers()
  const payload = {
    customer_id: customerId,
    update_profile: updateProfile,
    profile,
    booking: {
      vehicle_id: vehicle.id,
      pickup_at: pickupAt.toISOString(),
      return_at: returnAt.toISOString(),
      pickup_location_id: pickupLocation.id,
      return_location_id: returnLocation.id,
      pickup_custom_address: pickupAddress ?? '',
      return_custom_address: returnAddress ?? '',
      customer_note: data.note,
      customer_snapshot: { ...profile, email: data.email },
      days: price.days,
      // Snapshot: later changes of the price list never affect this booking.
      price_snapshot: {
        ...price,
        tolerance_minutes: settings.return_tolerance_minutes,
        vehicle: { id: vehicle.id, vin: vehicle.vin, name: vehicle.name },
        pickup_location: { id: pickupLocation.id, name: pickupLocation.name, address: pickupLocation.address },
        return_location: { id: returnLocation.id, name: returnLocation.name, address: returnLocation.address },
        pickup_custom_address: pickupAddress,
        return_custom_address: returnAddress,
        delivery_fee_pending: !!(pickupAddress || returnAddress),
        min_driver_age: vehicle.minDriverAge,
        min_license_months: vehicle.minLicenseMonths,
      },
      subtotal_cents: price.rentalCents,
      total_cents: price.totalCents,
      vat_rate: price.vatRate,
      is_individual_price: price.isIndividual,
      deposit_cents: vehicle.depositCents,
      rental_payment_method: data.rentalPaymentMethod,
      deposit_payment_method: data.depositPaymentMethod,
      km_limit_per_day: vehicle.kmLimitPerDay,
      extra_km_cents: vehicle.extraKmCents,
      locale,
      abroad_trip: data.abroadTrip,
      abroad_countries: data.abroadTrip ? data.abroadCountries : '',
    },
    extras: price.extras.map((line) => ({
      extra_id: line.extraId,
      name_snapshot: line.name,
      quantity: line.quantity,
      unit_price_cents: line.unitPriceCents,
      pricing_type: line.pricingType,
      total_cents: line.totalCents,
    })),
    consents: [
      { type: 'terms', version: settings.terms_version },
      { type: 'gdpr', version: settings.gdpr_version },
      { type: 'deposit', version: settings.terms_version },
      { type: 'km_limit', version: settings.terms_version },
      { type: 'license', version: settings.terms_version },
      { type: 'marketing', version: settings.gdpr_version, granted: data.marketingConsent },
    ],
    ip: ip === 'unknown' ? '' : ip,
    user_agent: requestHeaders.get('user-agent') ?? '',
  }

  const { data: created, error: createError } = await admin.rpc('create_booking', { p: payload as unknown as Json })
  if (createError || !created) {
    // Do not leave behind an account that has no booking.
    if (createdAccount) {
      await admin.auth.admin.deleteUser(customerId).catch(() => undefined)
      await admin.from('profiles').delete().eq('id', customerId)
    }
    if (createError?.message.includes('vehicle_unavailable')) return fail({ pickupDate: 'unavailable' })
    console.error('booking: create_booking failed', createError?.message)
    return fail({ form: 'unknown' })
  }
  const result = created as { id: string; number: string; pending_overlaps: number; is_blacklisted: boolean }

  // ── Emails 1 and 2 – sent after the response; a failed email never loses a booking ──
  const origin = await getSiteOrigin()
  after(async () => {
    try {
      const emailInput = {
        locale,
        number: result.number,
        price,
        customer: { firstName: data.firstName, lastName: data.lastName, email: data.email, phone, companyName: data.isCompany ? data.companyName : null },
        vehicleName: vehicle.name,
        pickupAt,
        returnAt,
        pickupLocation,
        returnLocation,
        pickupAddress,
        returnAddress,
        depositCents: vehicle.depositCents,
        kmLimitPerDay: vehicle.kmLimitPerDay,
        extraKmCents: vehicle.extraKmCents,
        rentalPaymentMethod: data.rentalPaymentMethod,
        depositPaymentMethod: data.depositPaymentMethod,
        note: data.note || null,
        abroadTrip: data.abroadTrip,
        abroadCountries: data.abroadCountries || null,
        company: settings.company,
      }
      const accountPath = localizedPath(locale, '/moj-ucet')
      let account: { kind: 'set_password' | 'login'; url: string }
      if (passwordSet) {
        account = { kind: 'login', url: `${origin}${localizedPath(locale, '/prihlasenie')}?next=${encodeURIComponent(accountPath)}` }
      } else {
        const { token } = await issueAuthToken(customerId, 'set_password')
        account = { kind: 'set_password', url: `${origin}${localizedPath(locale, '/nastavit-heslo')}?${new URLSearchParams({ token, next: accountPath })}` }
      }
      await Promise.all([
        sendBookingReceived({ booking: buildBookingEmailData(emailInput), account, termsUrl: settings.terms_url }, { bookingId: result.id, profileId: customerId }),
        sendBookingAdminNotification(
          {
            booking: buildBookingEmailData(emailInput, 'sk'),
            adminUrl: `${origin}/admin/rezervacie/${result.id}`,
            pendingOverlaps: result.pending_overlaps,
            isBlacklisted: result.is_blacklisted,
            isNewCustomer: createdAccount,
          },
          settings.admin_notification_emails,
          { bookingId: result.id },
        ),
      ])
    } catch (e) {
      console.error('booking: emails failed', e)
    }
  })

  const query = new URLSearchParams({ cislo: result.number })
  if (price.isIndividual) query.set('typ', 'dopyt')
  redirect(`${localizedPath(locale, '/rezervacia/dakujeme')}?${query}`)
}
