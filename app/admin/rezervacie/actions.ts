'use server'

import { revalidatePath } from 'next/cache'
import { dbErrorMessage, staffAction, text, type ActionState } from '@/lib/admin/action'
import { getStaff } from '@/lib/auth/session'
import { issueAuthToken } from '@/lib/auth/tokens'
import { canTransition, isEditable, BLOCKING_STATUSES } from '@/lib/booking-status'
import { buildBookingEmailData } from '@/lib/booking/email-data'
import { notifyBookingCancelled, notifyBookingConfirmed } from '@/lib/booking/notify'
import { buildBookingRecord } from '@/lib/booking/record'
import { fullPhone, termInstants } from '@/lib/booking/schema'
import { staffBookingSchema, staffFieldErrors, staffRuleErrors, type StaffBookingValues, type StaffFieldErrors } from '@/lib/booking/staff-schema'
import { BOOKING_STATUS_LABELS, NEXT_STATUSES, type BookingStatus } from '@/lib/booking/status'
import { cancellationQuote } from '@/lib/cancellation'
import { loadCatalog } from '@/lib/catalog'
import { sendBookingReceived } from '@/lib/email/booking-emails'
import { formatEuro, parseEuroToCents } from '@/lib/format'
import { applyPriceOverride, calculatePrice } from '@/lib/pricing'
import { getSettings } from '@/lib/settings'
import { getSiteOrigin } from '@/lib/site-url'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database'

const UUID = /^[0-9a-f-]{36}$/i

function refresh(id: string) {
  revalidatePath('/admin/rezervacie')
  revalidatePath(`/admin/rezervacie/${id}`)
  revalidatePath('/admin')
}

// ───────────────────────── Status ─────────────────────────

/**
 * Quick status change from the list or the detail (confirm, hand over, complete).
 * The database enforces the transition rules and the double-booking protection and
 * writes the status history. Confirming sends email 3 to the customer.
 * Cancelling has its own action because of the cancellation fee.
 */
export async function changeBookingStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('operator', async ({ supabase }) => {
    const id = text(formData, 'id')
    const to = text(formData, 'to') as BookingStatus
    if (!UUID.test(id)) return { error: 'Rezervácia sa nenašla.' }

    const { data: booking } = await supabase.from('bookings').select('status, total_cents').eq('id', id).maybeSingle()
    if (!booking) return { error: 'Rezervácia sa nenašla.' }
    if (to === 'cancelled' || !NEXT_STATUSES[booking.status].includes(to)) return { error: `Rezerváciu v stave „${BOOKING_STATUS_LABELS[booking.status]}“ takto zmeniť nemožno.` }
    if (to === 'confirmed' && booking.total_cents === null) return { error: 'Rezervácia nemá cenu. Najprv ju doplňte v úprave rezervácie (vlastná cena).' }

    const { error } = await supabase.rpc('change_booking_status', { p_booking_id: id, p_to_status: to, p_note: text(formData, 'note') || undefined })
    if (error) {
      if (error.code === '23P01') return { error: 'Termín koliduje s inou potvrdenou rezerváciou alebo blokáciou vozidla.' }
      return { error: dbErrorMessage(error) }
    }

    refresh(id)
    if (to !== 'confirmed') return { ok: true, message: `Stav zmenený: ${BOOKING_STATUS_LABELS[to]}.` }
    const sent = await notifyBookingConfirmed(supabase, id)
    return { ok: true, message: sent ? 'Rezervácia je potvrdená, zákazník dostal e-mail.' : 'Rezervácia je potvrdená. E-mail zákazníkovi sa neodoslal (odosielanie nie je nastavené alebo zlyhalo).' }
  })
}

/**
 * Cancellation by staff. The fee is pre-calculated from the cancellation tiers; staff
 * may change or waive it, but then a reason is required. Sends email 6.
 */
