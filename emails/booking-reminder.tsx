import { Button, Hr, Link, Text } from '@react-email/components'
import type { BookingEmailData } from './booking-types'
import { EmailLayout, Rows, styles } from './layout'

export type BookingReminderProps = {
  booking: BookingEmailData
  kind: 'pickup' | 'return'
  /** Payments still open before the pickup, already formatted ("632,00 € · bankový prevod"); empty when all paid. */
  unpaid: { rental: string | null; deposit: string | null }
  /** Tolerance for a late return in minutes (Settings). */
  toleranceMinutes: number
  assistancePhone: string | null
  accountUrl: string
}

const COPY = {
  sk: {
    subject: { pickup: (n: string) => `Zajtra vyzdvihnutie vozidla – ${n}`, return: (n: string) => `Zajtra vrátenie vozidla – ${n}` },
    heading: { pickup: 'Pripomienka vyzdvihnutia', return: 'Pripomienka vrátenia' },
    greeting: (name: string) => `Dobrý deň, ${name},`,
    intro: { pickup: (v: string) => `pripomíname, že zajtra si vyzdvihnete vozidlo ${v}.`, return: (v: string) => `pripomíname, že zajtra vraciate vozidlo ${v}.` },
    when: { pickup: 'Vyzdvihnutie', return: 'Vrátenie' },
    where: 'Miesto',
    bring: 'Čo si priniesť',
    bringItems: ['občiansky preukaz alebo pas', 'platný vodičský preukaz', 'depozit'],
    deposit: 'Depozit',
    rentalOpen: 'Prenájom zatiaľ nemáme uhradený',
    paymentNote: 'Prenájom aj depozit je potrebné uhradiť najneskôr pri vyzdvihnutí. Ak ste už platili prevodom, platba sa ešte nemusela pripísať – nič netreba robiť.',
    returnTips: (tolerance: number) =>
      `Vráťte prosím vozidlo v dohodnutom čase a mieste, s rovnakým stavom paliva ako pri odovzdaní a s celým príslušenstvom. Pri meškaní viac ako ${tolerance} minút sa účtuje ďalší deň prenájmu.`,
    kmLimit: 'Limit kilometrov',
    assistance: 'Asistenčná služba (nonstop)',
    change: 'Ak potrebujete termín zmeniť, odpovedzte na tento e-mail alebo nám zavolajte.',
    cta: 'Zobraziť rezerváciu',
  },
  en: {
    subject: { pickup: (n: string) => `Vehicle pick-up tomorrow – ${n}`, return: (n: string) => `Vehicle return tomorrow – ${n}` },
    heading: { pickup: 'Pick-up reminder', return: 'Return reminder' },
    greeting: (name: string) => `Dear ${name},`,
    intro: { pickup: (v: string) => `this is a reminder that you pick up the ${v} tomorrow.`, return: (v: string) => `this is a reminder that you return the ${v} tomorrow.` },
    when: { pickup: 'Pick-up', return: 'Return' },
    where: 'Place',
    bring: 'Please bring',
    bringItems: ['ID card or passport', 'valid driving licence', 'the deposit'],
    deposit: 'Deposit',
    rentalOpen: 'Rental not paid yet',
    paymentNote: 'The rental and the deposit must be paid at the latest at pick-up. If you have already paid by bank transfer, the payment may not have arrived yet – no action is needed.',
    returnTips: (tolerance: number) =>
      `Please return the vehicle at the agreed time and place, with the same fuel level as at pick-up and with all accessories. A delay of more than ${tolerance} minutes is charged as another rental day.`,
    kmLimit: 'Mileage limit',
    assistance: 'Roadside assistance (24/7)',
    change: 'If you need to change the time, reply to this email or give us a call.',
    cta: 'View booking',
  },
}

export function bookingReminderSubject(props: Pick<BookingReminderProps, 'booking' | 'kind'>): string {
  return COPY[props.booking.locale].subject[props.kind](props.booking.number)
}

/** Emails 7 and 9 – reminder the day before the pick-up / the return (customer). */
export default function BookingReminderEmail({ booking, kind, unpaid, toleranceMinutes, assistancePhone, accountUrl }: BookingReminderProps) {
  const c = COPY[booking.locale]
  const term = kind === 'pickup' ? booking.pickup : booking.return
  return (
    <EmailLayout locale={booking.locale} preview={`${booking.number} · ${term.at}`} company={booking.company}>
      <Text style={styles.h1}>{c.heading[kind]}</Text>
      <Text style={{ ...styles.p, marginTop: '16px' }}>
        {c.greeting(booking.customer.firstName)}
        <br />
        {c.intro[kind](booking.vehicleName)}
      </Text>
      <Rows
        rows={[
          { label: c.when[kind], value: term.at, strong: true },
          { label: c.where, value: [term.place, term.address].filter(Boolean).join(', ') },
          ...(kind === 'return' ? [{ label: c.kmLimit, value: booking.kmLimit }] : []),
          ...(kind === 'pickup' && unpaid.rental ? [{ label: c.rentalOpen, value: unpaid.rental }] : []),
          ...(kind === 'pickup' ? [{ label: c.deposit, value: unpaid.deposit ?? `${booking.deposit} · ${booking.depositPayment}` }] : []),
        ]}
      />
      <Hr style={styles.rule} />
      {kind === 'pickup' ? (
        <>
          <Text style={styles.h2}>{c.bring}</Text>
          <Text style={styles.p}>
            {c.bringItems.map((item) => (
              <span key={item}>
                · {item}
                <br />
              </span>
            ))}
          </Text>
          {unpaid.rental || unpaid.deposit ? <Text style={styles.small}>{c.paymentNote}</Text> : null}
        </>
      ) : (
        <Text style={styles.p}>{c.returnTips(toleranceMinutes)}</Text>
      )}
      {assistancePhone ? (
        <Text style={{ ...styles.p, marginTop: '12px' }}>
          {c.assistance}:{' '}
          <Link href={`tel:${assistancePhone.replace(/\s/g, '')}`} style={styles.link}>
            {assistancePhone}
          </Link>
        </Text>
      ) : null}
      <Text style={styles.p}>{c.change}</Text>
      <Button href={accountUrl} style={styles.button}>
        {c.cta}
      </Button>
    </EmailLayout>
  )
}
