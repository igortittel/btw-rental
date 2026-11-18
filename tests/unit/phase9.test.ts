import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }))

import { actionLabel, auditChanges, formatAuditValue } from '@/lib/audit/format'
import { dailyWindows, localDate } from '@/lib/cron/windows'
import { csvCell, toCsv } from '@/lib/csv'
import { matchBlacklist, phoneKey, type BlacklistEntry } from '@/lib/customers/blacklist'
import { documentFileName, documentPath, isDocumentPathOf, looksLikePdf } from '@/lib/documents'
import { renderBookingReminder, renderDocumentAvailable, renderReviewRequest, sendBookingReminder, sendDocumentAvailable, sendReviewRequest } from '@/lib/email/booking-emails'
import { sampleBookingEmailData } from '@/lib/email/samples'
import { sendEmail } from '@/lib/email/send'
import { depositOutstandingCents, depositOverpaidCents, depositReturnProposal, missingPayments, paymentDateToUtc, rentalOutstandingCents, rentalOverpaidCents, unpaidCents, type PaymentState } from '@/lib/payment'
import { protocolErrorMessage, protocolMissing } from '@/lib/protocol/model'

const nbsp = (s: string) => s.replace(/&nbsp;| /g, ' ')

describe('payments before pick-up', () => {
  const base: PaymentState = { total_cents: 63200, deposit_cents: 100000, rental_payment_status: 'unpaid', deposit_status: 'pending' }

  it('lists the rental and the deposit until both are recorded', () => {
    expect(missingPayments(base)).toEqual(['rental', 'deposit'])
    expect(unpaidCents(base)).toBe(163200)
    expect(missingPayments({ ...base, rental_payment_status: 'paid' })).toEqual(['deposit'])
    expect(missingPayments({ ...base, rental_payment_status: 'paid', deposit_status: 'received' })).toEqual([])
  })

  it('does not ask for an individual price without an amount, a free rental or a zero deposit (same rule as sign_protocol)', () => {
    expect(missingPayments({ ...base, total_cents: null })).toEqual(['deposit'])
    expect(missingPayments({ ...base, total_cents: 0 })).toEqual(['deposit'])
    expect(missingPayments({ ...base, deposit_cents: 0 })).toEqual(['rental'])
  })

  it('a price change after payment leaves a top-up or an overpayment (same rule as the database)', () => {
    const paid: PaymentState = { ...base, rental_payment_status: 'paid', rental_paid_cents: 63200, deposit_status: 'received', deposit_received_cents: 100000 }
    expect(missingPayments(paid)).toEqual([])
    const higher = { ...paid, total_cents: 71100 }
    expect(rentalOutstandingCents(higher)).toBe(7900)
    expect(missingPayments(higher)).toEqual(['rental'])
    expect(unpaidCents(higher)).toBe(7900)
    const lower = { ...paid, total_cents: 55300 }
    expect(rentalOutstandingCents(lower)).toBe(0)
    expect(rentalOverpaidCents(lower)).toBe(7900)
    expect(rentalOverpaidCents({ ...lower, rental_refunded_cents: 7900 })).toBe(0)
    expect(rentalOutstandingCents({ ...lower, rental_refunded_cents: 7900 })).toBe(0)
    const biggerDeposit = { ...paid, deposit_cents: 150000 }
    expect(depositOutstandingCents(biggerDeposit)).toBe(50000)
    expect(missingPayments(biggerDeposit)).toEqual(['deposit'])
    expect(depositOverpaidCents({ ...paid, deposit_cents: 80000 })).toBe(20000)
    // records from before the amounts were stored count as paid in full
    expect(rentalOutstandingCents({ ...base, rental_payment_status: 'paid' })).toBe(0)
  })

  it('the protocol lists missing payments and maps the database error', () => {
    const draft = { handoverAt: '2026-11-18T10:00', odometerKm: 1000, fuelLevel: 100, chargeLevel: null, interior: 'clean', exterior: 'clean', accessories: [], damages: [], photos: [], note: '', customerName: 'A', staffName: 'B' }
    const missing = protocolMissing(draft as never, { fuel: 'diesel', customerSigned: true, staffSigned: true, unpaid: ['rental', 'deposit'] })
    expect(missing.slice(0, 2)).toEqual(['úhrada prenájmu', 'prijatie depozitu'])
    expect(protocolErrorMessage('protocol_incomplete: payments')).toContain('úhrada prenájmu a prijatie depozitu')
  })

  it('proposes the deposit return from the approved settlement', () => {
    expect(depositReturnProposal(100000, 18600)).toEqual({ refundCents: 81400, dueCents: 0 })
    expect(depositReturnProposal(100000, null)).toEqual({ refundCents: 100000, dueCents: 0 })
    expect(depositReturnProposal(100000, 125000)).toEqual({ refundCents: 0, dueCents: 25000 })
  })

  it('stores a payment day at noon in Bratislava (summer and winter time)', () => {
    expect(paymentDateToUtc('2026-11-17')).toBe('2026-11-17T11:00:00.000Z')
    expect(paymentDateToUtc('2026-07-01')).toBe('2026-07-01T10:00:00.000Z')
    expect(paymentDateToUtc('17.11.2026')).toBeNull()
  })
})

