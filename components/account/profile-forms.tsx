'use client'

import { useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Card, CheckField, Field, SelectInput, TextInput, describe } from '@/components/booking/fields'
import { useFormAction } from '@/components/use-form-action'
import { changeMyPasswordAction, requestAccountDeletionAction, updateProfileAction, type AccountState, type ProfileResult, type ProfileValues } from '@/lib/account/actions'
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password'
import { COUNTRY_CODES, PHONE_PREFIXES, countryName } from '@/lib/booking/countries'

const primary = 'inline-flex h-12 w-full items-center justify-center rounded-lg bg-gold px-8 text-base font-semibold text-white transition-colors hover:bg-gold-hover disabled:opacity-60 sm:w-auto'
const initial: AccountState = {}

function Notice({ state, okText }: { state: AccountState; okText: string }) {
  const t = useTranslations('account')
  if (state.error) {
    return (
      <p role="alert" className="rounded-lg border border-red-400/60 bg-red-500/10 px-4 py-3 text-sm text-red-100">
        {t.has(`errors.${state.error}`) ? t(`errors.${state.error}`) : t('errors.unknown')}
      </p>
    )
  }
  return state.ok ? (
    <p role="status" className="rounded-lg border border-gold/60 bg-gold/10 px-4 py-3 text-sm text-white">
      {okText}
    </p>
  ) : null
}

export function ProfileForm({ email, initial: start }: { email: string; initial: ProfileValues }) {
  const t = useTranslations('account.profile')
  const a = useTranslations('account')
  const b = useTranslations('booking')
  const locale = useLocale()
  const [values, setValues] = useState(start)
  const [result, setResult] = useState<ProfileResult>({ errors: {} })
  const [pending, startTransition] = useTransition()

  const set = <K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
    setResult((current) => ({ errors: { ...current.errors, [key]: undefined, form: undefined } }))
  }
  const err = (key: keyof ProfileValues | 'form') => {
    const code = result.errors[key]
    if (!code) return undefined
    return a.has(`errors.${code}`) ? a(`errors.${code}`) : b(`errors.${b.has(`errors.${code}`) ? code : 'unknown'}`, { hours: 0, days: 1, age: 21, digits: 9 })
  }
  const text = (
    key: 'firstName' | 'lastName' | 'phoneNumber' | 'companyName' | 'ico' | 'dic' | 'icDph' | 'street' | 'city' | 'zip' | 'refundIban',
    label: string,
    props: React.ComponentProps<'input'> = {},
    className?: string,
  ) => (
    <Field id={key} label={label} error={err(key)} className={className}>
      <TextInput id={key} value={values[key]} onChange={(event) => set(key, event.target.value)} {...describe(key, err(key))} {...props} />
    </Field>
  )

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault()
        startTransition(async () => setResult(await updateProfileAction(values).catch(() => ({ errors: { form: 'unknown' } }))))
      }}
    >
      <Card title={t('contact')}>
        <div className="grid gap-4 sm:grid-cols-2">
          {text('firstName', b('firstName'), { autoComplete: 'given-name', maxLength: 80 })}
          {text('lastName', b('lastName'), { autoComplete: 'family-name', maxLength: 80 })}
          <Field id="email" label={b('email')} hint={t('emailNote')} className="sm:col-span-2">
            <TextInput id="email" value={email} readOnly aria-describedby="email-hint" />
          </Field>
          <div className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] gap-3 sm:col-span-2">
            <Field id="phonePrefix" label={b('phonePrefix')}>
              <SelectInput id="phonePrefix" value={values.phonePrefix} onChange={(event) => set('phonePrefix', event.target.value)}>
                {PHONE_PREFIXES.map((prefix) => (
                  <option key={prefix.country} value={prefix.dial}>
                    {prefix.country} {prefix.dial}
                  </option>
                ))}
              </SelectInput>
            </Field>
            {text('phoneNumber', b('phone'), { type: 'tel', inputMode: 'tel', autoComplete: 'tel-national', maxLength: 20 })}
          </div>
        </div>
      </Card>

      <Card title={t('billing')}>
        <CheckField id="isCompany" checked={values.isCompany} onChange={(checked) => set('isCompany', checked)}>
          {b('company')}
        </CheckField>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {values.isCompany ? (
            <>
              {text('companyName', b('companyName'), { maxLength: 160 }, 'sm:col-span-2')}
              {text('ico', b('ico'), { maxLength: 14 })}
              {text('dic', b('dic'), { maxLength: 20 })}
              {text('icDph', b('icDph'), { maxLength: 20 })}
            </>
          ) : null}
          {text('street', b('street'), { autoComplete: 'address-line1', maxLength: 160 }, 'sm:col-span-2')}
          {text('city', b('city'), { autoComplete: 'address-level2', maxLength: 100 })}
          {text('zip', b('zip'), { autoComplete: 'postal-code', maxLength: 12 })}
          <Field id="country" label={b('country')} className="sm:col-span-2">
            <SelectInput id="country" value={values.country} onChange={(event) => set('country', event.target.value as ProfileValues['country'])}>
              {COUNTRY_CODES.map((code) => (
                <option key={code} value={code}>
                  {countryName(code, locale)}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
      </Card>

      <Card title={t('refundTitle')}>
        <p className="mb-3 text-sm text-muted2">{t('refundHint')}</p>
        {text('refundIban', t('refundIban'), { autoComplete: 'off', spellCheck: false, maxLength: 42, placeholder: 'SK00 0000 0000 0000 0000 0000' })}
      </Card>

      <Notice state={{ error: result.errors.form, ok: result.ok }} okText={t('saved')} />
      <button type="submit" disabled={pending} className={primary}>
        {pending ? t('saving') : t('save')}
      </button>
    </form>
  )
}

export function PasswordForm() {
  const t = useTranslations('account.profile')
  const auth = useTranslations('auth')
  const { state, pending, onSubmit } = useFormAction(changeMyPasswordAction, initial)
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field id="currentPassword" label={t('currentPassword')} className="sm:max-w-sm">
        <TextInput id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field id="password" label={auth('newPassword')} hint={auth('passwordHint', { min: PASSWORD_MIN_LENGTH })} className="sm:max-w-sm">
        <TextInput id="password" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} aria-describedby="password-hint" required />
      </Field>
      <Field id="passwordConfirm" label={auth('passwordConfirm')} className="sm:max-w-sm">
        <TextInput id="passwordConfirm" name="passwordConfirm" type="password" autoComplete="new-password" required />
      </Field>
      <Notice state={state} okText={t('passwordSaved')} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-gold px-6 text-base font-semibold text-white transition-colors hover:bg-gold/15 disabled:opacity-60 sm:w-auto"
      >
        {t('passwordSubmit')}
      </button>
    </form>
  )
}

export function DeleteAccountForm() {
  const t = useTranslations('account.profile')
  const { state, pending, onSubmit } = useFormAction(requestAccountDeletionAction, initial)
  if (state.ok) return null // the page re-renders with the "request received" notice
  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <label htmlFor="delete-confirm" className="flex min-h-11 cursor-pointer items-start gap-3 text-[15px] leading-6 text-white">
        <input id="delete-confirm" name="confirm" type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-gold" />
        <span>{t('deleteConfirm')}</span>
      </label>
      <Notice state={state} okText="" />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center justify-center rounded-lg border border-red-400/60 px-5 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/10 disabled:opacity-60"
      >
        {t('deleteSubmit')}
      </button>
    </form>
  )
}
