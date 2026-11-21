import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }))

import {
  renderBookingAdminNotification,
  renderBookingCancelled,
  renderBookingConfirmed,
  renderBookingReceived,
  sendBookingAdminNotification,
  sendBookingCancelled,
  sendBookingConfirmed,
} from '@/lib/email/booking-emails'
import { sampleBookingEmailData } from '@/lib/email/samples'
import { sendEmail } from '@/lib/email/send'
import { DEFAULT_SETTINGS } from '@/lib/settings'

const termsUrl = 'https://www.btw.sk/vseobecne-obchodne-podmienky'
const setPassword = { kind: 'set_password' as const, url: 'https://rental.btw.sk/nastavit-heslo?token=abc&next=%2Fmoj-ucet' }
const login = { kind: 'login' as const, url: 'https://rental.btw.sk/prihlasenie' }

/** EMAIL_PREVIEW_DIR=/some/dir npm test writes the rendered emails there for a visual check. */
function dump(name: string, html: string) {
  const dir = process.env.EMAIL_PREVIEW_DIR
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  writeFileSync(`${dir}/${name}.html`, html)
}

describe('email 1 – booking received', () => {
  it('shows the number, summary, price with VAT and the set-password link for a new account', async () => {
    const email = await renderBookingReceived({ booking: sampleBookingEmailData('sk'), account: setPassword, termsUrl })
    dump('booking-received-sk', email.html)
    expect(email.subject).toBe('Rezerváciu 20270042 sme prijali – BY THE WAVE')
    for (const part of ['20270042', 'Mercedes-Benz E 220 d', 'Autosedačka (2 ks)', 'Spolu s DPH', 'DPH 23 %', 'Nastaviť heslo', '72 hodín', 'bankový prevod', 'hotovosť']) {
      expect(email.html.replace(/&nbsp;|\u00a0/g, ' ')).toContain(part)
    }
    expect(email.html).toContain('href="https://rental.btw.sk/nastavit-heslo?token=abc&amp;next=%2Fmoj-ucet"')
    // 5 × 79 + 2 × 5 × 4 + 5 × 5 = 460 €
    expect(email.text.replace(/\u00a0/g, ' ')).toContain('460 €')
    expect(email.text).toContain('https://rental.btw.sk/nastavit-heslo?token=abc')
    expect(email.text).not.toMatch(/<[a-z]/i)
  })

  it('offers only a sign-in link to an existing account and never a password', async () => {
    const email = await renderBookingReceived({ booking: sampleBookingEmailData('sk'), account: login, termsUrl })
    expect(email.html).toContain('Prihlásiť sa')
    expect(email.html).not.toContain('Nastaviť heslo')
    expect(email.html).not.toContain('nastavit-heslo')
  })

  it('is written in English for English bookings', async () => {
    const email = await renderBookingReceived({ booking: sampleBookingEmailData('en'), account: setPassword, termsUrl })
    dump('booking-received-en', email.html)
    expect(email.subject).toBe('We have received your booking 20270042 – BY THE WAVE')
    expect(email.html).toContain('Total incl. VAT')
    expect(email.html).toContain('Child seat (2 pcs)')
    expect(email.html).not.toContain('Spolu s DPH')
  })

  it('announces an individual offer instead of a total for long rentals', async () => {
    const email = await renderBookingReceived({ booking: sampleBookingEmailData('sk', true), account: setPassword, termsUrl })
    expect(email.subject).toContain('Dopyt 20270042')
    expect(email.html).toContain('Individuálna cena')
    expect(email.html).not.toContain('Základ dane')
  })
})

