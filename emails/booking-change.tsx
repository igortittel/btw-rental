import { Button, Hr, Text } from '@react-email/components'
import type { BookingEmailData } from './booking-types'
import { EmailLayout, Rows, styles } from './layout'

/** One changed item: what it was and what the customer asked for. */
export type ChangeRow = { label: string; before: string; after: string }

export type BookingChangeRequestedProps = {
  booking: BookingEmailData
  changes: ChangeRow[]
  /** true: a confirmed booking now waits for approval; false: a new booking was simply rewritten. */
  needsApproval: boolean
  /** The proposed term collides with another confirmed booking or a block. */
  collision: boolean
  adminUrl: string
}

export function bookingChangeRequestedSubject(props: Pick<BookingChangeRequestedProps, 'booking' | 'needsApproval'>): string {
  return `${props.needsApproval ? 'Úprava na schválenie' : 'Zákazník upravil rezerváciu'} ${props.booking.number} – ${props.booking.vehicleName}`
}

function Changes({ changes, beforeLabel, afterLabel }: { changes: ChangeRow[]; beforeLabel: string; afterLabel: string }) {
  const cell = { padding: '8px 8px 8px 0', fontSize: '14px', lineHeight: '20px', verticalAlign: 'top' as const, borderBottom: '1px solid #333333' }
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ ...cell, textAlign: 'left', color: '#AAAAAA', fontWeight: 400 }} />
          <th style={{ ...cell, textAlign: 'left', color: '#AAAAAA', fontWeight: 400 }}>{beforeLabel}</th>
          <th style={{ ...cell, textAlign: 'left', color: '#AAAAAA', fontWeight: 400 }}>{afterLabel}</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((change) => (
          <tr key={change.label}>
            <td style={{ ...cell, color: '#AAAAAA' }}>{change.label}</td>
            <td style={{ ...cell, color: '#CCCCCC' }}>{change.before}</td>
            <td style={{ ...cell, color: '#ffffff', fontWeight: 700 }}>{change.after}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Email 4 – the customer changed their booking (staff, always Slovak). */
export function BookingChangeRequestedEmail({ booking, changes, needsApproval, collision, adminUrl }: BookingChangeRequestedProps) {
  const customerName = `${booking.customer.firstName} ${booking.customer.lastName}`
  return (
    <EmailLayout locale="sk" preview={`${customerName} · ${booking.number}`} company={booking.company}>
      <Text style={styles.h1}>{needsApproval ? `Úprava rezervácie ${booking.number} čaká na schválenie` : `Zákazník upravil rezerváciu ${booking.number}`}</Text>
      <Text style={{ ...styles.p, marginTop: '12px' }}>
        {needsApproval
          ? 'Potvrdená rezervácia ostáva v pôvodnom znení, kým úpravu neschválite alebo nezamietnete.'
          : 'Rezervácia ešte nebola potvrdená, zmeny sa preto zapísali priamo.'}
      </Text>
      {collision ? (
        <Text style={{ margin: '8px 0 16px', padding: '12px 16px', border: '1px solid #E0A458', borderRadius: '8px', backgroundColor: '#2A2114', fontSize: '14px', lineHeight: '20px', color: '#FFD9A0' }}>
          ⚠ Navrhovaný termín koliduje s inou potvrdenou rezerváciou alebo blokáciou – úpravu nebude možné schváliť.
        </Text>
      ) : null}
      <Button href={adminUrl} style={styles.button}>
        Otvoriť v administrácii
      </Button>
      <Hr style={styles.rule} />
      <Text style={styles.h2}>Zmeny</Text>
      <Changes changes={changes} beforeLabel="Pôvodne" afterLabel="Nové" />
      <Hr style={styles.rule} />
      <Rows
        rows={[
          { label: 'Zákazník', value: customerName },
          { label: 'Telefón', value: booking.customer.phone },
          { label: 'Vozidlo', value: booking.vehicleName },
        ]}
      />
    </EmailLayout>
  )
}

export type BookingChangeResolvedProps = {
  /** The booking as it is valid NOW (after approval: the new values; after rejection: the original ones). */
  booking: BookingEmailData
  approved: boolean
  note: string | null
  accountUrl: string
}

const COPY = {
  sk: {
    subjectApproved: (n: string) => `Úprava rezervácie ${n} je schválená – BY THE WAVE`,
    subjectRejected: (n: string) => `Úpravu rezervácie ${n} sme nemohli schváliť – BY THE WAVE`,
    headingApproved: 'Úprava rezervácie je schválená',
    headingRejected: 'Úpravu rezervácie sme nemohli schváliť',
    greeting: (name: string) => `Dobrý deň, ${name},`,
    approved: 'vašu úpravu sme schválili. Rezervácia platí v tomto znení:',
    rejected: 'požadovanú úpravu sme žiaľ nemohli schváliť. Rezervácia ostáva platná v pôvodnom znení:',
    note: 'Poznámka',
    vehicle: 'Vozidlo',
    pickup: 'Vyzdvihnutie',
    return: 'Odovzdanie',
    total: 'Cena s DPH',
    cta: 'Zobraziť rezerváciu',
    contact: 'Ak potrebujete iný termín, odpovedzte na tento e-mail – radi nájdeme riešenie.',
  },
  en: {
    subjectApproved: (n: string) => `The change to booking ${n} is approved – BY THE WAVE`,
    subjectRejected: (n: string) => `We could not approve the change to booking ${n} – BY THE WAVE`,
    headingApproved: 'Your booking change is approved',
    headingRejected: 'We could not approve your booking change',
    greeting: (name: string) => `Dear ${name},`,
    approved: 'we have approved your change. The booking is now valid as follows:',
    rejected: 'unfortunately we could not approve the requested change. Your booking remains valid as originally confirmed:',
    note: 'Note',
    vehicle: 'Vehicle',
    pickup: 'Pick-up',
    return: 'Return',
    total: 'Price incl. VAT',
    cta: 'View booking',
    contact: 'If you need different dates, reply to this email – we will be happy to find a solution.',
  },
}

export function bookingChangeResolvedSubject(props: Pick<BookingChangeResolvedProps, 'booking' | 'approved'>): string {
  const c = COPY[props.booking.locale]
  return props.approved ? c.subjectApproved(props.booking.number) : c.subjectRejected(props.booking.number)
}

/** Email 5 – the change was approved or rejected (customer). */
export function BookingChangeResolvedEmail({ booking, approved, note, accountUrl }: BookingChangeResolvedProps) {
  const c = COPY[booking.locale]
  return (
    <EmailLayout locale={booking.locale} preview={booking.number} company={booking.company}>
      <Text style={styles.h1}>{approved ? c.headingApproved : c.headingRejected}</Text>
      <Text style={{ ...styles.p, marginTop: '16px' }}>
        {c.greeting(booking.customer.firstName)}
        <br />
        {approved ? c.approved : c.rejected}
      </Text>
      <Rows
        rows={[
          { label: c.vehicle, value: booking.vehicleName },
          { label: c.pickup, value: `${booking.pickup.at}, ${booking.pickup.address}` },
          { label: c.return, value: `${booking.return.at}, ${booking.return.address}` },
          ...(booking.total ? [{ label: c.total, value: booking.total, strong: true }] : []),
          ...(note ? [{ label: c.note, value: note }] : []),
        ]}
      />
      <Hr style={styles.rule} />
      <Button href={accountUrl} style={styles.button}>
        {c.cta}
      </Button>
      <Text style={{ ...styles.small, marginTop: '24px' }}>{c.contact}</Text>
    </EmailLayout>
  )
}