export async function cancelBookingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('operator', async ({ supabase, userId }) => {
    const id = text(formData, 'id')
    if (!UUID.test(id)) return { error: 'Rezervácia sa nenašla.' }
    const { data: booking } = await supabase.from('bookings').select('status, pickup_at, total_cents').eq('id', id).maybeSingle()
    if (!booking) return { error: 'Rezervácia sa nenašla.' }
    if (!canTransition(booking.status, 'cancelled')) return { error: `Rezerváciu v stave „${BOOKING_STATUS_LABELS[booking.status]}“ už nie je možné zrušiť.` }

    const settings = await getSettings(supabase)
    const quote = cancellationQuote(new Date(booking.pickup_at), booking.total_cents, settings.cancellation_tiers)
    const fee = parseEuroToCents(text(formData, 'fee'))
    if (fee === null || Number.isNaN(fee)) return { error: 'Zadajte storno poplatok v eurách (0, ak ho odpúšťate).' }
    if (booking.total_cents !== null && fee > booking.total_cents) return { error: 'Storno poplatok nemôže byť vyšší ako cena rezervácie.' }
    const feeReason = text(formData, 'feeReason')
    if (fee !== quote.feeCents && !feeReason) return { error: 'Poplatok sa líši od storno podmienok. Uveďte dôvod úpravy.' }
    const reason = text(formData, 'reason')

    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: userId, cancellation_reason: reason || null, cancellation_fee_cents: fee })
      .eq('id', id)
    if (error) return { error: dbErrorMessage(error) }
    if (fee !== quote.feeCents) {
      await supabase.from('booking_notes').insert({ booking_id: id, author_id: userId, body: `Storno poplatok upravený z ${formatEuro(quote.feeCents)} na ${formatEuro(fee)}. Dôvod: ${feeReason}` })
    }

    refresh(id)
    const sent = await notifyBookingCancelled(supabase, id, 'staff')
    return { ok: true, message: sent ? 'Rezervácia je zrušená, zákazník dostal e-mail.' : 'Rezervácia je zrušená. E-mail zákazníkovi sa neodoslal (odosielanie nie je nastavené alebo zlyhalo).' }
  })
}

// ───────────────────────── Internal notes ─────────────────────────

export async function addBookingNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('operator', async ({ supabase, userId }) => {
    const id = text(formData, 'id')
    const body = text(formData, 'body')
    if (!UUID.test(id)) return { error: 'Rezervácia sa nenašla.' }
    if (!body) return { error: 'Napíšte text poznámky.' }
    if (body.length > 4000) return { error: 'Poznámka je príliš dlhá.' }
    const { error } = await supabase.from('booking_notes').insert({ booking_id: id, author_id: userId, body })
    if (error) return { error: dbErrorMessage(error) }
    revalidatePath(`/admin/rezervacie/${id}`)
    return { ok: true, message: 'Poznámka uložená.' }
  })
}

// ───────────────────────── Create / edit ─────────────────────────

/** `redirectTo` is returned instead of calling redirect(); see BookingActionResult. */
export type StaffBookingResult = { errors: StaffFieldErrors; redirectTo?: string }
const fail = (errors: StaffFieldErrors): StaffBookingResult => ({ errors })

