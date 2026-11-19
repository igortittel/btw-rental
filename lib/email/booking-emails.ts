import 'server-only'
import { render } from '@react-email/render'
import BookingAdminNotificationEmail, { bookingAdminSubject, type BookingAdminNotificationProps } from '@/emails/booking-admin-notification'
import {
  BookingChangeRequestedEmail,
  BookingChangeResolvedEmail,
  bookingChangeRequestedSubject,
  bookingChangeResolvedSubject,
  type BookingChangeRequestedProps,
  type BookingChangeResolvedProps,
} from '@/emails/booking-change'
import BookingCancelledEmail, { bookingCancelledSubject, type BookingCancelledProps } from '@/emails/booking-cancelled'
import BookingConfirmedEmail, { bookingConfirmedSubject, type BookingConfirmedProps } from '@/emails/booking-confirmed'
import BookingReceivedEmail, { bookingReceivedSubject, type BookingReceivedProps } from '@/emails/booking-received'
import ProtocolSignedEmail, { protocolSignedSubject, type ProtocolSignedProps } from '@/emails/protocol-signed'
import SettlementEmail, { settlementSubject, type SettlementEmailProps } from '@/emails/settlement'
import BookingReminderEmail, { bookingReminderSubject, type BookingReminderProps } from '@/emails/booking-reminder'
import ReviewRequestEmail, { reviewRequestSubject, type ReviewRequestProps } from '@/emails/review-request'
import DocumentAvailableEmail, { documentAvailableSubject, type DocumentAvailableProps } from '@/emails/document-available'
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
  return Promise.all(recipients.map((to) => sendEmail({ type: 'booking_admin_new', to, locale: 'sk', bookingId: meta.bookingId, replyTo: props.booking.customer.email, ...email })))
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
export async function sendBookingCancelled(
  props: Omit<BookingCancelledProps, 'audience' | 'booking'> & { booking: BookingCancelledProps['booking']; staffBooking: BookingCancelledProps['booking'] },
  staffRecipients: string[],
  meta: { bookingId: string; profileId: string },
) {
  const { staffBooking, ...rest } = props
  const [customer, staff] = await Promise.all([renderBookingCancelled({ ...rest, audience: 'customer' }), renderBookingCancelled({ ...rest, booking: staffBooking, audience: 'staff' })])
  return Promise.all([
    sendEmail({ type: 'booking_cancelled', to: props.booking.customer.email, locale: props.booking.locale, ...meta, ...customer }),
    ...staffRecipients.map((to) => sendEmail({ type: 'booking_cancelled_admin', to, locale: 'sk', bookingId: meta.bookingId, replyTo: props.booking.customer.email, ...staff })),
  ])
}

export async function renderBookingChangeRequested(props: BookingChangeRequestedProps) {
  return { subject: bookingChangeRequestedSubject(props), ...(await renderBoth(BookingChangeRequestedEmail(props))) }
}

export async function renderBookingChangeResolved(props: BookingChangeResolvedProps) {
  return { subject: bookingChangeResolvedSubject(props), ...(await renderBoth(BookingChangeResolvedEmail(props))) }
}

/** Email 4 – the customer changed a booking (staff). */
export async function sendBookingChangeRequested(props: BookingChangeRequestedProps, recipients: string[], meta: { bookingId: string }) {
  const email = await renderBookingChangeRequested(props)
  return Promise.all(recipients.map((to) => sendEmail({ type: 'booking_change_requested', to, locale: 'sk', bookingId: meta.bookingId, replyTo: props.booking.customer.email, ...email })))
}

/** Email 5 – the change was approved or rejected (customer). */
export async function sendBookingChangeResolved(props: BookingChangeResolvedProps, meta: { bookingId: string; profileId: string }) {
  const email = await renderBookingChangeResolved(props)
  return sendEmail({ type: props.approved ? 'booking_change_approved' : 'booking_change_rejected', to: props.booking.customer.email, locale: props.booking.locale, ...meta, ...email })
}

export async function renderProtocolSigned(props: ProtocolSignedProps) {
  return { subject: protocolSignedSubject(props), ...(await renderBoth(ProtocolSignedEmail(props))) }
}

export async function renderSettlement(props: SettlementEmailProps) {
  return { subject: settlementSubject(props), ...(await renderBoth(SettlementEmail(props))) }
}

/** Emails 8 and 10 – signed pickup / return protocol (customer) with the PDF attached. */
export async function sendProtocolSigned(props: ProtocolSignedProps, meta: { bookingId: string; profileId: string; pdf: { filename: string; content: Buffer } | null }) {
  const email = await renderProtocolSigned(props)
  return sendEmail({
    type: props.type === 'pickup' ? 'protocol_pickup' : 'protocol_return',
    to: props.booking.customer.email,
    locale: props.booking.locale,
    bookingId: meta.bookingId,
    profileId: meta.profileId,
    attachments: meta.pdf ? [{ filename: meta.pdf.filename, content: meta.pdf.content, contentType: 'application/pdf' }] : undefined,
    ...email,
  })
}

/** Email 10, second part – the approved settlement (customer). */
export async function sendSettlement(props: SettlementEmailProps, meta: { bookingId: string; profileId: string }) {
  const email = await renderSettlement(props)
  return sendEmail({ type: 'settlement_approved', to: props.booking.customer.email, locale: props.booking.locale, ...meta, ...email })
}

export async function renderDocumentAvailable(props: DocumentAvailableProps) {
  return { subject: documentAvailableSubject(props), ...(await renderBoth(DocumentAvailableEmail(props))) }
}

/** Email 11 – a document (invoice, credit note…) was uploaded; the PDF is attached. */
export async function sendDocumentAvailable(props: DocumentAvailableProps, meta: { bookingId: string; profileId: string; pdf: { filename: string; content: Buffer } | null }) {
  const email = await renderDocumentAvailable(props)
  return sendEmail({
    type: 'document_available',
    to: props.booking.customer.email,
    locale: props.booking.locale,
    bookingId: meta.bookingId,
    profileId: meta.profileId,
    attachments: meta.pdf ? [{ filename: meta.pdf.filename, content: meta.pdf.content, contentType: 'application/pdf' }] : undefined,
    ...email,
  })
}

export async function renderBookingReminder(props: BookingReminderProps) {
  return { subject: bookingReminderSubject(props), ...(await renderBoth(BookingReminderEmail(props))) }
}

/** Emails 7 and 9 – reminder the day before the pick-up / return (customer, sent by the daily cron). */
export async function sendBookingReminder(props: BookingReminderProps, meta: { bookingId: string; profileId: string }) {
  const email = await renderBookingReminder(props)
  return sendEmail({ type: props.kind === 'pickup' ? 'pickup_reminder' : 'return_reminder', to: props.booking.customer.email, locale: props.booking.locale, ...meta, ...email })
}

export async function renderReviewRequest(props: ReviewRequestProps) {
  return { subject: reviewRequestSubject(props), ...(await renderBoth(ReviewRequestEmail(props))) }
}

/** Email 12 – thank you + Google review (customer, sent by the daily cron). */
export async function sendReviewRequest(props: ReviewRequestProps, meta: { bookingId: string; profileId: string }) {
  const email = await renderReviewRequest(props)
  return sendEmail({ type: 'review_request', to: props.booking.customer.email, locale: props.booking.locale, ...meta, ...email })
}
