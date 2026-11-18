'use server'

import { isValidIban, normalizeIban } from '@/lib/iban'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'
import { localizedPath } from '@/i18n/routing'
import { newPasswordSchema } from '@/lib/auth/password'
import { getClientIp, rateLimit } from '@/lib/auth/rate-limit'
import { getSessionUser } from '@/lib/auth/session'
import { customerEditBlock } from '@/lib/booking/change'
import { COUNTRY_CODES, PHONE_PREFIXES } from '@/lib/booking/countries'
import { notifyBookingCancelled, notifyBookingChangeRequested } from '@/lib/booking/notify'
import { buildBookingRecord } from '@/lib/booking/record'
import { customerRuleErrors, fieldErrors, fullPhone, termInstants, termSchema, validateTerm, type FieldErrors, type PaymentMethod, type TermInput } from '@/lib/booking/schema'
import { createPublicClient, loadCatalog } from '@/lib/catalog'
import { calculatePrice } from '@/lib/pricing'
import { createAdminClient, createStatelessClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database'
import { isPwnedPassword } from '@/lib/auth/pwned'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Result of the simple account forms: an error code (translated in the UI) or success. */
export type AccountState = { error?: string; ok?: boolean; feeCents?: number }

function field(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

// ───────────────────────── Cancellation ─────────────────────────

/**
 * The customer cancels their own booking. The fee is calculated in the database
 * (cancel_my_booking) from the cancellation tiers – nothing sent by the browser decides it.
 */
export async function cancelMyBookingAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getSessionUser()
  if (!user) return { error: 'forbidden' }
  const id = field(formData, 'id')
  if (!UUID.test(id)) return { error: 'unknown' }
  if (formData.get('confirm') !== 'on') return { error: 'confirm_required' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('cancel_my_booking', { p_booking_id: id, p_reason: field(formData, 'reason').slice(0, 500) || undefined })
  if (error || !data) {
    if (error?.message.includes('booking_not_cancellable')) return { error: 'not_cancellable' }
    console.error('customer cancellation failed', error?.message)
    return { error: 'unknown' }
  }

  // Emails need settings and vehicle data the customer cannot read: use the service role.
  after(async () => {
    try {
      await notifyBookingCancelled(createAdminClient(), id, 'customer')
    } catch (e) {
      console.error('cancellation email failed', e)
    }
  })
  revalidatePath('/[locale]/moj-ucet', 'layout')
  return { ok: true, feeCents: data.cancellation_fee_cents ?? 0 }
}

// ───────────────────────── Change of a booking ─────────────────────────

const editSchema = z.object({
  extras: z.record(z.string().regex(UUID), z.number().int().min(0).max(20)),
  note: z.string().trim().max(2000, { message: 'too_long' }),
})

export type BookingEditValues = TermInput & { extras: Record<string, number>; note: string }
export type BookingEditResult = { errors: FieldErrors; redirectTo?: string }
const fail = (errors: FieldErrors): BookingEditResult => ({ errors })

/**
 * The customer changes the term, places, extras or note of their booking.
 *   new        → the booking is rewritten and stays new
 *   confirmed  → the proposal waits for approval (`modified`); the original stays valid
 * The price is recalculated here from the current price list.
 */
export async function updateMyBookingAction(id: string, values: BookingEditValues, localeInput: string): Promise<BookingEditResult> {
  const locale = localeInput === 'en' ? 'en' : 'sk'
  const user = await getSessionUser()
  if (!user) return fail({ form: 'forbidden' })
  if (!UUID.test(id)) return fail({ form: 'unknown' })

  const term = termSchema.safeParse(values)
  const rest = editSchema.safeParse(values)
  if (!term.success) return fail(fieldErrors(term.error))
  if (!rest.success) return fail(fieldErrors(rest.error))
  const data = { ...term.data, ...rest.data }

  const ip = await getClientIp()
  if (!(await rateLimit(`booking-edit:${user.id}:${ip}`, 20, 3600))) return fail({ form: 'rate_limited' })

  // RLS: the session client returns the booking only to its owner.
  const supabase = await createClient()
  const [{ data: booking }, { data: extras }, catalog] = await Promise.all([
    supabase.from('bookings').select('*').eq('id', id).eq('customer_id', user.id).maybeSingle(),
    supabase.from('booking_extras').select('name_snapshot, quantity').eq('booking_id', id),
    loadCatalog(),
  ])
  if (!booking) return fail({ form: 'unknown' })
  const { settings } = catalog
  const block = customerEditBlock(booking, settings.modification_deadline_hours)
  if (block) return fail({ form: `edit_${block}` })

  const vehicle = catalog.vehicles.find((v) => v.id === booking.vehicle_id)
  if (!vehicle) return fail({ form: 'edit_manual_price' })
  const pickupLocation = catalog.locations.find((l) => l.id === data.pickupLocationId && l.forPickup)
  const returnLocation = catalog.locations.find((l) => l.id === data.returnLocationId && l.forReturn)
  if (!pickupLocation) return fail({ pickupLocationId: 'required' })
  if (!returnLocation) return fail({ returnLocationId: 'required' })

  const termErrors = validateTerm(data, { minLeadHours: settings.min_lead_hours, minRentalDays: settings.min_rental_days, toleranceMinutes: settings.return_tolerance_minutes })
  if (Object.keys(termErrors).length > 0) return fail(termErrors)
  const { pickupAt, returnAt } = termInstants(data)!
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
  // A long rental needs an individual price – that is arranged with staff, not online.
  if (price.totalCents === null) return fail({ returnDate: 'edit_individual' })

  const { data: available } = await createPublicClient().rpc('is_vehicle_available', {
    p_vehicle_id: vehicle.id,
    p_pickup_at: pickupAt.toISOString(),
    p_return_at: returnAt.toISOString(),
    p_exclude_booking_id: id,
  })
  if (!available) return fail({ pickupDate: 'unavailable' })

  const record = buildBookingRecord({
    vehicle,
    pickupAt,
    returnAt,
    pickupLocation,
    returnLocation,
    pickupAddress,
    returnAddress,
    deliveryOutsideCity: (data.pickupCustom && data.pickupOutsideCity) || (data.returnCustom && data.returnOutsideCity),
    price,
    toleranceMinutes: settings.return_tolerance_minutes,
    customerSnapshot: (booking.customer_snapshot ?? {}) as Record<string, unknown>,
    note: data.note,
    rentalPaymentMethod: booking.rental_payment_method as PaymentMethod,
    depositPaymentMethod: booking.deposit_payment_method as PaymentMethod,
    locale: booking.locale === 'en' ? 'en' : 'sk',
    abroadTrip: data.abroadTrip,
    abroadCountries: data.abroadCountries,
  })

  const admin = createAdminClient()
  const { error } = await admin.rpc('customer_update_booking', { p_booking_id: id, p_customer_id: user.id, p: record as unknown as Json })
  if (error) {
    if (error.code === '23P01') return fail({ pickupDate: 'unavailable' })
    console.error('customer booking change failed', error.code, error.message)
    return fail({ form: error.message.includes('booking_not_editable') ? 'edit_status' : 'unknown' })
  }

  after(async () => {
    try {
      await notifyBookingChangeRequested(admin, id, { booking, extras: extras ?? [] }, false)
    } catch (e) {
      console.error('change email failed', e)
    }
  })
  revalidatePath('/[locale]/moj-ucet', 'layout')
  return { errors: {}, redirectTo: `${localizedPath(locale, `/moj-ucet/rezervacie/${id}`)}?zmena=${booking.status === 'confirmed' ? 'caka' : 'ulozena'}` }
}

// ───────────────────────── Profile ─────────────────────────

const profileSchema = z.object({
  firstName: z.string().trim().min(1, { message: 'required' }).max(80),
  lastName: z.string().trim().min(1, { message: 'required' }).max(80),
  phonePrefix: z.enum(PHONE_PREFIXES.map((p) => p.dial) as [string, ...string[]], { message: 'required' }),
  phoneNumber: z
    .string()
    .transform((v) => v.replace(/[\s\-()/.]/g, '').replace(/^0+/, ''))
    .pipe(z.string().regex(/^\d{6,12}$/, { message: 'phone_invalid' })),
  isCompany: z.boolean(),
  companyName: z.string().trim().max(160),
  ico: z.string().trim().max(20),
  dic: z.string().trim().max(20),
  icDph: z.string().trim().max(20),
  street: z.string().trim().max(160),
  city: z.string().trim().max(100),
  zip: z.string().trim().max(12),
  country: z.enum(COUNTRY_CODES, { message: 'required' }),
  // Account for returning the deposit; optional, validated as an IBAN when filled in.
  refundIban: z
    .string()
    .transform((v) => normalizeIban(v))
    .refine((v) => v === '' || isValidIban(v), { message: 'iban_invalid' }),
})
export type ProfileValues = z.input<typeof profileSchema>
export type ProfileResult = { errors: Partial<Record<keyof ProfileValues | 'form', string>>; ok?: boolean }

/** Contact and billing data of the signed-in customer (RLS: own row only; the email cannot be changed here). */
export async function updateProfileAction(values: ProfileValues): Promise<ProfileResult> {
  const user = await getSessionUser()
  if (!user) return { errors: { form: 'forbidden' } }
  const parsed = profileSchema.safeParse(values)
  const errors: ProfileResult['errors'] = { ...(customerRuleErrors(values) as ProfileResult['errors']) }
  if (!parsed.success) for (const issue of parsed.error.issues) errors[String(issue.path[0]) as keyof ProfileValues] ??= issue.message
  if (!parsed.success || Object.keys(errors).length > 0) return { errors }
  const data = parsed.data

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({
      first_name: data.firstName,
      last_name: data.lastName,
      phone: fullPhone(data.phonePrefix, data.phoneNumber),
      is_company: data.isCompany,
      company_name: data.isCompany ? data.companyName : null,
      ico: data.isCompany ? data.ico : null,
      dic: data.isCompany ? data.dic || null : null,
      ic_dph: data.isCompany ? data.icDph || null : null,
      billing_address: { street: data.street, city: data.city, zip: data.zip, country: data.country },
      refund_iban: data.refundIban || null,
    })
    .eq('id', user.id)
  if (error) {
    console.error('profile update failed', error.message)
    return { errors: { form: 'unknown' } }
  }
  revalidatePath('/[locale]/moj-ucet', 'layout')
  return { errors: {}, ok: true }
}

export async function changeMyPasswordAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getSessionUser()
  if (!user) return { error: 'forbidden' }
  const ip = await getClientIp()
  if (!(await rateLimit(`changepw:${user.id}:${ip}`, 8, 15 * 60))) return { error: 'rate_limited' }

  const parsed = newPasswordSchema.safeParse({ password: formData.get('password'), passwordConfirm: formData.get('passwordConfirm') })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'unknown' }

  // Re-authenticate with the current password without touching the session cookies.
  const current = formData.get('currentPassword')
  const check = await createStatelessClient().auth.signInWithPassword({ email: user.email, password: typeof current === 'string' ? current : '' })
  if (check.error) return { error: 'current_password_wrong' }
  if (await isPwnedPassword(parsed.data.password)) return { error: 'password_pwned' }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { error: 'password_rejected' }
  await supabase.from('profiles').update({ password_set: true }).eq('id', user.id)
  return { ok: true }
}

/** GDPR: the customer asks for their account to be deleted; staff carry it out (deletion or anonymisation). */
export async function requestAccountDeletionAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getSessionUser()
  if (!user) return { error: 'forbidden' }
  if (formData.get('confirm') !== 'on') return { error: 'confirm_required' }
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ deletion_requested_at: new Date().toISOString() }).eq('id', user.id)
  if (error) return { error: 'unknown' }
  revalidatePath('/[locale]/moj-ucet', 'layout')
  return { ok: true }
}