describe('email 2 – staff notification', () => {
  it('links to the admin and shows customer contact details', async () => {
    const email = await renderBookingAdminNotification({
      booking: sampleBookingEmailData('sk'),
      adminUrl: 'https://rental.btw.sk/admin/rezervacie/1',
      pendingOverlaps: 0,
      isBlacklisted: false,
      isNewCustomer: true,
    })
    dump('booking-admin', email.html)
    expect(email.subject).toContain('Nová rezervácia 20270042 – Mercedes-Benz E 220 d')
    expect(email.html).toContain('href="https://rental.btw.sk/admin/rezervacie/1"')
    expect(email.html).toContain('mailto:anna.novakova@example.com')
    expect(email.html).toContain('tel:+421900123456')
    expect(email.html).not.toContain('Kolízia')
    expect(email.html).not.toContain('blacklist')
  })

  it('warns about a collision, a blacklisted customer and a missing price', async () => {
    const email = await renderBookingAdminNotification({
      booking: sampleBookingEmailData('sk', true),
      adminUrl: 'https://rental.btw.sk/admin',
      pendingOverlaps: 2,
      isBlacklisted: true,
      isNewCustomer: false,
    })
    dump('booking-admin-warnings', email.html)
    expect(email.html).toContain('Kolízia')
    expect(email.html).toContain('blacklist')
    expect(email.html).toContain('bez ceny')
  })

  it('goes to every notification address with the customer as reply-to', async () => {
    await sendBookingAdminNotification(
      { booking: sampleBookingEmailData('sk'), adminUrl: 'https://rental.btw.sk/admin', pendingOverlaps: 0, isBlacklisted: false, isNewCustomer: true },
      ['a@btw.sk', 'b@btw.sk'],
      { bookingId: 'id' },
    )
    const calls = vi.mocked(sendEmail).mock.calls.map(([message]) => message)
    expect(calls.map((m) => m.to)).toEqual(['a@btw.sk', 'b@btw.sk'])
    expect(calls.every((m) => m.replyTo === 'anna.novakova@example.com' && m.type === 'booking_admin_new' && m.bookingId === 'id')).toBe(true)
  })
})

describe("delivery to the customer's own address", () => {
  const build = async (deliveryOutsideCity: boolean) => {
    const { buildBookingEmailData } = await import('@/lib/booking/email-data')
    const { calculatePrice } = await import('@/lib/pricing')
    const base = sampleBookingEmailData('sk')
    const pickupAt = new Date('2027-06-14T08:00:00Z')
    const returnAt = new Date('2027-06-16T08:00:00Z')
    const location = { name: { sk: 'Bratislava – Trenčianska 56/A' }, address: 'Trenčianska 56/A, 821 09 Bratislava' }
    return buildBookingEmailData({
      locale: 'sk',
      number: '20270043',
      customer: base.customer,
      vehicleName: base.vehicleName,
      pickupAt,
      returnAt,
      price: calculatePrice({
        pickupAt,
        returnAt,
        tiers: [{ minDays: 1, maxDays: 30, pricePerDayCents: 7900 }],
        extras: [],
        pickupSurchargeCents: 0,
        returnSurchargeCents: 0,
        vatRate: 23,
        toleranceMinutes: 59,
        individualFromDays: 31,
      }),
      pickupLocation: location,
      returnLocation: location,
      pickupAddress: 'Hlavná stanica',
      returnAddress: null,
      deliveryOutsideCity,
      depositCents: 100000,
      kmLimitPerDay: 300,
      extraKmCents: 62,
      rentalPaymentMethod: 'transfer',
      depositPaymentMethod: 'cash',
      note: null,
      abroadTrip: false,
      abroadCountries: null,
      company: DEFAULT_SETTINGS.company,
    })
  }

  it('is free within Bratislava and raises no warning', async () => {
    const booking = await build(false)
    expect(booking.deliveryOutsideCity).toBe(false)
    const customer = await renderBookingReceived({ booking, account: login, termsUrl })
    expect(customer.html).toContain('Hlavná stanica')
    expect(customer.html).toContain('Pristavenie v Bratislave')
    expect(customer.html).toContain('bezplatne')
    expect(customer.html).not.toContain('riešime individuálne')
    const staff = await renderBookingAdminNotification({ booking, adminUrl: 'https://rental.btw.sk/admin', pendingOverlaps: 0, isBlacklisted: false, isNewCustomer: false })
    expect(staff.html).not.toContain('mimo Bratislavy')
  })

  it('outside Bratislava is announced as individual and staff are told to get in touch', async () => {
    const booking = await build(true)
    const customer = await renderBookingReceived({ booking, account: login, termsUrl })
    expect(customer.html).toContain('Pristavenie mimo Bratislavy')
    expect(customer.html).toContain('Budeme vás kontaktovať')
    const staff = await renderBookingAdminNotification({ booking, adminUrl: 'https://rental.btw.sk/admin', pendingOverlaps: 0, isBlacklisted: false, isNewCustomer: false })
    expect(staff.html).toContain('treba ho kontaktovať')
  })
})

