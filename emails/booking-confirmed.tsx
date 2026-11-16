import { Button, Hr, Section, Text } from '@react-email/components'
import type { BookingEmailData } from './booking-types'
import { EmailLayout, GOLD, Rows, styles } from './layout'

export type PaymentInstruction = {
  /** "transfer" shows bank details; terminal and cash are paid at pick-up. */
  method: 'transfer' | 'terminal' | 'cash'
  amount: string | null
}

export type BookingConfirmedProps = {
  booking: BookingEmailData
  rental: PaymentInstruction
  deposit: PaymentInstruction
  /** Bank details for transfers; null while the company has not filled them in. */
  bank: { iban: string; swift: string; accountName: string } | null
  variableSymbol: string
  dueDate: string
  accountUrl: string
}

const COPY = {
  sk: {
    subject: (n: string) => `Rezervácia ${n} je potvrdená – BY THE WAVE`,
    heading: 'Vaša rezervácia je potvrdená',
    greeting: (name: string) => `Dobrý deň, ${name},`,
    intro: 'vozidlo je pre vás rezervované. Termín si môžete uložiť do kalendára z priloženého súboru.',
    numberLabel: 'Číslo rezervácie',
    summary: 'Sumár',
    vehicle: 'Vozidlo',
    pickup: 'Vyzdvihnutie',
    return: 'Odovzdanie',
    total: 'Cena prenájmu s DPH',
    deposit: 'Vratný depozit',
    payment: 'Platobné pokyny',
    rental: 'Prenájom',
    transfer: 'bankovým prevodom',
    terminal: 'platobným terminálom pri vyzdvihnutí',
    cash: 'v hotovosti pri vyzdvihnutí',
    bankTitle: 'Údaje pre bankový prevod',
    recipient: 'Príjemca',
    iban: 'IBAN',
    swift: 'SWIFT / BIC',
    vs: 'Variabilný symbol',
    due: 'Splatnosť',
    amount: 'Suma',
    bankMissing: 'Platobné údaje pre bankový prevod vám pošleme samostatne.',
    bring: 'Čo si priniesť',
    bringItems: ['občiansky preukaz alebo pas', 'vodičský preukaz', 'depozit (ak ho neuhrádzate prevodom)'],
    account: 'Rezerváciu môžete sledovať, upraviť alebo zrušiť v zákazníckej zóne.',
    accountCta: 'Otvoriť zákaznícku zónu',
    contact: 'V prípade otázok stačí odpovedať na tento e-mail.',
  },
  en: {
    subject: (n: string) => `Booking ${n} is confirmed – BY THE WAVE`,
    heading: 'Your booking is confirmed',
    greeting: (name: string) => `Dear ${name},`,
    intro: 'the vehicle is reserved for you. You can add the dates to your calendar from the attached file.',
    numberLabel: 'Booking number',
    summary: 'Summary',
    vehicle: 'Vehicle',
    pickup: 'Pick-up',
    return: 'Return',
    total: 'Rental price incl. VAT',
    deposit: 'Refundable deposit',
    payment: 'Payment instructions',
    rental: 'Rental',
    transfer: 'by bank transfer',
    terminal: 'by card at pick-up',
    cash: 'in cash at pick-up',
    bankTitle: 'Bank transfer details',
    recipient: 'Recipient',
    iban: 'IBAN',
    swift: 'SWIFT / BIC',
    vs: 'Payment reference',
    due: 'Due date',
    amount: 'Amount',
    bankMissing: 'We will send you the bank transfer details separately.',
    bring: 'What to bring',
    bringItems: ['ID card or passport', 'driving licence', 'the deposit (unless paid by transfer)'],
    account: 'You can follow, change or cancel your booking in the customer area.',
    accountCta: 'Open customer area',
    contact: 'If you have any questions, simply reply to this email.',
  },
}

export function bookingConfirmedSubject(booking: BookingEmailData): string {
  return COPY[booking.locale].subject(booking.number)
}

/** Email 3 – booking confirmed, with payment instructions for the rental and the deposit. */
export default function BookingConfirmedEmail({ booking, rental, deposit, bank, variableSymbol, dueDate, accountUrl }: BookingConfirmedProps) {
  const c = COPY[booking.locale]
  const place = (p: { at: string; place: string; address: string }) => (
    <>
      {p.at}
      <br />
      <span style={{ color: '#AAAAAA' }}>{p.address}</span>
    </>
  )
  const transfers = [
    rental.method === 'transfer' && rental.amount ? { label: c.rental, amount: rental.amount } : null,
    deposit.method === 'transfer' && deposit.amount ? { label: c.deposit, amount: deposit.amount } : null,
  ].filter((item): item is { label: string; amount: string } => item !== null)

  return (
    <EmailLayout locale={booking.locale} preview={`${c.numberLabel}: ${booking.number}`} company={booking.company}>
      <Text style={styles.h1}>{c.heading}</Text>
      <Text style={{ ...styles.p, marginTop: '16px' }}>
        {c.greeting(booking.customer.firstName)}
        <br />
        {c.intro}
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
          ...(booking.total ? [{ label: c.total, value: booking.total, strong: true }] : []),
          { label: c.deposit, value: booking.deposit },
        ]}
      />

      <Hr style={styles.rule} />
      <Text style={styles.h2}>{c.payment}</Text>
      <Rows
        rows={[
          { label: c.rental, value: `${rental.amount ?? ''} ${c[rental.method]}`.trim() },
          { label: c.deposit, value: `${deposit.amount ?? ''} ${c[deposit.method]}`.trim() },
        ]}
      />
      {transfers.length > 0 ? (
        <Section style={{ margin: '16px 0 0', padding: '16px 20px', border: '1px solid #333333', borderRadius: '8px' }}>
          <Text style={{ ...styles.small, color: '#ffffff', fontWeight: 700, marginBottom: '8px' }}>{c.bankTitle}</Text>
          {bank ? (
            <Rows
              rows={[
                { label: c.recipient, value: bank.accountName },
                { label: c.iban, value: bank.iban },
                ...(bank.swift ? [{ label: c.swift, value: bank.swift }] : []),
                { label: c.vs, value: variableSymbol },
                ...transfers.map((transfer) => ({ label: `${c.amount} – ${transfer.label.toLowerCase()}`, value: transfer.amount })),
                { label: c.due, value: dueDate },
              ]}
            />
          ) : (
            <Text style={{ ...styles.p, margin: 0 }}>{c.bankMissing}</Text>
          )}
        </Section>
      ) : null}

      <Hr style={styles.rule} />
      <Text style={styles.h2}>{c.bring}</Text>
      {c.bringItems.map((item) => (
        <Text key={item} style={{ ...styles.p, margin: '0 0 6px' }}>
          <span style={{ color: GOLD }}>—</span> {item}
        </Text>
      ))}

      <Hr style={styles.rule} />
      <Text style={styles.p}>{c.account}</Text>
      <Button href={accountUrl} style={styles.button}>
        {c.accountCta}
      </Button>
      <Text style={{ ...styles.small, marginTop: '28px' }}>{c.contact}</Text>
    </EmailLayout>
  )
}
