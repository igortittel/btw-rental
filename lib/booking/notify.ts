import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { localizedPath } from '@/i18n/routing'
import { bookingEmailDataFromRow } from '@/lib/booking/email-data'
import { describeBookingChange, type ChangeableBooking } from '@/lib/booking/change'
import { sendBookingCancelled, sendBookingChangeRequested, sendBookingChangeResolved, sendBookingConfirmed, sendDocumentAvailable, sendProtocolSigned, sendSettlement } from '@/lib/email/booking-emails'
import { DOCUMENTS_BUCKET, DOCUMENT_TYPE_LABELS, documentFileName } from '@/lib/documents'
import { formatEuro } from '@/lib/format'
import { buildIcs } from '@/lib/ics'
import { formatIban, paymentDueDate, variableSymbol } from '@/lib/payment'
import { fuelLabel, usesFuel } from '@/lib/protocol/model'
import { depositOutcome, settlementLines } from '@/lib/settlement'
import { getSettings } from '@/lib/settings'
import { getSiteOrigin } from '@/lib/site-url'
import { formatDate, formatDateTime } from '@/lib/time'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

async function load(supabase: Client, bookingId: string) {
  const [{ data: booking }, settings, origin] = await Promise.all([
    supabase.from('bookings').select('*, vehicles(name)').eq('id', bookingId).maybeSingle(),
    getSettings(supabase),
    getSiteOrigin(),
  ])
  return booking ? { booking, settings, origin, vehicleName: booking.vehicles?.name ?? '' } : null
}

/**
 * Email 3 – "booking confirmed" with payment instructions and a calendar file.
 * Never throws: a failed email must not undo the status change.
 */
export async function notifyBookingConfirmed(supabase: Client, bookingId: string): Promise<boolean> {
  try {
    const loaded = await load(supabase, bookingId)
    if (!loaded) return false
    const { booking, settings, origin, vehicleName } = loaded
    const data = bookingEmailDataFromRow(booking, vehicleName, settings.company)
    const locale = data.locale
    const pickupAt = new Date(booking.pickup_at)
    const bankReady = !!settings.bank.iban && !settings.bank.is_placeholder
    const result = await sendBookingConfirmed(
      {
        booking: data,
        rental: { method: booking.rental_payment_method, amount: data.total },
        deposit: { method: booking.deposit_payment_method, amount: data.deposit },
        bank: bankReady ? { iban: formatIban(settings.bank.iban), swift: settings.bank.swift, accountName: settings.bank.account_name } : null,
        variableSymbol: variableSymbol(booking.number),
        dueDate: formatDate(paymentDueDate(new Date(), pickupAt, settings.payment_due_days), locale),
        accountUrl: `${origin}${localizedPath(locale, '/moj-ucet')}`,
      },
      {
        bookingId,
        profileId: booking.customer_id,
        ics: buildIcs({
          uid: `${booking.number}@rental.btw.sk`,
          start: pickupAt,
          end: new Date(booking.return_at),
          summary: `${locale === 'en' ? 'Car rental' : 'Prenájom vozidla'}: ${vehicleName}`,
          description: `${locale === 'en' ? 'Booking' : 'Rezervácia'} ${booking.number}\n${data.pickup.at} – ${data.return.at}\n${settings.company.name}${settings.company.phone ? `, ${settings.company.phone}` : ''}`,
          location: data.pickup.address,
        }),
      },
    )
    return result.sent
  } catch (e) {
    console.error('booking confirmed email failed', e)
    return false
  }
}

/** Email 6 – "booking cancelled" to the customer and to the staff addresses. Never throws. */
export async function notifyBookingCancelled(supabase: Client, bookingId: string, cancelledBy: 'customer' | 'staff'): Promise<boolean> {
  try {
    const loaded = await load(supabase, bookingId)
    if (!loaded) return false
    const { booking, settings, origin, vehicleName } = loaded
    const data = bookingEmailDataFromRow(booking, vehicleName, settings.company)
    const fee = booking.cancellation_fee_cents ? formatEuro(booking.cancellation_fee_cents, data.locale) : null
    const results = await sendBookingCancelled(
      {
        booking: data,
        staffBooking: bookingEmailDataFromRow(booking, vehicleName, settings.company, 'sk'),
        cancelledBy,
        reason: booking.cancellation_reason,
        fee,
        adminUrl: `${origin}/admin/rezervacie/${bookingId}`,
      },
      settings.admin_notification_emails,
      { bookingId, profileId: booking.customer_id },
    )
    return results[0]?.sent ?? false
  } catch (e) {
    console.error('booking cancelled email failed', e)
    return false
  }
}

