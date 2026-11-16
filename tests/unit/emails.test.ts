import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }))

import { renderBookingAdminNotification, renderBookingReceived, sendBookingAdminNotification } from '@/lib/email/booking-emails'
import { sampleBookingEmailData } from '@/lib/email/samples'
import { sendEmail } from '@/lib/email/send'

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
    expect(email.subject).toBe('Rezerváciu BTW-2027-0042 sme prijali – BY THE WAVE')
    for (const part of ['BTW-2027-0042', 'Mercedes-Benz E 220 d', 'Autosedačka (2 ks)', 'Spolu s DPH', 'DPH 23 %', 'Nastaviť heslo', '72 hodín', 'bankový prevod', 'hotovosť']) {
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
    expect(email.subject).toBe('We have received your booking BTW-2027-0042 – BY THE WAVE')
    expect(email.html).toContain('Total incl. VAT')
    expect(email.html).toContain('Child seat (2 pcs)')
    expect(email.html).not.toContain('Spolu s DPH')
  })

  it('announces an individual offer instead of a total for long rentals', async () => {
    const email = await renderBookingReceived({ booking: sampleBookingEmailData('sk', true), account: setPassword, termsUrl })
    expect(email.subject).toContain('Dopyt BTW-2027-0042')
    expect(email.html).toContain('Individuálna cena')
    expect(email.html).not.toContain('Základ dane')
  })
})

describe('email 2 – staff notification', () => {
  it('links to the admin and shows customer contact details', async () => {
    const email = await renderBookingAdminNotification({ booking: sampleBookingEmailData('sk'), adminUrl: 'https://rental.btw.sk/admin/rezervacie/1', pendingOverlaps: 0, isBlacklisted: false, isNewCustomer: true })
    dump('booking-admin', email.html)
    expect(email.subject).toContain('Nová rezervácia BTW-2027-0042 – Mercedes-Benz E 220 d')
    expect(email.html).toContain('href="https://rental.btw.sk/admin/rezervacie/1"')
    expect(email.html).toContain('mailto:anna.novakova@example.com')
    expect(email.html).toContain('tel:+421900123456')
    expect(email.html).not.toContain('Kolízia')
    expect(email.html).not.toContain('blacklist')
  })

  it('warns about a collision, a blacklisted customer and a missing price', async () => {
    const email = await renderBookingAdminNotification({ booking: sampleBookingEmailData('sk', true), adminUrl: 'https://rental.btw.sk/admin', pendingOverlaps: 2, isBlacklisted: true, isNewCustomer: false })
    dump('booking-admin-warnings', email.html)
    expect(email.html).toContain('Kolízia')
    expect(email.html).toContain('blacklist')
    expect(email.html).toContain('bez ceny')
  })

  it('goes to every notification address with the customer as reply-to', async () => {
    await sendBookingAdminNotification({ booking: sampleBookingEmailData('sk'), adminUrl: 'https://rental.btw.sk/admin', pendingOverlaps: 0, isBlacklisted: false, isNewCustomer: true }, ['a@btw.sk', 'b@btw.sk'], { bookingId: 'id' })
    const calls = vi.mocked(sendEmail).mock.calls.map(([message]) => message)
    expect(calls.map((m) => m.to)).toEqual(['a@btw.sk', 'b@btw.sk'])
    expect(calls.every((m) => m.replyTo === 'anna.novakova@example.com' && m.type === 'booking_admin_new' && m.bookingId === 'id')).toBe(true)
  })
})
