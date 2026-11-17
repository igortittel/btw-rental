import { Button, Hr, Text } from '@react-email/components'
import type { BookingEmailData } from './booking-types'
import { EmailLayout, Rows, styles } from './layout'

export type SettlementEmailProps = {
  booking: BookingEmailData
  /** Charged items, already formatted; empty when nothing is charged. */
  lines: { label: string; detail?: string; amount: string }[]
  total: string
  hasCharges: boolean
  deposit: string
  /** Part of the deposit that goes back to the customer; null when the charges exceed it. */
  refund: string | null
  /** Amount still owed when the charges exceed the deposit. */
  due: string | null
  note: string | null
  accountUrl: string
}

const COPY = {
  sk: {
    subject: (n: string) => `Vyúčtovanie prenájmu ${n} – BY THE WAVE`,
    heading: 'Vyúčtovanie prenájmu',
    greeting: (name: string) => `Dobrý deň, ${name},`,
    intro: 'po prevzatí vozidla sme uzavreli vyúčtovanie vášho prenájmu.',
    clean: 'Vozidlo ste vrátili v poriadku – nič nedoúčtovávame.',
    total: 'Doúčtovanie spolu (s DPH)',
    deposit: 'Depozit',
    refund: 'Vrátime vám',
    due: 'Doplatok nad rámec depozitu',
    note: 'Poznámka',
    after: 'Depozit vraciame rovnakým spôsobom, akým bol zložený. Ak máte k vyúčtovaniu otázky, odpovedzte na tento e-mail.',
    cta: 'Zobraziť rezerváciu',
  },
  en: {
    subject: (n: string) => `Settlement of rental ${n} – BY THE WAVE`,
    heading: 'Rental settlement',
    greeting: (name: string) => `Dear ${name},`,
    intro: 'we have closed the settlement of your rental after the vehicle was returned.',
    clean: 'The vehicle was returned in good order – there are no additional charges.',
    total: 'Additional charges (incl. VAT)',
    deposit: 'Deposit',
    refund: 'Refund to you',
    due: 'Amount due beyond the deposit',
    note: 'Note',
    after: 'The deposit is returned the same way it was paid. If you have any questions about the settlement, simply reply to this email.',
    cta: 'View booking',
  },
}

export function settlementSubject(props: Pick<SettlementEmailProps, 'booking'>): string {
  return COPY[props.booking.locale].subject(props.booking.number)
}

/** Second part of email 10 – the approved settlement after the return protocol (customer). */
export default function SettlementEmail({ booking, lines, total, hasCharges, deposit, refund, due, note, accountUrl }: SettlementEmailProps) {
  const c = COPY[booking.locale]
  return (
    <EmailLayout locale={booking.locale} preview={`${booking.number} · ${booking.vehicleName}`} company={booking.company}>
      <Text style={styles.h1}>{c.heading}</Text>
      <Text style={{ ...styles.p, marginTop: '16px' }}>
        {c.greeting(booking.customer.firstName)}
        <br />
        {c.intro} {hasCharges ? '' : c.clean}
      </Text>
      <Rows
        rows={[
          ...lines.map((line) => ({ label: line.detail ? `${line.label} (${line.detail})` : line.label, value: line.amount })),
          ...(hasCharges ? [{ label: c.total, value: total, strong: true }] : []),
          { label: c.deposit, value: deposit },
          ...(refund ? [{ label: c.refund, value: refund, strong: true }] : []),
          ...(due ? [{ label: c.due, value: due, strong: true }] : []),
        ]}
      />
      {note ? (
        <>
          <Hr style={styles.thinRule} />
          <Text style={styles.small}>
            {c.note}: {note}
          </Text>
        </>
      ) : null}
      <Hr style={styles.rule} />
      <Text style={styles.p}>{c.after}</Text>
      <Button href={accountUrl} style={styles.button}>
        {c.cta}
      </Button>
    </EmailLayout>
  )
}