type ExtraRow = { name_snapshot: unknown; quantity: number }

/**
 * Email 4 – staff are told that the customer changed a booking. `before` is the booking
 * as it was; the proposal is read from pending_change (confirmed booking) or from the
 * row itself (a new booking that was rewritten). Never throws.
 */
export async function notifyBookingChangeRequested(supabase: Client, bookingId: string, before: { booking: ChangeableBooking; extras: ExtraRow[] }, collision: boolean): Promise<boolean> {
  try {
    const loaded = await load(supabase, bookingId)
    if (!loaded) return false
    const { booking, settings, origin, vehicleName } = loaded
    const pending = booking.pending_change as { booking?: ChangeableBooking; extras?: ExtraRow[] } | null
    const { data: currentExtras } = await supabase.from('booking_extras').select('name_snapshot, quantity').eq('booking_id', bookingId)
    const after = pending?.booking ?? booking
    const afterExtras = pending ? (pending.extras ?? []) : (currentExtras ?? [])
    const results = await sendBookingChangeRequested(
      {
        booking: bookingEmailDataFromRow(booking, vehicleName, settings.company, 'sk'),
        changes: describeBookingChange(before.booking, before.extras, after, afterExtras, 'sk'),
        needsApproval: booking.status === 'modified',
        collision,
        adminUrl: `${origin}/admin/rezervacie/${bookingId}`,
      },
      settings.admin_notification_emails,
      { bookingId },
    )
    return results.some((result) => result.sent)
  } catch (e) {
    console.error('booking change email failed', e)
    return false
  }
}

/** Email 5 – the customer learns whether the change was approved. Never throws. */
export async function notifyBookingChangeResolved(supabase: Client, bookingId: string, approved: boolean, note: string | null): Promise<boolean> {
  try {
    const loaded = await load(supabase, bookingId)
    if (!loaded) return false
    const { booking, settings, origin, vehicleName } = loaded
    const data = bookingEmailDataFromRow(booking, vehicleName, settings.company)
    const result = await sendBookingChangeResolved({ booking: data, approved, note, accountUrl: `${origin}${localizedPath(data.locale, `/moj-ucet/rezervacie/${bookingId}`)}` }, { bookingId, profileId: booking.customer_id })
    return result.sent
  } catch (e) {
    console.error('booking change resolved email failed', e)
    return false
  }
}

/**
 * Emails 8 and 10 – the signed protocol goes to the customer with the PDF attached
 * (`pdf` is null when it could not be generated; the email then points to the account).
 * Never throws.
 */
export async function notifyProtocolSigned(supabase: Client, protocolId: string, pdf: { filename: string; content: Buffer } | null): Promise<boolean> {
  try {
    const { data: protocol } = await supabase.from('handover_protocols').select('booking_id, type, handover_at, odometer_km, fuel_level').eq('id', protocolId).maybeSingle()
    if (!protocol) return false
    const [loaded, { data: vehicle }, { count }] = await Promise.all([
      load(supabase, protocol.booking_id),
      supabase.from('bookings').select('vehicles(fuel, assistance)').eq('id', protocol.booking_id).maybeSingle(),
      supabase.from('protocol_damages').select('id', { count: 'exact', head: true }).eq('protocol_id', protocolId),
    ])
    if (!loaded) return false
    const { booking, settings, origin, vehicleName } = loaded
    const data = bookingEmailDataFromRow(booking, vehicleName, settings.company)
    const assistance = (vehicle?.vehicles?.assistance ?? null) as { phone?: string } | null
    const result = await sendProtocolSigned(
      {
        booking: data,
        type: protocol.type,
        handoverAt: formatDateTime(protocol.handover_at ?? new Date(), data.locale),
        odometer: protocol.odometer_km === null ? '—' : `${new Intl.NumberFormat(data.locale === 'en' ? 'en-GB' : 'sk-SK').format(protocol.odometer_km)} km`,
        fuel: usesFuel(vehicle?.vehicles?.fuel ?? '') && protocol.fuel_level !== null ? fuelLabel(protocol.fuel_level) : null,
        newDamages: protocol.type === 'return' ? (count ?? 0) : 0,
        hasAttachment: !!pdf,
        accountUrl: `${origin}${localizedPath(data.locale, `/moj-ucet/rezervacie/${protocol.booking_id}`)}`,
        assistancePhone: assistance?.phone || settings.assistance.phone || null,
      },
      { bookingId: protocol.booking_id, profileId: booking.customer_id, pdf },
    )
    return result.sent
  } catch (e) {
    console.error('protocol email failed', e)
    return false
  }
}

