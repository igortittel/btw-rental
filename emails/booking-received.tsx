import { Button, Hr, Link, Section, Text } from '@react-email/components'
import type { BookingEmailData } from './booking-types'
import { EmailLayout, GOLD, Rows, styles } from './layout'

export type BookingReceivedProps = {
  booking: BookingEmailData
  /** New account: one-time "set password" link. Existing account: link to the sign-in page. */
  account: { kind: 'set_password'; url: string } | { kind: 'login'; url: string }
  termsUrl: string
}

const COPY = {
  sk: {
    subject: (n: string, individual: boolean) => (individual ? `Dopyt ${n} sme prijali – BY THE WAVE` : `Rezerváciu ${n} sme prijali – BY THE WAVE`),
    heading: (individual: boolean) => (individual ? 'Váš dopyt sme prijali' : 'Vašu rezerváciu sme prijali'),
    greeting: (name: string) => `Dobrý deň, ${name},`,
    intro: 'ďakujeme za prejavenú dôveru. Rezervácia čaká na potvrdenie – overíme dostupnosť vozidla a ozveme sa vám e-mailom.',
    introIndividual: 'ďakujeme za prejavenú dôveru. Pri prenájme na dlhšie obdobie pripravujeme cenu individuálne – ponuku vám pošleme e-mailom.',
    numberLabel: 'Číslo rezervácie',
    summary: 'Sumár',
    vehicle: 'Vozidlo',
    pickup: 'Vyzdvihnutie',
    return: 'Odovzdanie',
    length: 'Dĺžka prenájmu',
    days: (n: number) => (n === 1 ? '1 deň' : n < 5 ? `${n} dni` : `${n} dní`),
    abroad: 'Cesta do zahraničia',
    note: 'Vaša poznámka',
    price: 'Cena',
    total: 'Spolu s DPH',
    net: 'Základ dane',
    vat: (rate: number) => `DPH ${rate} %`,
    individualPrice: 'Individuálna cena – pošleme vám ponuku',
    deliveryNote: 'Pristavenie vozidla mimo Bratislavy riešime individuálne. Budeme vás kontaktovať a dohodneme podmienky; prípadný poplatok v uvedenej sume zatiaľ nie je.',
    deposit: 'Vratný depozit (nie je súčasťou ceny)',
    kmLimit: 'Limit kilometrov',
    payment: 'Spôsob platby',
    rentalPayment: 'Prenájom',
    depositPayment: 'Depozit',
    next: 'Čo bude nasledovať',
    steps: [
      'Rezerváciu skontrolujeme a potvrdíme vám ju e-mailom.',
      'V potvrdení nájdete platobné pokyny. Pri bankovom prevode vám pošleme IBAN; variabilným symbolom je číslo rezervácie.',
      'Pri vyzdvihnutí si prosím pripravte občiansky preukaz alebo pas, vodičský preukaz a depozit.',
    ],
    accountNew: 'Zákaznícka zóna',
    accountNewText: 'Vytvorili sme vám účet, v ktorom môžete rezerváciu sledovať, upraviť alebo zrušiť. Nastavte si doň vlastné heslo.',
    setPassword: 'Nastaviť heslo',
    validity: 'Odkaz je jednorazový a platí 72 hodín.',
    accountExisting: 'Rezerváciu nájdete vo svojom účte',
    accountExistingText: 'Rezerváciu sme priradili k vášmu existujúcemu účtu. Po prihlásení ju môžete sledovať, upraviť alebo zrušiť.',
    login: 'Prihlásiť sa',
    terms: 'Všeobecné obchodné podmienky',
    termsText: 'Prenájom sa riadi dokumentom',
    contact: 'V prípade otázok stačí odpovedať na tento e-mail.',
  },
  en: {
    subject: (n: string, individual: boolean) => (individual ? `We have received your enquiry ${n} – BY THE WAVE` : `We have received your booking ${n} – BY THE WAVE`),
    heading: (individual: boolean) => (individual ? 'We have received your enquiry' : 'We have received your booking'),
    greeting: (name: string) => `Dear ${name},`,
    intro: 'thank you for choosing us. Your booking is awaiting confirmation – we will check the availability of the vehicle and get back to you by email.',
    introIndividual: 'thank you for choosing us. For longer rentals we prepare the price individually – we will send you an offer by email.',
    numberLabel: 'Booking number',
    summary: 'Summary',
    vehicle: 'Vehicle',
    pickup: 'Pick-up',
    return: 'Return',
    length: 'Rental length',
    days: (n: number) => (n === 1 ? '1 day' : `${n} days`),
    abroad: 'Travel abroad',
    note: 'Your note',
    price: 'Price',
    total: 'Total incl. VAT',
    net: 'Tax base',
    vat: (rate: number) => `VAT ${rate}%`,
    individualPrice: 'Individual price – we will send you an offer',
    deliveryNote: 'Delivery outside Bratislava is arranged individually. We will contact you to agree the conditions; any fee is not included in the total above yet.',
    deposit: 'Refundable deposit (not part of the price)',
    kmLimit: 'Mileage limit',
    payment: 'Payment method',
    rentalPayment: 'Rental',
    depositPayment: 'Deposit',
    next: 'What happens next',
    steps: [
      'We will review your booking and confirm it by email.',
      'The confirmation includes payment instructions. For a bank transfer we will send you the IBAN; the booking number serves as the payment reference.',
      'At pick-up, please have your ID card or passport, driving licence and the deposit ready.',
    ],
    accountNew: 'Customer area',
    accountNewText: 'We have created an account where you can follow, change or cancel your booking. Please set your own password.',
    setPassword: 'Set password',
    validity: 'The link can be used once and is valid for 72 hours.',
    accountExisting: 'Your booking is in your account',
    accountExistingText: 'We have added the booking to your existing account. Sign in to follow, change or cancel it.',
    login: 'Sign in',
    terms: 'General Terms and Conditions',
    termsText: 'The rental is governed by our',
    contact: 'If you have any questions, simply reply to this email.',
  },
}

