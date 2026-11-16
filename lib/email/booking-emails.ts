import 'server-only'
import { render } from '@react-email/render'
import BookingAdminNotificationEmail, { bookingAdminSubject, type BookingAdminNotificationProps } from '@/emails/booking-admin-notification'
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
