import { Button, Hr, Text } from '@react-email/components'
import type { BookingEmailData } from './booking-types'
import { EmailLayout, Rows, styles } from './layout'

export type DocumentAvailableProps = {
  booking: BookingEmailData
  /** Document type in the recipient's language ("Faktúra", "Invoice"). */
  typeLabel: string
  number: string | null
  amount: string | null
  issuedAt: string | null
  hasAttachment: boolean
  accountUrl: string
}

const COPY = {
  sk: {
    subject: (type: string, n: string) => `${type} k rezervácii ${n} – BY THE WAVE`,
    heading: (type: string) => `${type} je k dispozícii`,
    greeting: (name: string) => `Dobrý deň, ${name},`,
    intro: (type: string, n: string) => `k vašej rezervácii ${n} sme vystavili doklad: ${type.toLowerCase()}.`,
    attached: 'Doklad nájdete v prílohe tohto e-mailu a kedykoľvek aj vo vašom účte.',
    inAccount: 'Doklad si môžete stiahnuť vo vašom účte.',
    number: 'Číslo dokladu',
    amount: 'Suma s DPH',
    issued: 'Dátum vystavenia',
    vehicle: 'Vozidlo',
    questions: 'Ak máte k dokladu otázky, odpovedzte na tento e-mail.',
    cta: 'Zobraziť rezerváciu',
  },
  en: {
    subject: (type: string, n: string) => `${type} for booking ${n} – BY THE WAVE`,
    heading: (type: string) => `${type} available`,
    greeting: (name: string) => `Dear ${name},`,
    intro: (type: string, n: string) => `we have issued a document for your booking ${n}: ${type.toLowerCase()}.`,
    attached: 'You will find it attached to this email and at any time in your account.',
    inAccount: 'You can download it in your account.',
    number: 'Document number',
    amount: 'Amount incl. VAT',
    issued: 'Issue date',
    vehicle: 'Vehicle',
    questions: 'If you have any questions about the document, simply reply to this email.',
    cta: 'View booking',
  },
}

export function documentAvailableSubject(props: Pick<DocumentAvailableProps, 'booking' | 'typeLabel'>): string {
  return COPY[props.booking.locale].subject(props.typeLabel, props.booking.number)
}

/** Email 11 – an invoice or another accounting document was uploaded (customer). */
export default function DocumentAvailableEmail({ booking, typeLabel, number, amount, issuedAt, hasAttachment, accountUrl }: DocumentAvailableProps) {
  const c = COPY[booking.locale]
  return (
    <EmailLayout locale={booking.locale} preview={`${typeLabel}${number ? ` ${number}` : ''} · ${booking.number}`} company={booking.company}>
      <Text style={styles.h1}>{c.heading(typeLabel)}</Text>
      <Text style={{ ...styles.p, marginTop: '16px' }}>
        {c.greeting(booking.customer.firstName)}
        <br />
        {c.intro(typeLabel, booking.number)} {hasAttachment ? c.attached : c.inAccount}
      </Text>
      <Rows
        rows={[
          ...(number ? [{ label: c.number, value: number }] : []),
          ...(amount ? [{ label: c.amount, value: amount, strong: true }] : []),
          ...(issuedAt ? [{ label: c.issued, value: issuedAt }] : []),
          { label: c.vehicle, value: booking.vehicleName },
        ]}
      />
      <Hr style={styles.rule} />
      <Text style={styles.p}>{c.questions}</Text>
      <Button href={accountUrl} style={styles.button}>
        {c.cta}
      </Button>
    </EmailLayout>
  )
}
