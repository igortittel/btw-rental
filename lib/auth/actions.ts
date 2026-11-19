'use server'

import { redirect } from 'next/navigation'
import { localizedPath } from '@/i18n/routing'
import { emailSchema, newPasswordSchema } from '@/lib/auth/password'
import { sendPasswordLink } from '@/lib/auth/password-links'
import { getClientIp, rateLimit } from '@/lib/auth/rate-limit'
import { safeNextPath } from '@/lib/auth/roles'
import { consumeAuthToken, peekAuthToken } from '@/lib/auth/tokens'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { verifyTurnstile } from '@/lib/turnstile'
import { isPwnedPassword } from '@/lib/auth/pwned'

export type AuthFormState = { error?: string; ok?: boolean }

function field(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

async function destinationFor(userId: string, locale: string, next: string | null): Promise<string> {
  const supabase = await createClient()
  const { data: staff } = await supabase.from('staff_roles').select('is_active').eq('user_id', userId).maybeSingle()
  if (staff?.is_active) return safeNextPath(next?.startsWith('/admin') ? next : null, '/admin')
  // Customers never land in /admin, whatever `next` says.
  const target = safeNextPath(next, localizedPath(locale, '/moj-ucet'))
  return target.startsWith('/admin') ? localizedPath(locale, '/moj-ucet') : target
}

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = emailSchema.safeParse(field(formData, 'email'))
  const password = field(formData, 'password')
  const locale = field(formData, 'locale') === 'en' ? 'en' : 'sk'
  if (!email.success || !password) return { error: 'invalid_credentials' }

  const ip = await getClientIp()
  const [ipOk, emailOk] = await Promise.all([rateLimit(`login:ip:${ip}`, 30, 15 * 60), rateLimit(`login:email:${email.data}`, 8, 15 * 60)])
  if (!ipOk || !emailOk) return { error: 'rate_limited' }
  if (!(await verifyTurnstile(field(formData, 'turnstileToken'), ip))) return { error: 'captcha_failed' }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.data, password })
  if (error || !data.user) return { error: 'invalid_credentials' }

  redirect(await destinationFor(data.user.id, locale, field(formData, 'next') || null))
}

export async function logoutAction(formData: FormData): Promise<void> {
  const locale = field(formData, 'locale') === 'en' ? 'en' : 'sk'
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect(localizedPath(locale, '/prihlasenie'))
}

/**
 * "Forgotten password" and "send a new link". Always answers the same way, so the
 * form cannot be used to find out which emails have an account.
 */
export async function requestPasswordLinkAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = emailSchema.safeParse(field(formData, 'email'))
  const locale = field(formData, 'locale') === 'en' ? 'en' : 'sk'
  if (!email.success) return { error: 'email_invalid' }

  const ip = await getClientIp()
  const [ipOk, emailOk] = await Promise.all([rateLimit(`pwlink:ip:${ip}`, 10, 60 * 60), rateLimit(`pwlink:email:${email.data}`, 3, 60 * 60)])
  if (!ipOk) return { error: 'rate_limited' }
  if (!emailOk) return { ok: true } // silently drop: do not reveal anything, do not spam the mailbox

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, email, locale, password_set, anonymized_at')
    .ilike('email', email.data.replace(/[%_\\]/g, '\\$&'))
    .maybeSingle()

  if (profile?.email && !profile.anonymized_at) {
    try {
      await sendPasswordLink({
        profileId: profile.id,
        email: profile.email,
        locale: profile.locale || locale,
        purpose: profile.password_set ? 'reset_password' : 'set_password',
      })
    } catch (e) {
      console.error('password link failed', e)
    }
  }
  return { ok: true }
}

export async function setPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const token = field(formData, 'token')
  const locale = field(formData, 'locale') === 'en' ? 'en' : 'sk'
  const parsed = newPasswordSchema.safeParse({
    password: field(formData, 'password'),
    passwordConfirm: field(formData, 'passwordConfirm'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'unknown' }

  const ip = await getClientIp()
  if (!(await rateLimit(`setpw:ip:${ip}`, 20, 15 * 60))) return { error: 'rate_limited' }

  const peeked = await peekAuthToken(token)
  if (!peeked) return { error: 'token_invalid' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('id, email, anonymized_at').eq('id', peeked.profileId).maybeSingle()
  if (!profile?.email || profile.anonymized_at) return { error: 'token_invalid' }
  if (await isPwnedPassword(parsed.data.password)) return { error: 'password_pwned' }

  // Set the password first; the token is burnt only once that has worked, so a
  // rejected password (e.g. a leaked one) does not waste the link.
  const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, {
    password: parsed.data.password,
    email_confirm: true,
  })
  if (updateError) return { error: 'password_rejected' }

  const consumed = await consumeAuthToken(token)
  if (!consumed || consumed.profileId !== profile.id) return { error: 'token_invalid' }

  await admin.from('profiles').update({ password_set: true }).eq('id', profile.id)

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email: profile.email, password: parsed.data.password })
  if (error || !data.user) redirect(localizedPath(locale, '/prihlasenie'))

  redirect(await destinationFor(data.user.id, locale, field(formData, 'next') || null))
}