export function bookingReceivedSubject(booking: BookingEmailData): string {
  return COPY[booking.locale].subject(booking.number, booking.isIndividual)
}

export default function BookingReceivedEmail({ booking, account, termsUrl }: BookingReceivedProps) {
  const c = COPY[booking.locale]
  const place = (p: { at: string; place: string; address: string }) => (
    <>
      {p.at}
      <br />
      <span style={{ color: '#AAAAAA' }}>{p.address}</span>
    </>
  )

  return (
    <EmailLayout locale={booking.locale} preview={`${c.numberLabel}: ${booking.number}`} company={booking.company}>
      <Text style={styles.h1}>{c.heading(booking.isIndividual)}</Text>
      <Text style={{ ...styles.p, marginTop: '16px' }}>
        {c.greeting(booking.customer.firstName)}
        <br />
        {booking.isIndividual ? c.introIndividual : c.intro}
      </Text>

      <Section style={{ margin: '20px 0', padding: '16px 20px', border: `1px solid ${GOLD}`, borderRadius: '8px' }}>
        <Text style={{ ...styles.small, letterSpacing: '1px', textTransform: 'uppercase' }}>{c.numberLabel}</Text>
        <Text style={{ margin: '4px 0 0', fontSize: '24px', lineHeight: '30px', fontWeight: 700, color: '#ffffff', letterSpacing: '1px' }}>{booking.number}</Text>
      </Section>

      <Text style={styles.h2}>{c.summary}</Text>
      <Rows
        rows={[
          { label: c.vehicle, value: booking.vehicleName },
          { label: c.pickup, value: place(booking.pickup) },
          { label: c.return, value: place(booking.return) },
          { label: c.length, value: c.days(booking.days) },
          { label: c.kmLimit, value: booking.kmLimit },
          ...(booking.abroad ? [{ label: c.abroad, value: booking.abroad }] : []),
          ...(booking.note ? [{ label: c.note, value: booking.note }] : []),
        ]}
      />

      <Hr style={styles.rule} />
      <Text style={styles.h2}>{c.price}</Text>
      <Rows rows={booking.lines.map((line) => ({ label: line.label, value: line.amount }))} />
      <Hr style={styles.thinRule} />
      {booking.total ? (
        <Rows
          rows={[
            { label: c.total, value: booking.total, strong: true },
            { label: c.net, value: booking.net },
            { label: c.vat(booking.vatRate), value: booking.vat },
            { label: c.deposit, value: booking.deposit },
          ]}
        />
      ) : (
        <Rows
          rows={[
            { label: c.total, value: c.individualPrice, strong: true },
            { label: c.deposit, value: booking.deposit },
          ]}
        />
      )}
      {booking.deliveryOutsideCity ? <Text style={{ ...styles.small, marginTop: '12px' }}>{c.deliveryNote}</Text> : null}

      <Hr style={styles.rule} />
      <Text style={styles.h2}>{c.payment}</Text>
      <Rows
        rows={[
          { label: c.rentalPayment, value: booking.rentalPayment },
          { label: c.depositPayment, value: booking.depositPayment },
        ]}
      />

      <Hr style={styles.rule} />
      <Text style={styles.h2}>{c.next}</Text>
      {c.steps.map((step, index) => (
        <Text key={index} style={{ ...styles.p, margin: '0 0 8px' }}>
          <span style={{ color: GOLD, fontWeight: 700 }}>{index + 1}.</span> {step}
        </Text>
      ))}

      <Hr style={styles.rule} />
      <Text style={styles.h2}>{account.kind === 'set_password' ? c.accountNew : c.accountExisting}</Text>
      <Text style={styles.p}>{account.kind === 'set_password' ? c.accountNewText : c.accountExistingText}</Text>
      <Button href={account.url} style={styles.button}>
        {account.kind === 'set_password' ? c.setPassword : c.login}
      </Button>
      {account.kind === 'set_password' ? <Text style={{ ...styles.small, marginTop: '12px' }}>{c.validity}</Text> : null}

      <Text style={{ ...styles.small, marginTop: '28px' }}>
        {c.termsText}{' '}
        <Link href={termsUrl} style={styles.link}>
          {c.terms}
        </Link>
        . {c.contact}
      </Text>
    </EmailLayout>
  )
}
