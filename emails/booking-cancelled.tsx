import { Button, Hr, Text } from '@react-email/components'
import type { BookingEmailData } from './booking-types'
import { EmailLayout, Rows, styles } from './layout'

export type BookingCancelledProps = {
  booking: BookingEmailData
  /** The customer gets a version in their language; staff get a Slovak one with a link to the admin. */
  audience: 'customer' | 'staff'
  cancelledBy: 'customer' | 'staff'
  reason: string | null
  /** Formatted fee, or null when the cancellation is free of charge. */
  fee: string | null
  adminUrl?: string
}

const COPY = {
  sk: {
    subject: (n: string) => `Rezervácia ${n} bola zrušená – BY THE WAVE`,
    heading: 'Rezervácia bola zrušená',
    greeting: (name: string) => `Dobrý deň, ${name},`,
    byStaff: 'vašu rezerváciu sme zrušili.',
    byCustomer: 'vašu rezerváciu sme na vašu žiadosť zrušili.',
    number: 'Číslo rezervácie',
    vehicle: 'Vozidlo',
    term: 'Termín',
    reason: 'Dôvod',
    fee: 'Storno poplatok',
    free: 'bez poplatku',
    feeNote: 'O spôsobe úhrady storno poplatku vás budeme informovať.',
    contact: 'Ak ide o omyl alebo máte otázky, odpovedzte prosím na tento e-mail.',
  },
  en: {
    subject: (n: string) => `Booking ${n} has been cancelled – BY THE WAVE`,
    heading: 'Your booking has been cancelled',
    greeting: (name: string) => `Dear ${name},`,
    byStaff: 'we have cancelled your booking.',
    byCustomer: 'we have cancelled your booking as you requested.',
    number: 'Booking number',
    vehicle: 'Vehicle',
    term: 'Dates',
    reason: 'Reason',
    fee: 'Cancellation fee',
    free: 'free of charge',
    feeNote: 'We will let you know how to settle the cancellation fee.',
    contact: 'If this is a mistake or you have any questions, please reply to this email.',
  },
}

export function bookingCancelledSubject(props: Pick<BookingCancelledProps, 'booking' | 'audience'>): string {
  if (props.audience === 'staff') return `Zrušená rezervácia ${props.booking.number} – ${props.booking.vehicleName}, ${props.booking.pickup.at}`
  return COPY[props.booking.locale].subject(props.booking.number)
}

/** Email 6 – booking cancelled (who, why, fee). */
export default function BookingCancelledEmail({ booking, audience, cancelledBy, reason, fee, adminUrl }: BookingCancelledProps) {
  const staff = audience === 'staff'
  const c = COPY[staff ? 'sk' : booking.locale]
  const customerName = `${booking.customer.firstName} ${booking.customer.lastName}`

  return (
    <EmailLayout locale={staff ? 'sk' : booking.locale} preview={`${c.number}: ${booking.number}`} company={booking.company}>
      <Text style={styles.h1}>{staff ? `Zrušená rezervácia ${booking.number}` : c.heading}</Text>
      <Text style={{ ...styles.p, marginTop: '16px' }}>
        {staff ? (
          `Rezerváciu zrušil ${cancelledBy === 'customer' ? 'zákazník' : 'zamestnanec'}.`
        ) : (
          <>
            {c.greeting(booking.customer.firstName)}
            <br />
            {cancelledBy === 'customer' ? c.byCustomer : c.byStaff}
          </>
        )}
      </Text>
      <Rows
        rows={[
          { label: c.number, value: booking.number },
          ...(staff ? [{ label: 'Zákazník', value: `${customerName} · ${booking.customer.phone}` }] : []),
          { label: c.vehicle, value: booking.vehicleName },
          { label: c.term, value: `${booking.pickup.at} – ${booking.return.at}` },
          ...(reason ? [{ label: c.reason, value: reason }] : []),
          { label: c.fee, value: fee ?? c.free, strong: true },
        ]}
      />
      {fee && !staff ? <Text style={{ ...styles.small, marginTop: '12px' }}>{c.feeNote}</Text> : null}
      <Hr style={styles.rule} />
      {staff && adminUrl ? (
        <Button href={adminUrl} style={styles.button}>
          Otvoriť v administrácii
        </Button>
      ) : (
        <Text style={styles.small}>{c.contact}</Text>
      )}
    </EmailLayout>
  )
}
