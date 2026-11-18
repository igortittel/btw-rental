import { NextResponse, type NextRequest } from 'next/server'
import { getStaff } from '@/lib/auth/session'
import { renderBookingAdminNotification, renderBookingCancelled, renderBookingChangeRequested, renderBookingChangeResolved, renderBookingConfirmed, renderBookingReceived, renderBookingReminder, renderDocumentAvailable, renderProtocolSigned, renderReviewRequest, renderSettlement } from '@/lib/email/booking-emails'
import { sampleBookingEmailData } from '@/lib/email/samples'
import { DEFAULT_SETTINGS } from '@/lib/settings'

export const dynamic = 'force-dynamic'

/** Staff-only preview of the email templates with sample data: ?sablona=…&jazyk=sk|en&varianta=… */
export async function GET(request: NextRequest) {
  if (!(await getStaff('operator'))) return new NextResponse('Forbidden', { status: 403 })

  const { searchParams, origin } = request.nextUrl
  const locale = searchParams.get('jazyk') === 'en' ? 'en' : 'sk'
  const variant = searchParams.get('varianta') ?? ''
  const individual = variant === 'dopyt'

  let email: { html: string; text: string; subject: string }
  const template = searchParams.get('sablona')
  if (template === 'potvrdena') {
    const booking = sampleBookingEmailData(locale)
    email = await renderBookingConfirmed({
      booking,
      rental: { method: 'transfer', amount: booking.total },
      deposit: { method: variant === 'prevod' ? 'transfer' : 'cash', amount: booking.deposit },
      bank: variant === 'bezbanky' ? null : { iban: 'SK31 1200 0000 1987 4263 7541', swift: 'TATRSKBX', accountName: 'BY THE WAVE, s.r.o.' },
      variableSymbol: '20270042',
      dueDate: locale === 'en' ? '11/06/2027' : '11. 6. 2027',
      accountUrl: `${origin}/moj-ucet`,
    })
  } else if (template === 'uprava') {
    email = await renderBookingChangeRequested({
      booking: sampleBookingEmailData('sk'),
      changes: [
        { label: 'Vyzdvihnutie', before: '14. 6. 2027 10:00', after: '15. 6. 2027 09:00' },
        { label: 'Odovzdanie', before: '19. 6. 2027 10:00', after: '21. 6. 2027 09:00' },
        { label: 'Doplnky', before: 'Autosedačka (2 ks), Druhý šofér', after: 'Autosedačka (2 ks)' },
        { label: 'Cena s DPH', before: '460 €', after: '522 €' },
      ],
      needsApproval: variant !== 'nova',
      collision: variant === 'kolizia',
      adminUrl: `${origin}/admin/rezervacie`,
    })
  } else if (template === 'rozhodnutie') {
    email = await renderBookingChangeResolved({
      booking: sampleBookingEmailData(locale),
      approved: variant !== 'zamietnuta',
      note: variant === 'zamietnuta' ? (locale === 'en' ? 'The vehicle is already booked for the requested dates.' : 'Vozidlo je v požadovanom termíne už rezervované.') : null,
      accountUrl: `${origin}/moj-ucet`,
    })
  } else if (template === 'zrusena') {
    email = await renderBookingCancelled({
      booking: sampleBookingEmailData(variant === 'btw' ? 'sk' : locale),
      audience: variant === 'btw' ? 'staff' : 'customer',
      cancelledBy: 'staff',
      reason: locale === 'en' ? 'The vehicle is unexpectedly out of service.' : 'Vozidlo je neočakávane v servise.',
      fee: variant === 'poplatok' ? (locale === 'en' ? '€92' : '92 €') : null,
      adminUrl: `${origin}/admin/rezervacie`,
    })
  } else if (template === 'protokol') {
    const isReturn = variant === 'preberaci'
    email = await renderProtocolSigned({
      booking: sampleBookingEmailData(locale),
      type: isReturn ? 'return' : 'pickup',
      handoverAt: locale === 'en' ? (isReturn ? '19/06/2027, 11:40' : '14/06/2027, 10:05') : isReturn ? '19. 6. 2027 11:40' : '14. 6. 2027 10:05',
      odometer: isReturn ? '50 195 km' : '48 210 km',
      fuel: isReturn ? '5/8 · 63 %' : '8/8 · 100 %',
      newDamages: isReturn ? 1 : 0,
      hasAttachment: true,
      accountUrl: `${origin}/moj-ucet`,
      assistancePhone: DEFAULT_SETTINGS.assistance.phone,
    })
  } else if (template === 'vyuctovanie') {
    const clean = variant === 'bez'
    const euro = (value: string) => (locale === 'en' ? `€${value.replace(',', '.')}` : `${value} €`)
    email = await renderSettlement({
      booking: sampleBookingEmailData(locale),
      lines: clean
        ? []
        : [
            { label: locale === 'en' ? 'Mileage over the limit' : 'Kilometre nad limit', detail: '485 km', amount: euro('300,70') },
            { label: locale === 'en' ? 'Fuel' : 'Palivo', amount: euro('45') },
            { label: locale === 'en' ? 'Damage' : 'Poškodenie', detail: locale === 'en' ? 'Dent · right side · front wing' : 'Preliačina · Pravý bok · predný blatník', amount: euro('180') },
            { label: locale === 'en' ? 'Late return' : 'Meškanie pri vrátení', detail: '1 h 40 min', amount: euro('79') },
          ],
      total: euro(clean ? '0' : '604,70'),
      hasCharges: !clean,
      deposit: euro('1 000'),
      refund: euro(clean ? '1 000' : '395,30'),
      due: null,
      note: clean ? null : locale === 'en' ? 'Thank you for letting us know about the delay in advance.' : 'Ďakujeme, že ste nám meškanie vopred oznámili.',
      accountUrl: `${origin}/moj-ucet`,
    })
  } else if (template === 'pripomienka') {
    const booking = sampleBookingEmailData(locale)
    email = await renderBookingReminder({
      booking,
      kind: variant === 'vratenie' ? 'return' : 'pickup',
      unpaid: { rental: variant === 'neuhradene' ? `${booking.total} · ${booking.rentalPayment}` : null, deposit: `${booking.deposit} · ${booking.depositPayment}` },
      toleranceMinutes: DEFAULT_SETTINGS.return_tolerance_minutes,
      assistancePhone: DEFAULT_SETTINGS.assistance.phone,
      accountUrl: `${origin}/moj-ucet`,
    })
  } else if (template === 'doklad') {
    email = await renderDocumentAvailable({
      booking: sampleBookingEmailData(locale),
      typeLabel: locale === 'en' ? 'Invoice' : 'Faktúra',
      number: 'FA2027-0102',
      amount: locale === 'en' ? '€460.00' : '460,00 €',
      issuedAt: locale === 'en' ? '19/06/2027' : '19. 6. 2027',
      hasAttachment: true,
      accountUrl: `${origin}/moj-ucet`,
    })
  } else if (template === 'recenzia') {
    email = await renderReviewRequest({ booking: sampleBookingEmailData(locale), reviewUrl: 'https://g.page/r/CfK31p1klMkpEBM/review', siteUrl: origin })
  } else if (template === 'admin') {
    email = await renderBookingAdminNotification({
      booking: sampleBookingEmailData('sk', individual),
      adminUrl: `${origin}/admin/rezervacie`,
      pendingOverlaps: variant === 'kolizia' ? 1 : 0,
      isBlacklisted: variant === 'kolizia',
      isNewCustomer: true,
    })
  } else {
    email = await renderBookingReceived({
      booking: sampleBookingEmailData(locale, individual),
      account: variant === 'existujuci' ? { kind: 'login', url: `${origin}/prihlasenie` } : { kind: 'set_password', url: `${origin}/nastavit-heslo?token=ukazka` },
      termsUrl: DEFAULT_SETTINGS.terms_url,
    })
  }

  if (searchParams.get('format') === 'text') {
    return new NextResponse(`Predmet: ${email.subject}\n\n${email.text}`, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex' } })
  }
  return new NextResponse(email.html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' } })
}
