import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }))

import { customerEditBlock, describeBookingChange, modificationDeadline, type ChangeableBooking } from '@/lib/booking/change'
import { isCurrentBooking, mapsUrl } from '@/lib/account/view'
import { splitPhone } from '@/lib/booking/phone'
import { cancellationQuote } from '@/lib/cancellation'
import { renderBookingChangeRequested, renderBookingChangeResolved, sendBookingChangeRequested, sendBookingChangeResolved } from '@/lib/email/booking-emails'
import { sampleBookingEmailData } from '@/lib/email/samples'
import { sendEmail } from '@/lib/email/send'

const location = { name: { sk: 'Bratislava – Trenčianska 56/A', en: 'Bratislava – Trenčianska 56/A' }, address: 'Trenčianska 56/A, 821 09 Bratislava' }
const base: ChangeableBooking = {
  pickup_at: '2027-06-14T08:00:00Z',
  return_at: '2027-06-17T08:00:00Z',
  customer_note: null,
  total_cents: 23700,
  days: 3,
  abroad_trip: false,
  price_snapshot: { pickup_location: location, return_location: location },
}
const seat = { name_snapshot: { sk: 'Autosedačka', en: 'Child seat' }, quantity: 2 }

describe('customerEditBlock', () => {
  const booking = { status: 'confirmed', pickup_at: '2027-06-14T08:00:00Z', total_cents: 23700, price_override_reason: null }
  const now = (hoursBefore: number) => new Date(Date.parse(booking.pickup_at) - hoursBefore * 3600_000)

  it('allows new and confirmed bookings before the deadline', () => {
    expect(customerEditBlock(booking, 48, now(100))).toBeNull()
    expect(customerEditBlock({ ...booking, status: 'new' }, 48, now(100))).toBeNull()
  })

  it('closes exactly at the deadline', () => {
    expect(customerEditBlock(booking, 48, now(48))).toBeNull()
    expect(customerEditBlock(booking, 48, now(47.99))).toBe('deadline')
    expect(modificationDeadline(new Date(booking.pickup_at), 48).toISOString()).toBe('2027-06-12T08:00:00.000Z')
  })

  it('blocks other statuses', () => {
    for (const status of ['modified', 'active', 'completed', 'cancelled']) expect(customerEditBlock({ ...booking, status }, 48, now(100))).toBe('status')
  })

  it('blocks bookings whose price was agreed by hand or is not set yet', () => {
    expect(customerEditBlock({ ...booking, price_override_reason: 'Zľava' }, 48, now(100))).toBe('manual_price')
    expect(customerEditBlock({ ...booking, total_cents: null }, 48, now(100))).toBe('manual_price')
  })
})

describe('describeBookingChange', () => {
  it('lists only what differs', () => {
    expect(describeBookingChange(base, [seat], base, [seat])).toEqual([])
    const rows = describeBookingChange(base, [seat], { ...base, return_at: '2027-06-18T08:00:00Z', total_cents: 31600, days: 4 }, [seat])
    expect(rows.map((row) => row.label)).toEqual(['Odovzdanie', 'Cena s DPH'])
    expect(rows[0]).toEqual({ label: 'Odovzdanie', before: '17. 6. 2027 10:00', after: '18. 6. 2027 10:00' })
    expect(rows[1].after.replace(/ /g, ' ')).toBe('316 €')
  })

  it('describes places, extras, travel abroad and the note', () => {
    const after: ChangeableBooking = { ...base, pickup_custom_address: 'Hlavná stanica, Bratislava', abroad_trip: true, abroad_countries: 'Rakúsko', customer_note: 'Prídem neskôr' }
    const rows = describeBookingChange(base, [seat], after, [
      { ...seat, quantity: 1 },
      { name_snapshot: { sk: 'Strešný box' }, quantity: 1 },
    ])
    expect(rows).toEqual([
      { label: 'Miesto vyzdvihnutia', before: 'Bratislava – Trenčianska 56/A', after: 'Hlavná stanica, Bratislava' },
      { label: 'Doplnky', before: 'Autosedačka (2 ks)', after: 'Autosedačka, Strešný box' },
      { label: 'Cesta do zahraničia', before: 'nie', after: 'Rakúsko' },
      { label: 'Poznámka', before: '—', after: 'Prídem neskôr' },
    ])
  })

  it('is available in English', () => {
    const rows = describeBookingChange(base, [seat], { ...base, total_cents: null }, [], 'en')
    expect(rows).toEqual([
      { label: 'Extras', before: 'Child seat (2 pcs)', after: '—' },
      { label: 'Price incl. VAT', before: expect.stringContaining('237'), after: 'individual' },
    ])
  })
})

