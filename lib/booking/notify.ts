import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { localizedPath } from '@/i18n/routing'
import { bookingEmailDataFromRow } from '@/lib/booking/email-data'
import { sendBookingCancelled, sendBookingConfirmed } from '@/lib/email/booking-emails'
import { formatEuro } from '@/lib/format'
import { buildIcs } from '@/lib/ics'
import { formatIban, paymentDueDate, variableSymbol } from '@/lib/payment'
import { getSettings } from '@/lib/settings'
import { getSiteOrigin } from '@/lib/site-url'
import { formatDate } from '@/lib/time'
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