/** Validates the form and builds the booking record with a server-side price. */
async function prepare(values: StaffBookingValues, supabase: Awaited<ReturnType<typeof createClient>>, requirePrice: boolean, stored?: { totalCents: number | null; reason: string | null }) {
  const parsed = staffBookingSchema.safeParse(values)
  const errors = { ...staffRuleErrors(values), ...(parsed.success ? {} : staffFieldErrors(parsed.error)) }
  if (!parsed.success || Object.keys(errors).length > 0) return { errors }
  const data = parsed.data

  const [catalog, settings] = await Promise.all([loadCatalog(), getSettings(supabase)])
  const vehicle = catalog.vehicles.find((v) => v.vin === data.vin)
  if (!vehicle) return { errors: { vin: 'vehicle_required' } as StaffFieldErrors }
  const pickupLocation = catalog.locations.find((l) => l.id === data.pickupLocationId)
  const returnLocation = catalog.locations.find((l) => l.id === data.returnLocationId)
  if (!pickupLocation) return { errors: { pickupLocationId: 'required' } as StaffFieldErrors }
  if (!returnLocation) return { errors: { returnLocationId: 'required' } as StaffFieldErrors }

  const instants = termInstants(data)
  if (!instants || instants.returnAt <= instants.pickupAt) return { errors: { returnDate: 'return_before_pickup' } as StaffFieldErrors }
  const { pickupAt, returnAt } = instants
  const pickupAddress = data.pickupCustom ? data.pickupAddress : null
  const returnAddress = data.returnCustom ? data.returnAddress : null

  let price = calculatePrice({
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
  if (data.priceMode === 'custom') price = applyPriceOverride(price, parseEuroToCents(data.customPrice)!)
  // "Keep": an edit that should not touch the agreed price (the price list may have changed since).
  const keep = data.priceMode === 'keep' && stored && stored.totalCents !== null
  if (keep) price = applyPriceOverride(price, stored.totalCents!)
  if (price.totalCents === null && requirePrice) return { errors: { priceMode: 'individual_needs_price' } as StaffFieldErrors }

  const phone = fullPhone(data.phonePrefix, data.phoneNumber)
  const company = data.isCompany ? { company_name: data.companyName, ico: data.ico, dic: data.dic || null, ic_dph: data.icDph || null } : { company_name: null, ico: null, dic: null, ic_dph: null }
  const profile = {
    first_name: data.firstName,
    last_name: data.lastName,
    phone,
    date_of_birth: data.dateOfBirth || null,
    is_company: data.isCompany,
    ...company,
    billing_address: { street: data.street, city: data.city, zip: data.zip, country: data.country },
    locale: data.locale,
  }
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
    priceOverrideReason: data.priceMode === 'custom' ? data.priceReason : keep ? stored.reason : null,
    toleranceMinutes: settings.return_tolerance_minutes,
    customerSnapshot: { ...profile, email: data.email },
    note: data.note,
    rentalPaymentMethod: data.rentalPaymentMethod,
    depositPaymentMethod: data.depositPaymentMethod,
    locale: data.locale,
    abroadTrip: data.abroadTrip,
    abroadCountries: data.abroadCountries,
  })
  return { data, vehicle, settings, price, profile, phone, record, pickupAt, returnAt, pickupLocation, returnLocation, pickupAddress, returnAddress }
}

/**
 * Booking entered by staff (phone order). Same price calculation as the public form;
 * it may start as confirmed and the customer email is optional.
 */
export async function createStaffBookingAction(values: StaffBookingValues, options: { status: 'new' | 'confirmed'; sendEmail: boolean }): Promise<StaffBookingResult> {
  const staff = await getStaff('manager')
  if (!staff) return fail({ form: 'forbidden' })
  const supabase = await createClient()
  const status = options.status === 'confirmed' ? 'confirmed' : 'new'
  const prepared = await prepare(values, supabase, status === 'confirmed')
  if ('errors' in prepared) return fail(prepared.errors as StaffFieldErrors)
  const { data, vehicle, settings, price, profile, record, pickupAt, returnAt } = prepared

  const { data: available } = await supabase.rpc('is_vehicle_available', { p_vehicle_id: vehicle.id, p_pickup_at: pickupAt.toISOString(), p_return_at: returnAt.toISOString() })
  if (!available) return fail({ pickupDate: 'unavailable' })

  // The account is created with the service role; the permission was checked above.
  const admin = createAdminClient()
  const { data: existing } = await admin.from('profiles').select('id, password_set').ilike('email', data.email.replace(/[%_\\]/g, '\\$&')).is('anonymized_at', null).maybeSingle()
  let customerId = existing?.id
  const createdAccount = !existing
  if (!customerId) {
    const { data: created, error } = await admin.auth.admin.createUser({ email: data.email, email_confirm: true, user_metadata: { first_name: data.firstName, last_name: data.lastName, locale: data.locale } })
    if (error || !created.user) return fail({ email: 'unknown' })
    customerId = created.user.id
  }

  const { data: created, error } = await admin.rpc('create_booking', {
    p: {
      customer_id: customerId,
      update_profile: createdAccount,
      profile,
      ...record,
      consents: [],
      created_by_staff_id: staff.id,
      status,
      ip: '',
      user_agent: 'admin',
    } as unknown as Json,
  })
  if (error || !created) {
    if (createdAccount) {
      await admin.auth.admin.deleteUser(customerId).catch(() => undefined)
      await admin.from('profiles').delete().eq('id', customerId)
    }
    if (error?.message.includes('vehicle_unavailable') || error?.code === '23P01') return fail({ pickupDate: 'unavailable' })
    console.error('staff booking failed', error?.message)
    return fail({ form: 'unknown' })
  }
  const result = created as { id: string; number: string }

  if (options.sendEmail) {
    try {
      if (status === 'confirmed') {
        await notifyBookingConfirmed(supabase, result.id)
      } else {
        const origin = await getSiteOrigin()
        const prefix = data.locale === 'en' ? '/en' : ''
        let account: { kind: 'set_password' | 'login'; url: string }
        if (existing?.password_set) account = { kind: 'login', url: `${origin}${prefix}/prihlasenie` }
        else account = { kind: 'set_password', url: `${origin}${prefix}/nastavit-heslo?${new URLSearchParams({ token: (await issueAuthToken(customerId, 'set_password', staff.id)).token, next: `${prefix}/moj-ucet` })}` }
        await sendBookingReceived(
          {
            booking: buildBookingEmailData({
              locale: data.locale,
              number: result.number,
              price,
              customer: { firstName: data.firstName, lastName: data.lastName, email: data.email, phone: prepared.phone, companyName: data.isCompany ? data.companyName : null },
              vehicleName: vehicle.name,
              pickupAt,
              returnAt,
              pickupLocation: prepared.pickupLocation,
              returnLocation: prepared.returnLocation,
              pickupAddress: prepared.pickupAddress,
              returnAddress: prepared.returnAddress,
              deliveryOutsideCity: !!record.booking.price_snapshot.delivery_outside_city,
              depositCents: vehicle.depositCents,
              kmLimitPerDay: vehicle.kmLimitPerDay,
              extraKmCents: vehicle.extraKmCents,
              rentalPaymentMethod: data.rentalPaymentMethod,
              depositPaymentMethod: data.depositPaymentMethod,
              note: data.note || null,
              abroadTrip: data.abroadTrip,
              abroadCountries: data.abroadCountries || null,
              company: settings.company,
            }),
            account,
            termsUrl: settings.terms_url,
          },
          { bookingId: result.id, profileId: customerId },
        )
      }
    } catch (e) {
      console.error('staff booking email failed', e)
    }
  }

  refresh(result.id)
  return { errors: {}, redirectTo: `/admin/rezervacie/${result.id}` }
}

