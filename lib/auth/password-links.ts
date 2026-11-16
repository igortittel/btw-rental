import 'server-only'
import { issueAuthToken, type AuthTokenPurpose } from '@/lib/auth/tokens'
import { buildPasswordLinkEmail } from '@/lib/email/auth-emails'
import { sendEmail } from '@/lib/email/send'
import { getSiteOrigin } from '@/lib/site-url'

type Options = {
  profileId: string
  email: string
  locale: string
  purpose: AuthTokenPurpose
  /** Email wording; defaults to the purpose. */
  kind?: AuthTokenPurpose | 'staff_invite'
  createdBy?: string | null
  /** Relative path to continue to after the password is set. */
  next?: string
}

/**
 * Issues a one-time "set password" link and emails it. The password itself is never
 * sent by email. Returns the link so that staff-initiated flows can show it when
 * email delivery is not available.
 */
export async function sendPasswordLink(options: Options) {
  const { token, expiresAt } = await issueAuthToken(options.profileId, options.purpose, options.createdBy)
  const origin = await getSiteOrigin()
  const prefix = options.locale === 'en' ? '/en' : ''
  const params = new URLSearchParams({ token })
  if (options.next) params.set('next', options.next)
  const link = `${origin}${prefix}/nastavit-heslo?${params.toString()}`

  const email = buildPasswordLinkEmail(options.kind ?? options.purpose, options.locale, link)
  const result = await sendEmail({
    type: options.kind ?? options.purpose,
    to: options.email,
    locale: options.locale,
    profileId: options.profileId,
    ...email,
  })
  return { link, expiresAt, emailSent: result.sent }
}
