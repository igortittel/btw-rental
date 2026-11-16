import { NextResponse, type NextRequest } from 'next/server'
import { getStaff } from '@/lib/auth/session'
import { renderBookingAdminNotification, renderBookingReceived } from '@/lib/email/booking-emails'
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
  if (searchParams.get('sablona') === 'admin') {
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
