import { Button, Hr, Link, Section, Text } from '@react-email/components'
import type { BookingEmailData } from './booking-types'
import { EmailLayout, Rows, styles } from './layout'

export type BookingAdminNotificationProps = {
  booking: BookingEmailData
  adminUrl: string
  /** Other unconfirmed bookings of the same vehicle overlapping this term. */
  pendingOverlaps: number
  isBlacklisted: boolean
  isNewCustomer: boolean
}

export function bookingAdminSubject(booking: BookingEmailData): string {
  return `${booking.isIndividual ? 'Nový dopyt' : 'Nová rezervácia'} ${booking.number} – ${booking.vehicleName}, ${booking.pickup.at}`
}

const days = (n: number) => (n === 1 ? '1 deň' : n < 5 ? `${n} dni` : `${n} dní`)

/** Staff notification; always in Slovak. */
export default function BookingAdminNotificationEmail({ booking, adminUrl, pendingOverlaps, isBlacklisted, isNewCustomer }: BookingAdminNotificationProps) {
  const warnings = [
    booking.isIndividual ? 'Prenájom na dlhšie obdobie – rezervácia je bez ceny, treba ju doplniť.' : null,
    pendingOverlaps > 0
      ? `Kolízia: na tento termín ${pendingOverlaps === 1 ? 'čaká ďalšia nepotvrdená rezervácia' : `čakajú ďalšie nepotvrdené rezervácie (${pendingOverlaps})`} toho istého vozidla.`
      : null,
    isBlacklisted ? 'Zákazník je označený ako problémový (blacklist).' : null,
  ].filter((w): w is string => w !== null)
  const customerName = `${booking.customer.firstName} ${booking.customer.lastName}`

  return (
    <EmailLayout locale="sk" preview={`${customerName} · ${booking.vehicleName} · ${booking.pickup.at}`} company={booking.company}>
      <Text style={styles.h1}>
        {booking.isIndividual ? 'Nový dopyt' : 'Nová rezervácia'} {booking.number}
      </Text>
      <Text style={{ ...styles.p, marginTop: '12px' }}>Rezervácia čaká na potvrdenie.</Text>

      {warnings.length > 0 ? (
        <Section style={{ margin: '8px 0 20px', padding: '12px 16px', border: '1px solid #E0A458', borderRadius: '8px', backgroundColor: '#2A2114' }}>
          {warnings.map((warning) => (
            <Text key={warning} style={{ margin: '4px 0', fontSize: '14px', lineHeight: '20px', color: '#FFD9A0' }}>
              ⚠ {warning}
            </Text>
          ))}
        </Section>
      ) : null}

      <Button href={adminUrl} style={styles.button}>
        Otvoriť v administrácii
      </Button>

      <Hr style={styles.rule} />
      <Text style={styles.h2}>Zákazník{isNewCustomer ? ' (nový)' : ''}</Text>
      <Rows
        rows={[
          { label: 'Meno', value: customerName },
          ...(booking.customer.companyName ? [{ label: 'Firma', value: booking.customer.companyName }] : []),
          {
            label: 'E-mail',
            value: (
              <Link href={`mailto:${booking.customer.email}`} style={styles.link}>
                {booking.customer.email}
              </Link>
            ),
          },
          {
            label: 'Telefón',
            value: (
              <Link href={`tel:${booking.customer.phone}`} style={styles.link}>
                {booking.customer.phone}
              </Link>
            ),
          },
        ]}
      />

      <Hr style={styles.rule} />
      <Text style={styles.h2}>Rezervácia</Text>
      <Rows
        rows={[
          { label: 'Vozidlo', value: booking.vehicleName },
          { label: 'Vyzdvihnutie', value: `${booking.pickup.at}, ${booking.pickup.place}` },
          { label: 'Odovzdanie', value: `${booking.return.at}, ${booking.return.place}` },
          { label: 'Dĺžka', value: days(booking.days) },
          ...(booking.abroad ? [{ label: 'Cesta do zahraničia', value: booking.abroad }] : []),
          ...(booking.note ? [{ label: 'Poznámka zákazníka', value: booking.note }] : []),
        ]}
      />

      <Hr style={styles.rule} />
      <Text style={styles.h2}>Cena a platba</Text>
      <Rows rows={booking.lines.map((line) => ({ label: line.label, value: line.amount }))} />
      <Hr style={styles.thinRule} />
      <Rows
        rows={[
          { label: 'Spolu s DPH', value: booking.total ?? 'individuálna cena – doplniť', strong: true },
          { label: 'Depozit', value: `${booking.deposit} · ${booking.depositPayment}` },
          { label: 'Platba prenájmu', value: booking.rentalPayment },
        ]}
      />
    </EmailLayout>
  )
}