describe('documents', () => {
  const booking = '3f9c0b6e-1111-4a2b-9c3d-0123456789ab'
  it('keeps every file inside the booking folder', () => {
    const path = documentPath(booking, '91b2c3d4-2222-4a2b-9c3d-0123456789ab')
    expect(path).toBe(`${booking}/91b2c3d4-2222-4a2b-9c3d-0123456789ab.pdf`)
    expect(isDocumentPathOf(booking, path)).toBe(true)
    expect(isDocumentPathOf(booking, `${booking}/../x.pdf`)).toBe(false)
    expect(isDocumentPathOf(booking, `other/${path}`)).toBe(false)
    expect(isDocumentPathOf('91b2c3d4-2222-4a2b-9c3d-0123456789ab', path)).toBe(false)
  })
  it('recognises a PDF by its header', () => {
    expect(looksLikePdf(new TextEncoder().encode('%PDF-1.7\n'))).toBe(true)
    expect(looksLikePdf(new TextEncoder().encode('<html>'))).toBe(false)
  })
  it('builds an ASCII download name', () => {
    expect(documentFileName('proforma', 'ZF2026/0031', 'doklad')).toBe('Zalohova-faktura-ZF2026-0031.pdf')
    expect(documentFileName('invoice', null, 'doklad')).toBe('Faktura.pdf')
  })
})

describe('blacklist matching', () => {
  const entries: BlacklistEntry[] = [{ profileId: 'p1', name: 'Tomáš Varga', email: 'tomas@example.cz', phone: '+420 602 111 222', note: 'znečistené vozidlo' }]
  it('matches the account, the e-mail (case-insensitive) or the phone written differently', () => {
    expect(matchBlacklist(entries, { customerId: 'p1' })[0].via).toBe('account')
    expect(matchBlacklist(entries, { customerId: 'p2', email: 'TOMAS@example.cz' })[0].via).toBe('email')
    expect(matchBlacklist(entries, { customerId: 'p2', phone: '00420602111222' })[0].via).toBe('phone')
    expect(matchBlacklist(entries, { customerId: 'p2', email: 'iny@example.cz', phone: '+421 905 000 000' })).toEqual([])
  })
  it('ignores too short phone numbers', () => {
    expect(phoneKey('123')).toBeNull()
    expect(phoneKey('+421 905 123 456')).toBe('905123456')
  })
})

describe('daily cron windows', () => {
  it('reminds from now until the end of tomorrow (local days)', () => {
    const now = new Date('2026-11-18T05:00:00Z') // 6:00 in Bratislava
    const w = dailyWindows(now, 3)
    expect(w.remindUntil.toISOString()).toBe('2026-11-19T23:00:00.000Z') // midnight after tomorrow
    expect(w.pickedUpBefore.toISOString()).toBe('2026-11-18T23:00:00.000Z')
    // returned on 15 Nov or earlier (3 days ago), at most 30 days back
    expect(w.reviewReturnedBefore.toISOString()).toBe('2026-11-15T23:00:00.000Z')
    expect(w.reviewReturnedAfter.toISOString()).toBe('2026-10-18T22:00:00.000Z')
  })
  it('counts local days across the change to winter time', () => {
    expect(localDate(new Date('2026-10-24T22:30:00Z'))).toBe('2026-10-25')
    const w = dailyWindows(new Date('2026-10-24T05:00:00Z'), 3)
    expect(w.remindUntil.toISOString()).toBe('2026-10-25T23:00:00.000Z') // 26 Oct 00:00 CET
  })
})