describe('email 3 – booking confirmed', () => {
  const bank = { iban: 'SK31 1200 0000 1987 4263 7541', swift: 'TATRSKBX', accountName: 'BY THE WAVE, s.r.o.' }
  const props = (over = {}) => {
    const booking = sampleBookingEmailData('sk')
    return {
      booking,
      rental: { method: 'transfer' as const, amount: booking.total },
      deposit: { method: 'cash' as const, amount: booking.deposit },
      bank,
      variableSymbol: '20270042',
      dueDate: '11. 6. 2027',
      accountUrl: 'https://rental.btw.sk/moj-ucet',
      ...over,
    }
  }

  it('gives transfer details with the booking number as the payment reference', async () => {
    const email = await renderBookingConfirmed(props())
    dump('booking-confirmed', email.html)
    expect(email.subject).toBe('Rezervácia 20270042 je potvrdená – BY THE WAVE')
    const html = email.html.replace(/&nbsp;|\u00a0/g, ' ')
    for (const part of ['SK31 1200 0000 1987 4263 7541', 'TATRSKBX', '20270042', '11. 6. 2027', '460 € bankovým prevodom', '1 000 € v hotovosti pri vyzdvihnutí', 'vodičský preukaz'])
      expect(html).toContain(part)
    expect(email.text).toContain('20270042')
  })

  it('shows no bank details when nothing is paid by transfer', async () => {
    const email = await renderBookingConfirmed(props({ rental: { method: 'terminal', amount: '460 €' } }))
    expect(email.html).not.toContain('IBAN')
    expect(email.html).toContain('platobným terminálom pri vyzdvihnutí')
  })

  it('never shows placeholder bank details', async () => {
    const email = await renderBookingConfirmed(props({ bank: null }))
    expect(email.html).not.toContain('IBAN')
    expect(email.html).toContain('pošleme samostatne')
  })

  it('is sent with the term as a calendar attachment', async () => {
    vi.mocked(sendEmail).mockClear()
    await sendBookingConfirmed(props(), { bookingId: 'b', profileId: 'p', ics: 'BEGIN:VCALENDAR' })
    const message = vi.mocked(sendEmail).mock.calls[0][0]
    expect(message).toMatchObject({ type: 'booking_confirmed', to: 'anna.novakova@example.com', bookingId: 'b', profileId: 'p' })
    expect(message.attachments).toEqual([{ filename: '20270042.ics', content: 'BEGIN:VCALENDAR', contentType: 'text/calendar; charset=utf-8; method=PUBLISH' }])
  })
})

describe('email 6 – booking cancelled', () => {
  it('tells the customer who cancelled, why and the fee', async () => {
    const email = await renderBookingCancelled({ booking: sampleBookingEmailData('sk'), audience: 'customer', cancelledBy: 'staff', reason: 'Vozidlo je v servise.', fee: '92 €' })
    dump('booking-cancelled', email.html)
    expect(email.subject).toBe('Rezervácia 20270042 bola zrušená – BY THE WAVE')
    for (const part of ['vašu rezerváciu sme zrušili', 'Vozidlo je v servise.', '92 €']) expect(email.html).toContain(part)
  })

  it('says "free of charge" without a fee and adapts to a cancellation by the customer', async () => {
    const email = await renderBookingCancelled({ booking: sampleBookingEmailData('en'), audience: 'customer', cancelledBy: 'customer', reason: null, fee: null })
    expect(email.html).toContain('free of charge')
    expect(email.html).toContain('as you requested')
    expect(email.html).not.toContain('Reason')
  })

  it('goes to the customer and to every staff address', async () => {
    vi.mocked(sendEmail).mockClear()
    await sendBookingCancelled(
      { booking: sampleBookingEmailData('en'), staffBooking: sampleBookingEmailData('sk'), cancelledBy: 'staff', reason: null, fee: null, adminUrl: 'https://rental.btw.sk/admin/rezervacie/1' },
      ['a@btw.sk'],
      { bookingId: 'b', profileId: 'p' },
    )
    const calls = vi.mocked(sendEmail).mock.calls.map(([message]) => message)
    expect(calls.map((m) => [m.type, m.to])).toEqual([
      ['booking_cancelled', 'anna.novakova@example.com'],
      ['booking_cancelled_admin', 'a@btw.sk'],
    ])
    expect(calls[0].subject).toContain('has been cancelled')
    expect(calls[1].html).toContain('href="https://rental.btw.sk/admin/rezervacie/1"')
  })
})
