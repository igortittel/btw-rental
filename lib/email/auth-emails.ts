import 'server-only'
import type { AuthTokenPurpose } from '@/lib/auth/tokens'

type Locale = 'sk' | 'en'
type Kind = AuthTokenPurpose | 'staff_invite'

const COPY: Record<Locale, Record<Kind, { subject: string; heading: string; body: string; cta: string; validity: string }>> = {
  sk: {
    set_password: {
      subject: 'Nastavte si heslo do zákazníckej zóny BY THE WAVE',
      heading: 'Nastavenie hesla',
      body: 'Pre prístup k vašim rezerváciám si nastavte vlastné heslo. Odkaz je jednorazový.',
      cta: 'Nastaviť heslo',
      validity: 'Odkaz je platný 72 hodín.',
    },
    reset_password: {
      subject: 'Obnovenie hesla – BY THE WAVE',
      heading: 'Obnovenie hesla',
      body: 'Dostali sme žiadosť o obnovenie hesla k vášmu účtu. Ak ste o ňu nežiadali, tento email ignorujte – heslo zostane nezmenené.',
      cta: 'Nastaviť nové heslo',
      validity: 'Odkaz je platný 2 hodiny a dá sa použiť len raz.',
    },
    staff_invite: {
      subject: 'Pozvánka do administrácie BY THE WAVE Rental',
      heading: 'Pozvánka do administrácie',
      body: 'Bol vám vytvorený prístup do administrácie rezervačného systému. Nastavte si heslo a prihláste sa.',
      cta: 'Nastaviť heslo',
      validity: 'Odkaz je platný 72 hodín.',
    },
  },
  en: {
    set_password: {
      subject: 'Set your password for the BY THE WAVE customer area',
      heading: 'Set your password',
      body: 'Choose your own password to access your bookings. The link can be used once.',
      cta: 'Set password',
      validity: 'The link is valid for 72 hours.',
    },
    reset_password: {
      subject: 'Password reset – BY THE WAVE',
      heading: 'Password reset',
      body: 'We received a request to reset the password for your account. If you did not ask for it, ignore this email – your password stays unchanged.',
      cta: 'Set a new password',
      validity: 'The link is valid for 2 hours and can be used once.',
    },
    staff_invite: {
      subject: 'Invitation to BY THE WAVE Rental administration',
      heading: 'Administration invitation',
      body: 'An administration account has been created for you. Set your password and sign in.',
      cta: 'Set password',
      validity: 'The link is valid for 72 hours.',
    },
  },
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Minimal branded email (black, gold #B88746, thin gold rule). Replaced by React Email in Phase 5. */
export function buildPasswordLinkEmail(kind: Kind, locale: string, link: string) {
  const c = COPY[locale === 'en' ? 'en' : 'sk'][kind]
  const safeLink = escapeHtml(link)
  const html = `<!doctype html><html lang="${locale === 'en' ? 'en' : 'sk'}"><body style="margin:0;background:#111111;font-family:Montserrat,Arial,Helvetica,sans-serif;color:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111111;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border:1px solid #B88746;border-radius:12px;background:#1A1A1A;">
<tr><td style="padding:32px 32px 0;font-size:14px;letter-spacing:3px;color:#B88746;font-weight:700;">BY THE WAVE</td></tr>
<tr><td style="padding:16px 32px 0;"><div style="height:1px;background:#B88746;opacity:.6;"></div></td></tr>
<tr><td style="padding:24px 32px 0;font-size:22px;font-weight:700;color:#ffffff;">${escapeHtml(c.heading)}</td></tr>
<tr><td style="padding:16px 32px 0;font-size:15px;line-height:24px;color:#CCCCCC;">${escapeHtml(c.body)}</td></tr>
<tr><td style="padding:28px 32px 0;"><a href="${safeLink}" style="display:inline-block;background:#B88746;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:8px;">${escapeHtml(c.cta)}</a></td></tr>
<tr><td style="padding:20px 32px 0;font-size:13px;line-height:20px;color:#CCCCCC;">${escapeHtml(c.validity)}</td></tr>
<tr><td style="padding:16px 32px 32px;font-size:12px;line-height:18px;color:#999999;word-break:break-all;">${safeLink}</td></tr>
</table>
<div style="padding:16px;font-size:12px;color:#999999;">BY THE WAVE, s.r.o. · Trenčianska 56/A, Bratislava · btw@btw.sk</div>
</td></tr></table></body></html>`
  const text = `${c.heading}\n\n${c.body}\n\n${c.cta}: ${link}\n\n${c.validity}\n\nBY THE WAVE, s.r.o. · Trenčianska 56/A, Bratislava · btw@btw.sk`
  return { subject: c.subject, html, text }
}