describe('audit log formatting', () => {
  it('shows payment changes in words and euros', () => {
    const rows = auditChanges('update', { deposit_status: { old: 'received', new: 'partially_returned' }, deposit_returned_cents: { old: null, new: 81400 }, updated_at: { old: 'x', new: 'y' } })
    expect(rows.map((r) => r.field)).toEqual(['Stav depozitu', 'Vrátený depozit'])
    expect(nbsp(rows[0].after)).toBe('Čiastočne vrátený')
    expect(nbsp(rows[1].after)).toBe('814,00 €')
    expect(rows[1].before).toBe('—')
  })
  it('never shows values of redacted profile changes', () => {
    expect(auditChanges('update', { phone: { changed: true } })).toEqual([{ field: 'Telefón', before: '(skryté)', after: '(zmenené)' }])
  })
  it('labels GDPR actions', () => {
    expect(actionLabel('customer.anonymize')).toEqual({ label: 'Anonymizácia', tone: 'gdpr' })
    expect(auditChanges('customer.anonymize', { bookings: 2, requested_at: null })).toEqual([{ field: 'Rezervácie', before: '', after: '2' }])
    expect(formatAuditValue('is_blacklisted', true)).toBe('áno')
  })
})

describe('CSV', () => {
  it('neutralises formulas and quotes', () => {
    expect(csvCell('=SUM(A1)')).toBe(`"'=SUM(A1)"`)
    expect(csvCell('Firma "X"')).toBe('"Firma ""X"""')
    expect(toCsv([['a', 1]])).toBe('﻿"a";"1"\r\n')
  })
})

describe('emails 7, 9, 11, 12', () => {
  it('7 – pick-up reminder lists what to bring and an unpaid rental', async () => {
    const booking = sampleBookingEmailData('sk')
    const email = await renderBookingReminder({ booking, kind: 'pickup', unpaid: { rental: `${booking.total} · bankový prevod`, deposit: null }, toleranceMinutes: 59, assistancePhone: '+421 900 000 000', accountUrl: 'https://rental.btw.sk/moj-ucet' })
    expect(email.subject).toBe('Zajtra vyzdvihnutie vozidla – BTW-2027-0042')
    for (const part of ['Pripomienka vyzdvihnutia', 'občiansky preukaz', 'vodičský preukaz', 'Prenájom zatiaľ nemáme uhradený', '+421 900 000 000', 'Zobraziť rezerváciu']) expect(nbsp(email.html)).toContain(part)
    expect(email.text).not.toMatch(/<[a-z]/i)
  })
  it('9 – return reminder mentions fuel, tolerance and the km limit (EN)', async () => {
    const email = await renderBookingReminder({ booking: sampleBookingEmailData('en'), kind: 'return', unpaid: { rental: null, deposit: null }, toleranceMinutes: 59, assistancePhone: null, accountUrl: 'https://rental.btw.sk/en/moj-ucet' })
    expect(email.subject).toBe('Vehicle return tomorrow – BTW-2027-0042')
    expect(nbsp(email.html)).toContain('more than 59 minutes')
    expect(nbsp(email.html)).toContain('Mileage limit')
  })
  it('11 – document available, sent with the PDF attached', async () => {
    const props = { booking: sampleBookingEmailData('sk'), typeLabel: 'Faktúra', number: 'FA2026-0102', amount: '632,00 €', issuedAt: '17. 11. 2026', hasAttachment: true, accountUrl: 'https://rental.btw.sk/moj-ucet' }
    const email = await renderDocumentAvailable(props)
    expect(email.subject).toBe('Faktúra k rezervácii BTW-2027-0042 – BY THE WAVE')
    expect(nbsp(email.html)).toContain('FA2026-0102')
    await sendDocumentAvailable(props, { bookingId: 'b', profileId: 'p', pdf: { filename: 'Faktura-FA2026-0102.pdf', content: Buffer.from('%PDF-') } })
    expect(vi.mocked(sendEmail).mock.lastCall?.[0]).toMatchObject({ type: 'document_available', to: 'anna.novakova@example.com', attachments: [{ filename: 'Faktura-FA2026-0102.pdf', contentType: 'application/pdf' }] })
  })
  it('12 – thank you with the Google review link', async () => {
    const props = { booking: sampleBookingEmailData('sk'), reviewUrl: 'https://g.page/r/CfK31p1klMkpEBM/review', siteUrl: 'https://rental.btw.sk' }
    const email = await renderReviewRequest(props)
    expect(email.html).toContain('href="https://g.page/r/CfK31p1klMkpEBM/review"')
    expect(nbsp(email.html)).toContain('Napísať recenziu')
    await sendReviewRequest(props, { bookingId: 'b', profileId: 'p' })
    expect(vi.mocked(sendEmail).mock.lastCall?.[0]).toMatchObject({ type: 'review_request' })
    await sendBookingReminder({ booking: sampleBookingEmailData('sk'), kind: 'return', unpaid: { rental: null, deposit: null }, toleranceMinutes: 59, assistancePhone: null, accountUrl: 'x' }, { bookingId: 'b', profileId: 'p' })
    expect(vi.mocked(sendEmail).mock.lastCall?.[0]).toMatchObject({ type: 'return_reminder' })
  })
})
