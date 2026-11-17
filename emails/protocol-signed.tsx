import { Button, Hr, Text } from '@react-email/components'
import type { BookingEmailData } from './booking-types'
import { EmailLayout, Rows, styles } from './layout'

export type ProtocolSignedProps = {
  booking: BookingEmailData
  type: 'pickup' | 'return'
  /** Formatted for the recipient: date and time of the handover, odometer, fuel. */
  handoverAt: string
  odometer: string
  fuel: string | null
  /** Return only: number of damages that were not recorded at pickup. */
  newDamages: number
  /** The PDF is attached; false when it could not be generated (the customer finds it in the account later). */
  hasAttachment: boolean
  accountUrl: string
  assistancePhone: string | null
}

const COPY = {
  sk: {
    subject: { pickup: (n: string) => `Odovzdávací protokol k rezervácii ${n} – BY THE WAVE`, return: (n: string) => `Preberací protokol k rezervácii ${n} – BY THE WAVE` },
    heading: { pickup: 'Vozidlo ste prevzali', return: 'Vozidlo ste vrátili' },
    greeting: (name: string) => `Dobrý deň, ${name},`,
    intro: { pickup: 'ďakujeme, že ste si vybrali BY THE WAVE. Podpísaný odovzdávací protokol', return: 'ďakujeme za prenájom. Podpísaný preberací protokol' },
    attached: 'nájdete v prílohe tohto e-mailu a kedykoľvek aj vo svojom účte.',
    notAttached: 'nájdete vo svojom účte.',
    vehicle: 'Vozidlo',
    at: { pickup: 'Odovzdané', return: 'Vrátené' },
    odometer: 'Stav tachometra',
    fuel: 'Palivo',
    returnBy: 'Vrátenie do',
    kmLimit: 'Limit km',
    newDamages: 'Nové poškodenia',
    none: 'žiadne',
    settlement: 'Vyúčtovanie prenájmu (kilometre, palivo, prípadné poškodenia) a informáciu o vrátení depozitu vám pošleme samostatne, hneď ako ho uzavrieme.',
    assistance: (phone: string) => `Asistenčná služba počas prenájmu: ${phone}.`,
    cta: 'Zobraziť rezerváciu',
  },
  en: {
    subject: { pickup: (n: string) => `Handover report for booking ${n} – BY THE WAVE`, return: (n: string) => `Return report for booking ${n} – BY THE WAVE` },
    heading: { pickup: 'You have picked up the vehicle', return: 'You have returned the vehicle' },
    greeting: (name: string) => `Dear ${name},`,
    intro: { pickup: 'thank you for choosing BY THE WAVE. The signed handover report', return: 'thank you for renting with us. The signed return report' },
    attached: 'is attached to this email and always available in your account (the document is in Slovak).',
    notAttached: 'is available in your account (the document is in Slovak).',
    vehicle: 'Vehicle',
    at: { pickup: 'Handed over', return: 'Returned' },
    odometer: 'Odometer',
    fuel: 'Fuel',
    returnBy: 'Return by',
    kmLimit: 'Mileage limit',
    newDamages: 'New damage',
    none: 'none',
    settlement: 'We will send the final settlement (mileage, fuel, any damage) and the information about your deposit separately as soon as it is closed.',
    assistance: (phone: string) => `Roadside assistance during the rental: ${phone}.`,
    cta: 'View booking',
  },
}

export function protocolSignedSubject(props: Pick<ProtocolSignedProps, 'booking' | 'type'>): string {
  return COPY[props.booking.locale].subject[props.type](props.booking.number)
}

/** Emails 8 and 10 – the signed pickup / return protocol (customer), PDF attached. */
export default function ProtocolSignedEmail({ booking, type, handoverAt, odometer, fuel, newDamages, hasAttachment, accountUrl, assistancePhone }: ProtocolSignedProps) {
  const c = COPY[booking.locale]
  return (
    <EmailLayout locale={booking.locale} preview={`${booking.number} · ${booking.vehicleName}`} company={booking.company}>
      <Text style={styles.h1}>{c.heading[type]}</Text>
      <Text style={{ ...styles.p, marginTop: '16px' }}>
        {c.greeting(booking.customer.firstName)}
        <br />
        {c.intro[type]} {hasAttachment ? c.attached : c.notAttached}
      </Text>
      <Rows
        rows={[
          { label: c.vehicle, value: booking.vehicleName },
          { label: c.at[type], value: handoverAt },
          { label: c.odometer, value: odometer },
          ...(fuel ? [{ label: c.fuel, value: fuel }] : []),
          ...(type === 'pickup'
            ? [
                { label: c.returnBy, value: `${booking.return.at}, ${booking.return.address}` },
                { label: c.kmLimit, value: booking.kmLimit },
              ]
            : [{ label: c.newDamages, value: newDamages > 0 ? String(newDamages) : c.none }]),
        ]}
      />
      <Hr style={styles.rule} />
      <Text style={styles.p}>{type === 'return' ? c.settlement : assistancePhone ? c.assistance(assistancePhone) : ''}</Text>
      <Button href={accountUrl} style={styles.button}>
        {c.cta}
      </Button>
    </EmailLayout>
  )
}