describe('customer area helpers', () => {
  it('splits a stored phone number into dial code and number', () => {
    expect(splitPhone('+421900123456')).toEqual({ phonePrefix: '+421', phoneNumber: '900123456' })
    expect(splitPhone('+420601123456')).toEqual({ phonePrefix: '+420', phoneNumber: '601123456' })
    expect(splitPhone('+4366412345')).toEqual({ phonePrefix: '+43', phoneNumber: '66412345' })
    expect(splitPhone('0900123456')).toBeNull()
    expect(splitPhone(null)).toBeNull()
  })

  it('separates current bookings from history', () => {
    expect(['new', 'confirmed', 'modified', 'active', 'completed', 'cancelled'].map((s) => isCurrentBooking(s as never))).toEqual([true, true, true, true, false, false])
  })

  it('builds a map link for an address', () => {
    expect(mapsUrl('Trenčianska 56/A, Bratislava')).toBe('https://www.google.com/maps/search/?api=1&query=Tren%C4%8Dianska%2056%2FA%2C%20Bratislava')
  })

  it('shows the customer the same fee the database will charge (default tiers)', () => {
    // Mirrors the cases in supabase/tests/03_customer_zone.sql.
    const tiers = [
      { min_hours: 72, fee_percent: 0 },
      { min_hours: 24, fee_percent: 20 },
      { min_hours: 0, fee_percent: 100 },
    ]
    const now = new Date('2027-06-01T00:00:00Z')
    const fee = (hours: number, total: number | null) => cancellationQuote(new Date(now.getTime() + hours * 3600_000), total, tiers, now).feeCents
    expect([fee(200, 23700), fee(72, 23700), fee(24 + 1 / 60, 23700), fee(24, 23700), fee(-5, 23700), fee(1, null), fee(30, 3333)]).toEqual([0, 4740, 4740, 23700, 23700, 0, 667])
  })
})

describe('email 4 – change requested (staff)', () => {
  const changes = [{ label: 'Odovzdanie', before: '17. 6. 2027 10:00', after: '18. 6. 2027 10:00' }]
  const props = (over = {}) => ({ booking: sampleBookingEmailData('sk'), changes, needsApproval: true, collision: false, adminUrl: 'https://rental.btw.sk/admin/rezervacie/1', ...over })

  it('shows old and new values and links to the admin', async () => {
    const email = await renderBookingChangeRequested(props())
    expect(email.subject).toBe('Úprava na schválenie BTW-2027-0042 – Mercedes-Benz E 220 d')
    for (const part of ['17. 6. 2027 10:00', '18. 6. 2027 10:00', 'čaká na schválenie', 'href="https://rental.btw.sk/admin/rezervacie/1"']) expect(email.html).toContain(part)
    expect(email.html).not.toContain('koliduje')
  })

  it('warns about a collision and distinguishes a rewritten new booking', async () => {
    expect((await renderBookingChangeRequested(props({ collision: true }))).html).toContain('koliduje')
    const direct = await renderBookingChangeRequested(props({ needsApproval: false }))
    expect(direct.subject).toContain('Zákazník upravil rezerváciu')
    expect(direct.html).toContain('zapísali priamo')
  })

  it('goes to every staff address', async () => {
    vi.mocked(sendEmail).mockClear()
    await sendBookingChangeRequested(props(), ['a@btw.sk', 'b@btw.sk'], { bookingId: 'b' })
    expect(vi.mocked(sendEmail).mock.calls.map(([m]) => [m.type, m.to, m.replyTo])).toEqual([
      ['booking_change_requested', 'a@btw.sk', 'anna.novakova@example.com'],
      ['booking_change_requested', 'b@btw.sk', 'anna.novakova@example.com'],
    ])
  })
})

describe('email 5 – change approved / rejected (customer)', () => {
  it('approved: confirms the new term', async () => {
    const email = await renderBookingChangeResolved({ booking: sampleBookingEmailData('sk'), approved: true, note: null, accountUrl: 'https://rental.btw.sk/moj-ucet/rezervacie/1' })
    expect(email.subject).toBe('Úprava rezervácie BTW-2027-0042 je schválená – BY THE WAVE')
    expect(email.html).toContain('vašu úpravu sme schválili')
    expect(email.html).toContain('href="https://rental.btw.sk/moj-ucet/rezervacie/1"')
  })

  it('rejected: says the original stays valid and gives the reason', async () => {
    const email = await renderBookingChangeResolved({ booking: sampleBookingEmailData('en'), approved: false, note: 'Vehicle already booked.', accountUrl: 'https://rental.btw.sk/en/moj-ucet' })
    expect(email.subject).toContain('could not approve')
    expect(email.html).toContain('remains valid as originally confirmed')
    expect(email.html).toContain('Vehicle already booked.')
  })

  it('is logged under a type that tells the outcome', async () => {
    vi.mocked(sendEmail).mockClear()
    await sendBookingChangeResolved({ booking: sampleBookingEmailData('sk'), approved: false, note: null, accountUrl: 'x' }, { bookingId: 'b', profileId: 'p' })
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toMatchObject({ type: 'booking_change_rejected', to: 'anna.novakova@example.com', bookingId: 'b', profileId: 'p' })
  })
})
