import { Button, Hr, Text } from '@react-email/components'
import type { BookingEmailData } from './booking-types'
import { EmailLayout, styles } from './layout'

export type ReviewRequestProps = {
  booking: BookingEmailData
  reviewUrl: string
  /** Link to rent again (the catalogue). */
  siteUrl: string
}

const COPY = {
  sk: {
    subject: 'Ďakujeme, že ste jazdili s BY THE WAVE',
    heading: 'Ďakujeme za vašu jazdu',
    greeting: (name: string) => `Dobrý deň, ${name},`,
    intro: (vehicle: string) => `ďakujeme, že ste si na cestu vybrali ${vehicle} od BY THE WAVE. Dúfame, že ste boli spokojní.`,
    ask: 'Ak máte minútu, budeme radi za vaše hodnotenie na Google. Pomôže ďalším zákazníkom aj nám.',
    cta: 'Napísať recenziu',
    again: 'Keď budete znova potrebovať auto, radi vás uvidíme.',
    rent: 'Pozrieť vozidlá',
  },
  en: {
    subject: 'Thank you for driving with BY THE WAVE',
    heading: 'Thank you for your trip',
    greeting: (name: string) => `Dear ${name},`,
    intro: (vehicle: string) => `thank you for choosing the ${vehicle} from BY THE WAVE. We hope you enjoyed the ride.`,
    ask: 'If you have a minute, we would appreciate your review on Google. It helps other customers and us.',
    cta: 'Write a review',
    again: 'Whenever you need a car again, we will be happy to see you.',
    rent: 'Browse vehicles',
  },
}

export function reviewRequestSubject(props: Pick<ReviewRequestProps, 'booking'>): string {
  return COPY[props.booking.locale].subject
}

/** Email 12 – thank you and a request for a Google review, some days after the rental (customer). */
export default function ReviewRequestEmail({ booking, reviewUrl, siteUrl }: ReviewRequestProps) {
  const c = COPY[booking.locale]
  return (
    <EmailLayout locale={booking.locale} preview={c.heading} company={booking.company}>
      <Text style={styles.h1}>{c.heading}</Text>
      <Text style={{ ...styles.p, marginTop: '16px' }}>
        {c.greeting(booking.customer.firstName)}
        <br />
        {c.intro(booking.vehicleName)}
      </Text>
      <Text style={styles.p}>{c.ask}</Text>
      <Button href={reviewUrl} style={styles.button}>
        {c.cta}
      </Button>
      <Hr style={styles.rule} />
      <Text style={styles.p}>
        {c.again}{' '}
        <a href={siteUrl} style={styles.link}>
          {c.rent}
        </a>
      </Text>
    </EmailLayout>
  )
}
