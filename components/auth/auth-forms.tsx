'use client'

import { useState } from 'react'
import { Turnstile } from '@/components/booking/turnstile'
import { useFormAction } from '@/components/use-form-action'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  loginAction,
  requestPasswordLinkAction,
  setPasswordAction,
  type AuthFormState,
} from '@/lib/auth/actions'
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password'

const initial: AuthFormState = {}

function FormError({ code }: { code?: string }) {
  const t = useTranslations('auth.errors')
  if (!code) return null
  return (
    <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
      {t.has(code) ? t(code) : t('unknown')}
    </p>
  )
}

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations('auth')
  const locale = useLocale()
  const { state: state, onSubmit: action, pending: pending } = useFormAction(loginAction, initial)
  // Optional Cloudflare Turnstile; a token is single-use, so ask for a new one after a failed attempt.
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const [token, setToken] = useState<string | null>(null)
  const [reset, setReset] = useState(0)
  const [handled, setHandled] = useState(state)
  if (handled !== state) {
    setHandled(state)
    if (state.error) setReset((n) => n + 1)
  }

  return (
    <form onSubmit={action} className="space-y-5" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="space-y-2">
        <Label htmlFor="email">{t('email')}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-4">
          <Label htmlFor="password">{t('password')}</Label>
          <Link href="/zabudnute-heslo" className="text-sm text-gold underline-offset-4 hover:underline">
            {t('forgotLink')}
          </Link>
        </div>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {siteKey ? (
        <>
          <input type="hidden" name="turnstileToken" value={token ?? ''} />
          <Turnstile siteKey={siteKey} locale={locale} resetKey={reset} onToken={setToken} />
        </>
      ) : null}
      <FormError code={state.error} />
      <Button type="submit" className="w-full" disabled={pending || (!!siteKey && !token)}>
        {pending ? t('pending') : t('submitLogin')}
      </Button>
    </form>
  )
}

export function RequestLinkForm({ submitLabel }: { submitLabel: string }) {
  const t = useTranslations('auth')
  const locale = useLocale()
  const { state: state, onSubmit: action, pending: pending } = useFormAction(requestPasswordLinkAction, initial)

  if (state.ok) {
    return (
      <p role="status" className="rounded-lg border border-gold/50 bg-gold/10 px-4 py-3 text-sm leading-6 text-white">
        {t('forgotSent')}
      </p>
    )
  }

  return (
    <form onSubmit={action} className="space-y-5" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <div className="space-y-2">
        <Label htmlFor="email">{t('email')}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
      </div>
      <FormError code={state.error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t('pending') : submitLabel}
      </Button>
    </form>
  )
}

export function SetPasswordForm({ token, next }: { token: string; next?: string }) {
  const t = useTranslations('auth')
  const locale = useLocale()
  const { state: state, onSubmit: action, pending: pending } = useFormAction(setPasswordAction, initial)

  return (
    <form onSubmit={action} className="space-y-5" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="token" value={token} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="space-y-2">
        <Label htmlFor="password">{t('newPassword')}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          aria-describedby="password-hint"
          required
        />
        <p id="password-hint" className="text-xs text-muted2">
          {t('passwordHint', { min: PASSWORD_MIN_LENGTH })}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="passwordConfirm">{t('passwordConfirm')}</Label>
        <Input id="passwordConfirm" name="passwordConfirm" type="password" autoComplete="new-password" required />
      </div>
      <FormError code={state.error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t('pending') : t('submitSet')}
      </Button>
    </form>
  )
}
