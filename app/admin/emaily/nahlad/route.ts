import { NextResponse, type NextRequest } from 'next/server'
import { getStaff } from '@/lib/auth/session'
import { renderBookingAdminNotification, renderBookingCancelled, renderBookingConfirmed, renderBookingReceived } from '@/lib/email/booking-emails'
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
  } else if (template === 'zrusena') {
    email = await renderBookingCancelled({
      booking: sampleBookingEmailData(variant === 'btw' ? 'sk' : locale),
      audience: variant === 'btw' ? 'staff' : 'customer',
      cancelledBy: 'staff',
      reason: locale === 'en' ? 'The vehicle is unexpectedly out of service.' : 'Vozidlo je neočakávane v servise.',
      fee: variant === 'poplatok' ? (locale === 'en' ? '€92' : '92 €') : null,
      adminUrl: `${origin}/admin/rezervacie`,
    })
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