/** Saves an edited booking (term, vehicle, places, extras, customer data, price). The status is not changed. */
export async function updateBookingAction(id: string, values: StaffBookingValues): Promise<StaffBookingResult> {
  const staff = await getStaff('manager')
  if (!staff) return fail({ form: 'forbidden' })
  if (!UUID.test(id)) return fail({ form: 'unknown' })
  const supabase = await createClient()
  const { data: booking } = await supabase.from('bookings').select('status, customer_snapshot, total_cents, price_override_reason').eq('id', id).maybeSingle()
  if (!booking) return fail({ form: 'unknown' })
  if (!isEditable(booking.status)) return fail({ form: 'not_editable' })

  // The customer's email identifies the account and cannot be changed here.
  const email = ((booking.customer_snapshot ?? {}) as { email?: string }).email ?? values.email
  const prepared = await prepare({ ...values, email }, supabase, booking.status !== 'new', { totalCents: booking.total_cents, reason: booking.price_override_reason })
  if ('errors' in prepared) return fail(prepared.errors as StaffFieldErrors)
  const { vehicle, record, pickupAt, returnAt } = prepared

  if (BLOCKING_STATUSES.includes(booking.status)) {
    const { data: available } = await supabase.rpc('is_vehicle_available', { p_vehicle_id: vehicle.id, p_pickup_at: pickupAt.toISOString(), p_return_at: returnAt.toISOString(), p_exclude_booking_id: id })
    if (!available) return fail({ pickupDate: 'unavailable' })
  }

  const { error } = await supabase.rpc('staff_update_booking', {
    p_booking_id: id,
    p: { booking: { ...record.booking, customer_snapshot: { ...(booking.customer_snapshot as object), ...record.booking.customer_snapshot } }, extras: record.extras } as unknown as Json,
  })
  if (error) {
    if (error.code === '23P01') return fail({ pickupDate: 'unavailable' })
    if (error.message.includes('booking_not_editable')) return fail({ form: 'not_editable' })
    console.error('booking update failed', error.code, error.message)
    return fail({ form: error.code === '42501' ? 'forbidden' : 'unknown' })
  }

  refresh(id)
  return { errors: {}, redirectTo: `/admin/rezervacie/${id}` }
}
