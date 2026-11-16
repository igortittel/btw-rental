import 'server-only'
import { render } from '@react-email/render'
import BookingAdminNotificationEmail, { bookingAdminSubject, type BookingAdminNotificationProps } from '@/emails/booking-admin-notification'
import BookingCancelledEmail, { bookingCancelledSubject, type BookingCancelledProps } from '@/emails/booking-cancelled'
import BookingConfirmedEmail, { bookingConfirmedSubject, type BookingConfirmedProps } from '@/emails/booking-confirmed'
import BookingReceivedEmail, { bookingReceivedSubject, type BookingReceivedProps } from '@/emails/booking-received'
import { sendEmail } from '@/lib/email/send'

/** Renders a React Email template to HTML and a plain-text alternative. */
async function renderBoth(element: React.ReactElement) {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { html, text }
}

export async function renderBookingReceived(props: BookingReceivedProps) {
  return { subject: bookingReceivedSubject(props.booking), ...(await renderBoth(BookingReceivedEmail(props))) }
}

export async function renderBookingAdminNotification(props: BookingAdminNotificationProps) {
  return { subject: bookingAdminSubject(props.booking), ...(await renderBoth(BookingAdminNotificationEmail(props))) }
}

/** Email 1 – booking received (customer). */
export async function sendBookingReceived(props: BookingReceivedProps, meta: { bookingId: string; profileId: string }) {
  const email = await renderBookingReceived(props)
  return sendEmail({ type: 'booking_received', to: props.booking.customer.email, locale: props.booking.locale, ...meta, ...email })
}

/** Email 2 – new booking (staff). Replies go straight to the customer. */
export async function sendBookingAdminNotification(props: BookingAdminNotificationProps, recipients: string[], meta: { bookingId: string }) {
  const email = await renderBookingAdminNotification(props)
  return Promise.all(
    recipients.map((to) => sendEmail({ type: 'booking_admin_new', to, locale: 'sk', bookingId: meta.bookingId, replyTo: props.booking.customer.email, ...email })),
  )
}

export async function renderBookingConfirmed(props: BookingConfirmedProps) {
  return { subject: bookingConfirmedSubject(props.booking), ...(await renderBoth(BookingConfirmedEmail(props))) }
}

export async function renderBookingCancelled(props: BookingCancelledProps) {
  return { subject: bookingCancelledSubject(props), ...(await renderBoth(BookingCancelledEmail(props))) }
}

/** Email 3 – booking confirmed (customer), with the term as a calendar file. */
export async function sendBookingConfirmed(props: BookingConfirmedProps, meta: { bookingId: string; profileId: string; ics: string }) {
  const email = await renderBookingConfirmed(props)
  return sendEmail({
    type: 'booking_confirmed',
    to: props.booking.customer.email,
    locale: props.booking.locale,
    bookingId: meta.bookingId,
    profileId: meta.profileId,
    attachments: [{ filename: `${props.booking.number}.ics`, content: meta.ics, contentType: 'text/calendar; charset=utf-8; method=PUBLISH' }],
    ...email,
  })
}

/** Email 6 – booking cancelled: the customer and every staff notification address. */
export async function sendBookingCancelled(props: Omit<BookingCancelledProps, 'audience' | 'booking'> & { booking: BookingCancelledProps['booking']; staffBooking: BookingCancelledProps['booking'] }, staffRecipients: string[], meta: { bookingId: string; profileId: string }) {
  const { staffBooking, ...rest } = props
  const [customer, staff] = await Promise.all([renderBookingCancelled({ ...rest, audience: 'customer' }), renderBookingCancelled({ ...rest, booking: staffBooking, audience: 'staff' })])
  return Promise.all([
    sendEmail({ type: 'booking_cancelled', to: props.booking.customer.email, locale: props.booking.locale, ...meta, ...customer }),
    ...staffRecipients.map((to) => sendEmail({ type: 'booking_cancelled_admin', to, locale: 'sk', bookingId: meta.bookingId, replyTo: props.booking.customer.email, ...staff })),
  ])
}
