'use client'

import Image from 'next/image'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { AvailabilityCalendar } from '@/components/catalog/availability-calendar'
import { checkTermAction, createBookingAction, type BookingActionResult } from '@/lib/booking/actions'
import { COUNTRY_CODES, PHONE_PREFIXES, countryName } from '@/lib/booking/countries'
import {
  PHONE_DIGITS,
  customerRuleErrors,
  customerSchema,
  confirmSchema,
  fieldErrors,
  termInstants,
  termSchema,
  validateDriverAge,
  validateTerm,
  type BookingFormState,
  type FieldErrors,
} from '@/lib/booking/schema'
import { formatEuro } from '@/lib/format'
import { calculatePrice } from '@/lib/pricing'
import { formatDate, formatDateTime, localDateInHours, utcToZonedLocal } from '@/lib/time'
import { Card, CheckField, DateInput, Field, RadioCards, SelectInput, TextInput, controlClass, describe } from './fields'
import { PriceLines, PriceSummary } from './price-summary'
import { Turnstile } from './turnstile'
import type { BookingConfig, BookingLocation, BookingVehicle } from './types'

export const BOOKING_DRAFT_KEY = 'btw-booking-draft-v1'

type Props = { vehicles: BookingVehicle[]; locations: BookingLocation[]; config: BookingConfig; initial: BookingFormState }
type Field_ = keyof BookingFormState

const STEP_OF_FIELD: Partial<Record<Field_ | 'form', number>> = {
  vin: 1,
  pickupDate: 1,
  pickupTime: 1,
  returnDate: 1,
  returnTime: 1,
  pickupLocationId: 1,
  returnLocationId: 1,
  pickupCustom: 1,
  pickupAddress: 1,
  pickupOutsideCity: 1,
  returnCustom: 1,
  returnAddress: 1,
  returnOutsideCity: 1,
  abroadTrip: 1,
  abroadCountries: 1,
  termsConsent: 3,
  gdprConsent: 3,
  marketingConsent: 3,
  form: 3,
}
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)

const primaryButton =
  'inline-flex h-12 w-full items-center justify-center rounded-lg bg-gold px-8 text-base font-semibold text-white transition-colors hover:bg-gold-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-60 sm:w-auto'
const secondaryButton =
  'inline-flex h-12 w-full items-center justify-center rounded-lg border border-gold px-6 text-base font-semibold text-white transition-colors hover:bg-gold/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-60 sm:w-auto'
/** Same place on every step: full width and stacked on phones (primary on top), a row on larger screens. */
const actions = 'flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between'
const linkButton = 'text-sm font-semibold text-gold underline-offset-4 hover:underline'