/** Email 10, second part – the approved settlement. Never throws. */
export async function notifySettlementApproved(supabase: Client, bookingId: string): Promise<boolean> {
  try {
    const [loaded, { data: settlement }] = await Promise.all([load(supabase, bookingId), supabase.from('settlements').select('*').eq('booking_id', bookingId).maybeSingle()])
    if (!loaded || !settlement?.approved_at) return false
    const { booking, settings, origin, vehicleName } = loaded
    const data = bookingEmailDataFromRow(booking, vehicleName, settings.company)
    const euro = (cents: number) => formatEuro(cents, data.locale)
    const total = settlement.total_cents ?? 0
    const { refundCents, dueCents } = depositOutcome(booking.deposit_cents, total)
    const result = await sendSettlement(
      {
        booking: data,
        lines: settlementLines(settlement, data.locale).map((line) => ({ label: line.label, detail: line.detail, amount: euro(line.cents) })),
        total: euro(total),
        hasCharges: total > 0,
        deposit: euro(booking.deposit_cents),
        refund: dueCents > 0 ? null : euro(refundCents),
        due: dueCents > 0 ? euro(dueCents) : null,
        note: settlement.note,
        accountUrl: `${origin}${localizedPath(data.locale, `/moj-ucet/rezervacie/${bookingId}`)}`,
      },
      { bookingId, profileId: booking.customer_id },
    )
    return result.sent
  } catch (e) {
    console.error('settlement email failed', e)
    return false
  }
}

/**
 * Email 11 – a document was uploaded; the PDF goes along as an attachment (when it can be
 * read). Marks the document as e-mailed. Never throws.
 */
export async function notifyDocumentAvailable(supabase: Client, documentId: string): Promise<boolean> {
  try {
    const { data: document } = await supabase.from('documents').select('*').eq('id', documentId).maybeSingle()
    if (!document) return false
    const loaded = await load(supabase, document.booking_id)
    if (!loaded) return false
    const { booking, settings, origin, vehicleName } = loaded
    const data = bookingEmailDataFromRow(booking, vehicleName, settings.company)
    if (!data.customer.email) return false
    const { data: file } = await supabase.storage.from(DOCUMENTS_BUCKET).download(document.storage_path)
    const pdf = file ? { filename: documentFileName(document.type, document.number, 'doklad'), content: Buffer.from(await file.arrayBuffer()) } : null
    const result = await sendDocumentAvailable(
      {
        booking: data,
        typeLabel: DOCUMENT_TYPE_LABELS[data.locale][document.type],
        number: document.number,
        amount: document.amount_cents === null ? null : formatEuro(document.amount_cents, data.locale),
        issuedAt: document.issued_at ? formatDate(`${document.issued_at}T12:00:00Z`, data.locale) : null,
        hasAttachment: !!pdf,
        accountUrl: `${origin}${localizedPath(data.locale, `/moj-ucet/rezervacie/${document.booking_id}`)}`,
      },
      { bookingId: document.booking_id, profileId: booking.customer_id, pdf },
    )
    if (result.sent) await supabase.from('documents').update({ emailed_at: new Date().toISOString() }).eq('id', documentId)
    return result.sent
  } catch (e) {
    console.error('document email failed', e)
    return false
  }
}