export function BookingForm({ vehicles, locations, config, initial }: Props) {
  const t = useTranslations('booking')
  const locale = useLocale()
  const [values, setValues] = useState<BookingFormState>(initial)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [step, setStep] = useState(1)
  const [hydrated, setHydrated] = useState(false)
  const [changingVehicle, setChangingVehicle] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(!initial.pickupDate)
  const [website, setWebsite] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileReset, setTurnstileReset] = useState(0)
  const [checking, startChecking] = useTransition()
  const [submitting, startSubmitting] = useTransition()
  // When the form was opened (anti-spam minimum fill time); set after mount.
  const startedAt = useRef(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const valuesRef = useRef(values)
  useLayoutEffect(() => {
    valuesRef.current = values
  })

  const euro = (cents: number) => formatEuro(cents, locale)
  const vehicle = vehicles.find((v) => v.vin === values.vin) ?? null
  const pickupOptions = locations.filter((l) => l.forPickup)
  const returnOptions = locations.filter((l) => l.forReturn)
  const pickupLocation = locations.find((l) => l.id === values.pickupLocationId) ?? null
  const returnLocation = locations.find((l) => l.id === values.returnLocationId) ?? null
  const rules = useMemo(() => ({ minLeadHours: config.minLeadHours, minRentalDays: config.minRentalDays, toleranceMinutes: config.toleranceMinutes }), [config])

  const set = <K extends Field_>(key: K, value: BookingFormState[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => (current[key] || current.form ? { ...current, [key]: undefined, form: undefined } : current))
  }

  // ── Price (the same pure function the server uses; the server result is what counts) ──
  const instants = useMemo(() => {
    const result = termInstants(values)
    return result && result.returnAt > result.pickupAt ? result : null
  }, [values.pickupDate, values.pickupTime, values.returnDate, values.returnTime]) // eslint-disable-line react-hooks/exhaustive-deps
  const price = useMemo(() => {
    if (!vehicle || !instants) return null
    return calculatePrice({
      ...instants,
      tiers: vehicle.prices,
      extras: vehicle.extras.filter((extra) => (values.extras[extra.id] ?? 0) > 0).map((extra) => ({ extra, quantity: values.extras[extra.id] })),
      pickupSurchargeCents: values.pickupCustom ? 0 : (pickupLocation?.surchargeCents ?? 0),
      returnSurchargeCents: values.returnCustom ? 0 : (returnLocation?.surchargeCents ?? 0),
      vatRate: config.vatRate,
      toleranceMinutes: config.toleranceMinutes,
      individualFromDays: config.individualFromDays,
    })
  }, [vehicle, instants, values.extras, values.pickupCustom, values.returnCustom, pickupLocation, returnLocation, config])
  const deliveryOutside = (values.pickupCustom && values.pickupOutsideCity) || (values.returnCustom && values.returnOutsideCity)
  const delivery = deliveryOutside ? ('outside' as const) : values.pickupCustom || values.returnCustom ? ('city' as const) : null

  // ── Validation per step (same schemas as the server) ──
  const validateStep = useCallback(
    (target: number, v: BookingFormState): FieldErrors => {
      if (target === 1) {
        const parsed = termSchema.safeParse(v)
        if (!parsed.success) return fieldErrors(parsed.error)
        return validateTerm(v, rules)
      }
      if (target === 2) {
        const parsed = customerSchema.safeParse(v)
        const found = { ...customerRuleErrors(v), ...(parsed.success ? {} : fieldErrors(parsed.error)) }
        const current = vehicles.find((x) => x.vin === v.vin)
        if (!found.dateOfBirth && current) Object.assign(found, validateDriverAge(v.dateOfBirth, v.pickupDate, current.minDriverAge))
        return found
      }
      const parsed = confirmSchema.safeParse(v)
      return parsed.success ? {} : fieldErrors(parsed.error)
    },
    [rules, vehicles],
  )
  const highestAllowedStep = useCallback((v: BookingFormState) => (Object.keys(validateStep(1, v)).length > 0 ? 1 : Object.keys(validateStep(2, v)).length > 0 ? 2 : 3), [validateStep])

  // ── Draft in sessionStorage + step in the URL: Back and reload never lose input ──
  useEffect(() => {
    startedAt.current = Date.now()
    let restored = initial
    try {
      const stored = JSON.parse(sessionStorage.getItem(BOOKING_DRAFT_KEY) ?? 'null') as Partial<BookingFormState> | null
      if (stored && typeof stored === 'object' && (!initial.vin || stored.vin === initial.vin)) {
        restored = { ...initial, ...stored, extras: { ...(stored.extras ?? {}) } }
        // Values that came with the link (vehicle, dates) and the signed-in email win over the draft.
        if (initial.vin) restored.vin = initial.vin
        if (initial.pickupDate) Object.assign(restored, { pickupDate: initial.pickupDate, returnDate: initial.returnDate })
        if (config.lockedEmail) restored.email = config.lockedEmail
        if (!locations.some((l) => l.id === restored.pickupLocationId)) restored.pickupLocationId = initial.pickupLocationId
        if (!locations.some((l) => l.id === restored.returnLocationId)) restored.returnLocationId = initial.returnLocationId
        // sessionStorage exists only in the browser, so the saved draft can be applied only after hydration.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setValues(restored)
      }
    } catch {
      // unreadable draft – start fresh
    }
    const fromUrl = () => Math.min(3, Math.max(1, Number(new URLSearchParams(window.location.search).get('krok')) || 1))
    setStep(Math.min(fromUrl(), highestAllowedStep(restored)))
    setHydrated(true)
    const onPop = () => setStep(Math.min(fromUrl(), highestAllowedStep(valuesRef.current)))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hydrated) return
    try {
      sessionStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify(values))
    } catch {
      // storage unavailable (private mode) – the form still works
    }
  }, [values, hydrated])

  const urlFor = (target: number, vin: string) => {
    const params = new URLSearchParams(window.location.search)
    if (vin) params.set('vozidlo', vin)
    else params.delete('vozidlo')
    params.delete('od')
    params.delete('do')
    if (target > 1) params.set('krok', String(target))
    else params.delete('krok')
    const query = params.toString()
    return query ? `${window.location.pathname}?${query}` : window.location.pathname
  }
  const goTo = (target: number) => {
    window.history.pushState(null, '', urlFor(target, values.vin))
    setStep(target)
  }
  // Every step starts at the top of the page (after the new step has rendered).
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    heading.current?.focus({ preventScroll: true })
  }, [step])
  const showErrors = (found: FieldErrors) => {
    setErrors(found)
    requestAnimationFrame(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus())
  }
  const hasErrors = (found: FieldErrors) => Object.values(found).some(Boolean)

  const continueFromTerm = () => {
    const found = validateStep(1, values)
    if (hasErrors(found)) return showErrors(found)
    startChecking(async () => {
      // A network or server failure must never leave the visitor without feedback.
      const result = await checkTermAction(values).catch(() => ({ errors: { form: 'unknown' } as FieldErrors }))
      if (hasErrors(result.errors)) showErrors(result.errors)
      else goTo(2)
    })
  }
  const continueFromCustomer = () => {
    const found = validateStep(2, values)
    if (hasErrors(found)) return showErrors(found)
    goTo(3)
  }
  const submit = () => {
    const found = validateStep(3, values)
    if (hasErrors(found)) return showErrors(found)
    startSubmitting(async () => {
      const result: BookingActionResult = await createBookingAction({ ...values, locale, website, startedAt: startedAt.current, turnstileToken }).catch(() => ({ errors: { form: 'unknown' } }))
      if (result.redirectTo) {
        window.location.assign(result.redirectTo)
        return
      }
      setTurnstileReset((n) => n + 1)
      const firstField = (Object.keys(result.errors) as (Field_ | 'form')[]).find((key) => result.errors[key])
      const target = firstField ? (STEP_OF_FIELD[firstField] ?? 2) : 3
      if (target !== step) goTo(target)
      showErrors(result.errors)
    })
  }

  const err = (field: Field_ | 'form') => {
    const code = errors[field]
    if (!code) return undefined
    const key = t.has(`errors.${code}`) ? code : 'unknown'
    return t(`errors.${key}`, { hours: config.minLeadHours, days: config.minRentalDays, age: vehicle?.minDriverAge ?? 21, digits: PHONE_DIGITS[values.phonePrefix] ?? 9 })
  }

  const minPickupDate = useMemo(() => localDateInHours(config.minLeadHours), [config.minLeadHours])
  const pickupLabel = instants ? formatDateTime(instants.pickupAt, locale) : null
  const returnLabel = instants ? formatDateTime(instants.returnAt, locale) : null
  const steps = t.raw('steps') as string[]
  const methodOptions = config.paymentMethods.map((method) => ({ value: method, label: t(`methods.${method}`) }))
  const selectedExtras = vehicle ? vehicle.extras.filter((extra) => (values.extras[extra.id] ?? 0) > 0) : []
  const pick = (name: { sk?: string; en?: string }) => (locale === 'en' ? name.en : name.sk) || name.sk || name.en || ''
  const cancellation = [...config.cancellationTiers].sort((a, b) => b.min_hours - a.min_hours)

  const text = (
    field: 'firstName' | 'lastName' | 'email' | 'phoneNumber' | 'companyName' | 'ico' | 'dic' | 'icDph' | 'street' | 'city' | 'zip' | 'abroadCountries' | 'pickupAddress' | 'returnAddress',
    label: string,
    props: React.ComponentProps<'input'> = {},
    extra: { hint?: string; optional?: boolean; className?: string } = {},
  ) => (
    <Field id={field} label={label} error={err(field)} hint={extra.hint} optional={extra.optional ? t('optional') : undefined} className={extra.className}>
      <TextInput id={field} name={field} value={values[field]} onChange={(event) => set(field, event.target.value)} {...describe(field, err(field), extra.hint)} {...props} />
    </Field>
  )

  return (
    <div className="mx-auto max-w-6xl px-4 pb-32 pt-28 sm:px-6 lg:pb-20">
      <h1 ref={heading} tabIndex={-1} className="text-3xl font-bold tracking-wide text-white focus:outline-none">
        {t('title')}
      </h1>

      {/* Stepper */}
      <ol className="mt-6 grid grid-cols-3 gap-2" aria-label={t('stepOf', { step, total: 3 })}>
        {steps.map((label, index) => {
          const number = index + 1
          const reachable = number < step
          const inner = (
            <>
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${number <= step ? 'border-gold bg-gold text-white' : 'border-line text-muted2'}`}
              >
                {number}
              </span>
              <span className={`hidden text-sm font-semibold sm:block ${number === step ? 'text-white' : 'text-muted2'}`}>{label}</span>
            </>
          )
          return (
            <li key={label} aria-current={number === step ? 'step' : undefined} className={`border-t-2 pt-3 ${number <= step ? 'border-gold' : 'border-line'}`}>
              {reachable ? (
                <button type="button" onClick={() => goTo(number)} className="flex min-h-11 items-center gap-3 text-left" aria-label={`${label} – ${t('edit')}`}>
                  {inner}
                </button>
              ) : (
                <div className="flex min-h-11 items-center gap-3">{inner}</div>
              )}
            </li>
          )
        })}
      </ol>
      <p className="mt-3 text-sm font-semibold text-white sm:hidden">{steps[step - 1]}</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form
          noValidate
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault()
            if (step === 1) continueFromTerm()
            else if (step === 2) continueFromCustomer()
            else submit()
          }}
        >
          {errors.form ? (
            <p role="alert" className="rounded-lg border border-red-400/60 bg-red-500/10 px-4 py-3 text-[15px] text-red-100">
              {err('form')}
            </p>
          ) : hasErrors(errors) ? (
            <p role="alert" className="rounded-lg border border-red-400/60 bg-red-500/10 px-4 py-3 text-[15px] text-red-100">
              {t('errorSummary')}
            </p>
          ) : null}

          {/* ───────────── Step 1 ───────────── */}
          {step === 1 ? (
            <>
              <Card
                title={t('vehicle')}
                action={
                  vehicle && !changingVehicle && vehicles.length > 1 ? (
                    <button type="button" className={linkButton} onClick={() => setChangingVehicle(true)}>
                      {t('changeVehicle')}
                    </button>
                  ) : null
                }
              >
                {vehicle && !changingVehicle ? (
                  <div className="flex items-center gap-4">
                    {vehicle.imageUrl ? (
                      <div className="relative h-20 w-32 shrink-0">
                        <Image src={vehicle.imageUrl} alt="" fill sizes="128px" className="object-contain" />
                      </div>
                    ) : null}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-gold">{vehicle.categoryName}</p>
                      <p className="text-lg font-bold text-white">{vehicle.name}</p>
                      {vehicle.priceFromCents !== null ? <p className="text-sm text-muted2">{t('summaryFrom', { price: euro(vehicle.priceFromCents) })}</p> : null}
                    </div>
                  </div>
                ) : (
                  <Field id="vin" label={t('chooseVehicle')} error={err('vin')}>
                    <SelectInput
                      id="vin"
                      value={values.vin}
                      {...describe('vin', err('vin'))}
                      onChange={(event) => {
                        const vin = event.target.value
                        setValues((current) => ({ ...current, vin, extras: {} }))
                        setErrors({})
                        setChangingVehicle(false)
                        window.history.replaceState(null, '', urlFor(1, vin))
                      }}
                    >
                      <option value="">{t('chooseVehicle')}</option>
                      {vehicles.map((v) => (
                        <option key={v.vin} value={v.vin}>
                          {v.priceFromCents !== null ? t('vehicleFrom', { name: v.name, price: euro(v.priceFromCents) }) : v.name}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                )}
              </Card>

              <Card title={t('term')}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="pickupDate" label={t('pickupDate')} error={err('pickupDate')}>
                    <DateInput
                      id="pickupDate"
                      min={minPickupDate}
                      value={values.pickupDate}
                      {...describe('pickupDate', err('pickupDate'))}
                      onChange={(event) => {
                        const pickupDate = event.target.value
                        set('pickupDate', pickupDate)
                        if (pickupDate && (!values.returnDate || values.returnDate < pickupDate)) setValues((current) => ({ ...current, returnDate: '' }))
                      }}
                    />
                  </Field>
                  <Field id="pickupTime" label={t('pickupTime')} error={err('pickupTime')}>
                    <SelectInput id="pickupTime" value={values.pickupTime} onChange={(event) => set('pickupTime', event.target.value)}>
                      {TIMES.map((time) => (
                        <option key={time}>{time}</option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field id="returnDate" label={t('returnDate')} error={err('returnDate')}>
                    <DateInput
                      id="returnDate"
                      min={values.pickupDate || minPickupDate}
                      value={values.returnDate}
                      {...describe('returnDate', err('returnDate'))}
                      onChange={(event) => set('returnDate', event.target.value)}
                    />
                  </Field>
                  <Field id="returnTime" label={t('returnTime')} error={err('returnTime')}>
                    <SelectInput id="returnTime" value={values.returnTime} onChange={(event) => set('returnTime', event.target.value)}>
                      {TIMES.map((time) => (
                        <option key={time}>{time}</option>
                      ))}
                    </SelectInput>
                  </Field>
                </div>
                {price ? (
                  <p className="mt-4 text-[15px] text-white" aria-live="polite">
                    {t('lengthLabel')}: <strong>{t('days', { count: price.days })}</strong>
                  </p>
                ) : null}
                {price?.isIndividual ? (
                  <div className="mt-4 rounded-lg border border-gold bg-gold/10 px-4 py-3">
                    <p className="font-semibold text-white">{t('individualTitle')}</p>
                    <p className="mt-1 text-[15px] leading-6 text-white">{t('individualText', { days: config.individualFromDays })}</p>
                  </div>
                ) : null}
                {vehicle ? (
                  <details className="mt-4 border-t border-line pt-3" open={calendarOpen} onToggle={(event) => setCalendarOpen(event.currentTarget.open)}>
                    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-gold">{t('showCalendar')}</summary>
                    <div className="pt-3">
                      <AvailabilityCalendar
                        vin={vehicle.vin}
                        minDate={minPickupDate}
                        value={values.pickupDate && values.returnDate && values.returnDate > values.pickupDate ? { from: values.pickupDate, to: values.returnDate } : null}
                        onChange={(range) => {
                          if (!range) return
                          setValues((current) => ({ ...current, pickupDate: range.from, returnDate: range.to }))
                          setErrors({})
                        }}
                      />
                    </div>
                  </details>
                ) : null}
              </Card>

              <Card title={t('place')}>
                <div className="grid gap-6 sm:grid-cols-2">
                  {(
                    [
                      {
                        field: 'pickupLocationId',
                        custom: 'pickupCustom',
                        address: 'pickupAddress',
                        outside: 'pickupOutsideCity',
                        options: pickupOptions,
                        location: pickupLocation,
                        label: t('pickupLocation'),
                        toggle: t('pickupCustom'),
                      },
                      {
                        field: 'returnLocationId',
                        custom: 'returnCustom',
                        address: 'returnAddress',
                        outside: 'returnOutsideCity',
                        options: returnOptions,
                        location: returnLocation,
                        label: t('returnLocation'),
                        toggle: t('returnCustom'),
                      },
                    ] as const
                  ).map((place) => (
                    <div key={place.field} className="min-w-0">
                      {values[place.custom] ? (
                        text(place.address, place.label, { autoComplete: 'street-address', placeholder: t('addressPlaceholder'), maxLength: 200 })
                      ) : place.options.length > 1 ? (
                        <Field id={place.field} label={place.label} error={err(place.field)}>
                          <SelectInput id={place.field} value={values[place.field]} onChange={(event) => set(place.field, event.target.value)} {...describe(place.field, err(place.field))}>
                            {place.options.map((location) => (
                              <option key={location.id} value={location.id}>
                                {location.surchargeCents > 0 ? t('locationSurcharge', { name: location.name, price: euro(location.surchargeCents) }) : location.name}
                              </option>
                            ))}
                          </SelectInput>
                        </Field>
                      ) : (
                        <div>
                          <p className="mb-1.5 text-sm font-medium text-white">{place.label}</p>
                          <p className="text-[15px] leading-6 text-white">
                            {place.location?.name}
                            <br />
                            <span className="text-muted2">{place.location?.address}</span>
                          </p>
                        </div>
                      )}
                      <CheckField id={place.custom} checked={values[place.custom]} onChange={(checked) => set(place.custom, checked)}>
                        {place.toggle}
                      </CheckField>
                      {values[place.custom] ? (
                        <div className="mt-1 grid gap-2">
                          {([false, true] as const).map((outside) => (
                            <label
                              key={String(outside)}
                              className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-[15px] text-white transition-colors focus-within:ring-2 focus-within:ring-gold/40 ${values[place.outside] === outside ? 'border-gold bg-gold/10' : 'border-line hover:border-gold/60'}`}
                            >
                              <input
                                type="radio"
                                name={place.outside}
                                checked={values[place.outside] === outside}
                                onChange={() => set(place.outside, outside)}
                                className="h-4 w-4 shrink-0 accent-gold"
                              />
                              {t(outside ? 'addressOutside' : 'addressInCity')}
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
                {deliveryOutside ? <p className="mt-4 rounded-lg border border-gold/60 bg-gold/10 px-4 py-3 text-sm leading-6 text-white">{t('deliveryNote')}</p> : null}
                <div className="mt-4 border-t border-line pt-3">
                  <CheckField id="abroadTrip" checked={values.abroadTrip} onChange={(checked) => set('abroadTrip', checked)}>
                    {t('abroad')}
                  </CheckField>
                  <p className="pl-8 text-sm text-muted2">{t('abroadHint')}</p>
                  {values.abroadTrip ? (
                    <div className="mt-3 pl-8">{text('abroadCountries', t('abroadCountries'), { placeholder: t('abroadPlaceholder'), maxLength: 300 }, { optional: true })}</div>
                  ) : null}
                </div>
              </Card>

              <div className={`${actions} sm:justify-end`}>
                <button type="submit" className={primaryButton} disabled={checking}>
                  {checking ? t('checking') : t('continue')}
                </button>
              </div>
            </>
          ) : null}

          {/* ───────────── Step 2 ───────────── */}
          {step === 2 && vehicle ? (
            <>
              <Card title={t('contact')}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {text('firstName', t('firstName'), { autoComplete: 'given-name', maxLength: 80 })}
                  {text('lastName', t('lastName'), { autoComplete: 'family-name', maxLength: 80 })}
                  {text(
                    'email',
                    t('email'),
                    { type: 'email', inputMode: 'email', autoComplete: 'email', readOnly: !!config.lockedEmail, spellCheck: false },
                    { hint: config.lockedEmail ? t('emailLocked') : t('emailHint'), className: 'sm:col-span-2' },
                  )}
                  <div className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] gap-3 sm:col-span-2">
                    <Field id="phonePrefix" label={t('phonePrefix')} error={err('phonePrefix')}>
                      <SelectInput id="phonePrefix" value={values.phonePrefix} autoComplete="tel-country-code" onChange={(event) => set('phonePrefix', event.target.value)}>
                        {PHONE_PREFIXES.map((prefix) => (
                          <option key={prefix.country} value={prefix.dial}>
                            {prefix.country} {prefix.dial}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                    {text('phoneNumber', t('phone'), { type: 'tel', inputMode: 'tel', autoComplete: 'tel-national', placeholder: '900 123 456', maxLength: 20 })}
                  </div>
                </div>
              </Card>

              <Card title={t('driver')}>
                <Field id="dateOfBirth" label={t('dateOfBirth')} error={err('dateOfBirth')} hint={t('dateOfBirthHint', { age: vehicle.minDriverAge })} className="sm:max-w-xs">
                  <DateInput
                    id="dateOfBirth"
                    autoComplete="bday"
                    max={utcToZonedLocal(new Date()).slice(0, 10)}
                    value={values.dateOfBirth}
                    onChange={(event) => set('dateOfBirth', event.target.value)}
                    {...describe('dateOfBirth', err('dateOfBirth'), 'hint')}
                  />
                </Field>
                <div className="mt-3">
                  <CheckField id="licenseConfirmed" checked={values.licenseConfirmed} onChange={(checked) => set('licenseConfirmed', checked)} error={err('licenseConfirmed')}>
                    {t('licenseConfirm', { months: vehicle.minLicenseMonths })}
                  </CheckField>
                </div>
              </Card>

              <Card title={t('billing')}>
                <RadioCards
                  name="customerType"
                  legend={t('customerType')}
                  value={values.isCompany ? 'company' : 'private'}
                  options={[
                    { value: 'private', label: t('private') },
                    { value: 'company', label: t('company') },
                  ]}
                  onChange={(value) => set('isCompany', value === 'company')}
                />
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {values.isCompany ? (
                    <>
                      {text('companyName', t('companyName'), { autoComplete: 'organization', maxLength: 160 }, { className: 'sm:col-span-2' })}
                      {text('ico', t('ico'), { inputMode: 'numeric', maxLength: 14 })}
                      {text('dic', t('dic'), { maxLength: 20 }, { optional: true })}
                      {text('icDph', t('icDph'), { maxLength: 20 }, { optional: true })}
                    </>
                  ) : null}
                  {text('street', t('street'), { autoComplete: 'address-line1', maxLength: 160 }, { className: 'sm:col-span-2' })}
                  {text('city', t('city'), { autoComplete: 'address-level2', maxLength: 100 })}
                  {text('zip', t('zip'), { autoComplete: 'postal-code', maxLength: 12 })}
                  <Field id="country" label={t('country')} error={err('country')} className="sm:col-span-2">
                    <SelectInput id="country" value={values.country} autoComplete="country" onChange={(event) => set('country', event.target.value)}>
                      {COUNTRY_CODES.map((code) => (
                        <option key={code} value={code}>
                          {countryName(code, locale)}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                </div>
              </Card>

              <Card title={t('extras')}>
                {vehicle.extras.length === 0 ? (
                  <p className="text-[15px] text-muted2">{t('extrasEmpty')}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {vehicle.extras.map((extra) => {
                      const quantity = values.extras[extra.id] ?? 0
                      const name = pick(extra.name)
                      const setQuantity = (next: number) => set('extras', { ...values.extras, [extra.id]: Math.max(0, Math.min(extra.maxQuantity, next)) })
                      const priceLabel =
                        extra.pricingType === 'per_rental'
                          ? t('perRental', { price: euro(extra.priceCents) })
                          : extra.maxQuantity > 1
                            ? t('perDayEach', { price: euro(extra.priceCents) })
                            : t('perDay', { price: euro(extra.priceCents) })
                      return (
                        <li key={extra.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                          {extra.maxQuantity > 1 ? (
                            <>
                              <div>
                                <p className="text-[15px] font-medium text-white">{name}</p>
                                <p className="text-sm text-muted2">{priceLabel}</p>
                              </div>
                              <div className="flex items-center gap-1" role="group" aria-label={t('quantity', { name })}>
                                <button
                                  type="button"
                                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-line text-xl text-white hover:border-gold disabled:opacity-40"
                                  onClick={() => setQuantity(quantity - 1)}
                                  disabled={quantity === 0}
                                  aria-label={t('decrease')}
                                >
                                  −
                                </button>
                                <span className="w-8 text-center text-base font-semibold text-white" aria-live="polite">
                                  {quantity}
                                </span>
                                <button
                                  type="button"
                                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-line text-xl text-white hover:border-gold disabled:opacity-40"
                                  onClick={() => setQuantity(quantity + 1)}
                                  disabled={quantity >= extra.maxQuantity}
                                  aria-label={t('increase')}
                                >
                                  +
                                </button>
                              </div>
                            </>
                          ) : (
                            <label htmlFor={`extra-${extra.id}`} className="flex min-h-11 flex-1 cursor-pointer items-center justify-between gap-4">
                              <span>
                                <span className="block text-[15px] font-medium text-white">{name}</span>
                                <span className="block text-sm text-muted2">{priceLabel}</span>
                              </span>
                              <input
                                id={`extra-${extra.id}`}
                                type="checkbox"
                                checked={quantity > 0}
                                onChange={(event) => setQuantity(event.target.checked ? 1 : 0)}
                                className="h-5 w-5 cursor-pointer accent-gold"
                              />
                            </label>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Card>

              <Card title={t('payment')}>
                <p className="mb-4 text-[15px] leading-6 text-muted2">{t('paymentLead')}</p>
                <div className="space-y-4">
                  <RadioCards
                    name="rentalPaymentMethod"
                    legend={t('rentalPayment')}
                    value={values.rentalPaymentMethod}
                    options={methodOptions}
                    onChange={(value) => set('rentalPaymentMethod', value)}
                    error={err('rentalPaymentMethod')}
                  />
                  <RadioCards
                    name="depositPaymentMethod"
                    legend={t('depositPayment')}
                    value={values.depositPaymentMethod}
                    options={methodOptions}
                    onChange={(value) => set('depositPaymentMethod', value)}
                    error={err('depositPaymentMethod')}
                  />
                </div>
              </Card>

              <Card title={t('conditions')}>
                <CheckField id="depositConsent" checked={values.depositConsent} onChange={(checked) => set('depositConsent', checked)} error={err('depositConsent')}>
                  {t('depositConsent', { amount: euro(vehicle.depositCents) })}
                </CheckField>
                <CheckField id="kmLimitConsent" checked={values.kmLimitConsent} onChange={(checked) => set('kmLimitConsent', checked)} error={err('kmLimitConsent')}>
                  {t('kmLimitConsent', { km: vehicle.kmLimitPerDay, price: euro(vehicle.extraKmCents) })}
                </CheckField>
              </Card>

              <Card title={t('note')}>
                <label htmlFor="note" className="sr-only">
                  {t('note')}
                </label>
                <textarea
                  id="note"
                  value={values.note}
                  maxLength={2000}
                  rows={3}
                  placeholder={t('notePlaceholder')}
                  onChange={(event) => set('note', event.target.value)}
                  className={`${controlClass} h-auto py-2.5`}
                />
              </Card>

              <div className={actions}>
                <button type="button" className={secondaryButton} onClick={() => goTo(1)}>
                  {t('back')}
                </button>
                <button type="submit" className={primaryButton}>
                  {t('continue')}
                </button>
              </div>
            </>
          ) : null}

          {/* ───────────── Step 3 ───────────── */}
          {step === 3 && vehicle && price ? (
            <>
              <p className="text-[15px] text-muted2">{t('review')}</p>

              <Card
                title={t('reviewTerm')}
                action={
                  <button type="button" className={linkButton} onClick={() => goTo(1)}>
                    {t('edit')}
                  </button>
                }
              >
                <dl className="space-y-2 text-[15px]">
                  <ReviewRow label={t('vehicle')} value={vehicle.name} />
                  <ReviewRow
                    label={t('reviewPickup')}
                    value={
                      <>
                        {pickupLabel}
                        <br />
                        <span className="text-muted2">{values.pickupCustom ? values.pickupAddress : `${pickupLocation?.name}, ${pickupLocation?.address}`}</span>
                      </>
                    }
                  />
                  <ReviewRow
                    label={t('reviewReturn')}
                    value={
                      <>
                        {returnLabel}
                        <br />
                        <span className="text-muted2">{values.returnCustom ? values.returnAddress : `${returnLocation?.name}, ${returnLocation?.address}`}</span>
                      </>
                    }
                  />
                  <ReviewRow label={t('lengthLabel')} value={t('days', { count: price.days })} />
                  {values.abroadTrip ? <ReviewRow label={t('reviewAbroad')} value={values.abroadCountries || '✓'} /> : null}
                </dl>
              </Card>

              <Card
                title={t('reviewCustomer')}
                action={
                  <button type="button" className={linkButton} onClick={() => goTo(2)}>
                    {t('edit')}
                  </button>
                }
              >
                <div className="space-y-1 text-[15px] leading-6 text-white">
                  <p className="font-semibold">
                    {values.firstName} {values.lastName}
                    <span className="font-normal text-muted2"> · {t('reviewBorn', { date: formatDate(`${values.dateOfBirth}T12:00:00Z`, locale) })}</span>
                  </p>
                  <p>
                    {values.email} · {values.phonePrefix} {values.phoneNumber}
                  </p>
                  {values.isCompany ? (
                    <p>
                      {values.companyName} · {t('ico')} {values.ico}
                      {values.dic ? ` · ${t('dic')} ${values.dic}` : ''}
                      {values.icDph ? ` · ${t('icDph')} ${values.icDph}` : ''}
                    </p>
                  ) : null}
                  <p className="text-muted2">
                    {values.street}, {values.zip} {values.city}, {countryName(values.country, locale)}
                  </p>
                  {values.note ? <p className="whitespace-pre-line border-t border-line pt-2 text-muted2">{values.note}</p> : null}
                </div>
                <p className="mt-3 border-t border-line pt-3 text-[15px] text-white">
                  <span className="text-muted2">{t('reviewExtras')}:</span>{' '}
                  {selectedExtras.length > 0
                    ? selectedExtras.map((extra) => `${pick(extra.name)}${values.extras[extra.id] > 1 ? ` (${t('pieces', { count: values.extras[extra.id] })})` : ''}`).join(', ')
                    : t('reviewNoExtras')}
                </p>
              </Card>

              <Card title={t('reviewPrice')}>
                <PriceLines vehicle={vehicle} price={price} pickupLocation={pickupLocation} returnLocation={returnLocation} delivery={delivery} />
                {deliveryOutside ? <p className="mt-3 text-sm leading-6 text-muted2">{t('deliveryNote')}</p> : null}
                <dl className="mt-4 space-y-2 border-t border-line pt-4 text-[15px]">
                  <ReviewRow label={`${t('reviewPayment')} – ${t('rentalPayment').toLowerCase()}`} value={t(`methods.${values.rentalPaymentMethod}`)} />
                  <ReviewRow label={`${t('reviewPayment')} – ${t('depositPayment').toLowerCase()}`} value={t(`methods.${values.depositPaymentMethod}`)} />
                </dl>
                {values.rentalPaymentMethod === 'transfer' || values.depositPaymentMethod === 'transfer' ? <p className="mt-3 text-sm leading-6 text-muted2">{t('transferInfo')}</p> : null}
              </Card>

              <Card title={t('cancellation')}>
                <p className="mb-2 text-sm text-muted2">{t('cancellationLead')}</p>
                <dl className="space-y-1 text-[15px]">
                  {cancellation.map((tier, index) => {
                    const upper = cancellation[index - 1]?.min_hours
                    const label =
                      index === 0
                        ? t('cancelMoreThan', { hours: tier.min_hours })
                        : tier.min_hours > 0
                          ? t('cancelBetween', { from: upper, to: tier.min_hours })
                          : t('cancelLessThan', { hours: upper ?? 0 })
                    return <ReviewRow key={tier.min_hours} label={label} value={tier.fee_percent === 0 ? t('cancelFree') : `${tier.fee_percent} %`} />
                  })}
                </dl>
              </Card>

              <Card title={t('consents')}>
                <CheckField id="termsConsent" checked={values.termsConsent} onChange={(checked) => set('termsConsent', checked)} error={err('termsConsent')}>
                  {t.rich('termsConsent', {
                    link: (chunks) => (
                      <a href={config.termsUrl} target="_blank" rel="noopener" className="text-gold underline underline-offset-4">
                        {chunks}
                      </a>
                    ),
                  })}
                </CheckField>
                <CheckField id="gdprConsent" checked={values.gdprConsent} onChange={(checked) => set('gdprConsent', checked)} error={err('gdprConsent')}>
                  {t.rich('gdprConsent', {
                    link: (chunks) => (
                      <a href={config.gdprUrl} target="_blank" rel="noopener" className="text-gold underline underline-offset-4">
                        {chunks}
                      </a>
                    ),
                  })}
                </CheckField>
                <CheckField id="marketingConsent" checked={values.marketingConsent} onChange={(checked) => set('marketingConsent', checked)}>
                  {t('marketingConsent')} <span className="text-muted2">({t('optional')})</span>
                </CheckField>

                {/* Honeypot: hidden from people and assistive technology, tempting for bots. */}
                <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                  <label htmlFor="website">{t('honeypot')}</label>
                  <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
                </div>

                {config.turnstileSiteKey ? (
                  <div className="mt-4">
                    <Turnstile siteKey={config.turnstileSiteKey} locale={locale} resetKey={turnstileReset} onToken={setTurnstileToken} />
                  </div>
                ) : null}
              </Card>

              <div className={actions}>
                <button type="button" className={secondaryButton} onClick={() => goTo(2)} disabled={submitting}>
                  {t('back')}
                </button>
                <button type="submit" className={primaryButton} disabled={submitting || (!!config.turnstileSiteKey && !turnstileToken)}>
                  {submitting ? t('submitting') : price.isIndividual ? t('submitIndividual') : t('submit')}
                </button>
              </div>
              <p className="text-center text-sm text-muted2 sm:text-right">{t('submitHint')}</p>
            </>
          ) : null}
        </form>

        <PriceSummary vehicle={vehicle} price={price} pickupLabel={pickupLabel} returnLabel={returnLabel} pickupLocation={pickupLocation} returnLocation={returnLocation} delivery={delivery} />
      </div>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-6">
      <dt className="text-muted2">{label}</dt>
      <dd className="text-right text-white">{value}</dd>
    </div>
  )
}
