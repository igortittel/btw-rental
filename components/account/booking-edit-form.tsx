'use client'

import { useMemo, useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Card, CheckField, DateInput, Field, SelectInput, TextInput, controlClass, describe } from '@/components/booking/fields'
import type { BookingLocation, BookingVehicle } from '@/components/booking/types'
import { updateMyBookingAction, type BookingEditResult, type BookingEditValues } from '@/lib/account/actions'
import { fieldErrors, termInstants, termSchema, validateTerm, type FieldErrors } from '@/lib/booking/schema'
import { formatEuro } from '@/lib/format'
import { calculatePrice } from '@/lib/pricing'
import { localDateInHours } from '@/lib/time'

type Props = {
  bookingId: string
  confirmed: boolean
  vehicle: BookingVehicle
  locations: BookingLocation[]
  config: { vatRate: number; minLeadHours: number; minRentalDays: number; toleranceMinutes: number; individualFromDays: number }
  initial: BookingEditValues
  currentTotalCents: number | null
}

const BASE_TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)

/** The customer changes the term, places, extras and note of their booking; the price preview uses the same function as the server. */
export function BookingEditForm({ bookingId, confirmed, vehicle, locations, config, initial, currentTotalCents }: Props) {
  const t = useTranslations('account')
  const b = useTranslations('booking')
  const locale = useLocale()
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [pending, startTransition] = useTransition()
  const euro = (cents: number) => formatEuro(cents, locale)
  const times = useMemo(() => [...new Set([...BASE_TIMES, initial.pickupTime, initial.returnTime])].sort(), [initial.pickupTime, initial.returnTime])
  const pick = (name: { sk?: string; en?: string }) => (locale === 'en' ? name.en : name.sk) || name.sk || name.en || ''

  type Key = keyof BookingEditValues
  const set = <K extends Key>(key: K, value: BookingEditValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined, form: undefined }))
  }
  const err = (key: Key | 'form') => {
    const code = errors[key as keyof FieldErrors]
    if (!code) return undefined
    if (t.has(`errors.${code}`)) return t(`errors.${code}`)
    return b(`errors.${b.has(`errors.${code}`) ? code : 'unknown'}`, { hours: config.minLeadHours, days: config.minRentalDays, age: 21, digits: 9 })
  }

  const pickupLocation = locations.find((l) => l.id === values.pickupLocationId) ?? null
  const returnLocation = locations.find((l) => l.id === values.returnLocationId) ?? null
  const price = useMemo(() => {
    const instants = termInstants(values)
    if (!instants || instants.returnAt <= instants.pickupAt) return null
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
  }, [values, vehicle, pickupLocation, returnLocation, config])
  const minPickupDate = useMemo(() => localDateInHours(config.minLeadHours), [config.minLeadHours])

  const submit = () => {
    const parsed = termSchema.safeParse(values)
    const found: FieldErrors = parsed.success
      ? validateTerm(values, { minLeadHours: config.minLeadHours, minRentalDays: config.minRentalDays, toleranceMinutes: config.toleranceMinutes })
      : fieldErrors(parsed.error)
    if (Object.values(found).some(Boolean)) {
      setErrors(found)
      requestAnimationFrame(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus())
      return
    }
    startTransition(async () => {
      const result: BookingEditResult = await updateMyBookingAction(bookingId, values, locale).catch(() => ({ errors: { form: 'unknown' } }))
      if (result.redirectTo) {
        window.location.assign(result.redirectTo)
        return
      }
      setErrors(result.errors)
      window.scrollTo({ top: 0, behavior: 'instant' })
    })
  }

  return (
    <form
      method="post"
      noValidate
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      {confirmed ? <p className="rounded-lg border border-gold/60 bg-gold/10 px-4 py-3 text-[15px] text-white">{t('editConfirmedNote')}</p> : null}
      {Object.values(errors).some(Boolean) ? (
        <p role="alert" className="rounded-lg border border-red-400/60 bg-red-500/10 px-4 py-3 text-[15px] text-red-100">
          {err('form') ?? b('errorSummary')}
        </p>
      ) : null}

      <Card title={b('term')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="pickupDate" label={b('pickupDate')} error={err('pickupDate')}>
            <DateInput id="pickupDate" min={minPickupDate} value={values.pickupDate} onChange={(event) => set('pickupDate', event.target.value)} {...describe('pickupDate', err('pickupDate'))} />
          </Field>
          <Field id="pickupTime" label={b('pickupTime')}>
            <SelectInput id="pickupTime" value={values.pickupTime} onChange={(event) => set('pickupTime', event.target.value)}>
              {times.map((time) => (
                <option key={time}>{time}</option>
              ))}
            </SelectInput>
          </Field>
          <Field id="returnDate" label={b('returnDate')} error={err('returnDate')}>
            <DateInput
              id="returnDate"
              min={values.pickupDate || minPickupDate}
              value={values.returnDate}
              onChange={(event) => set('returnDate', event.target.value)}
              {...describe('returnDate', err('returnDate'))}
            />
          </Field>
          <Field id="returnTime" label={b('returnTime')}>
            <SelectInput id="returnTime" value={values.returnTime} onChange={(event) => set('returnTime', event.target.value)}>
              {times.map((time) => (
                <option key={time}>{time}</option>
              ))}
            </SelectInput>
          </Field>
        </div>
      </Card>

      <Card title={b('place')}>
        <div className="grid gap-6 sm:grid-cols-2">
          {(
            [
              {
                field: 'pickupLocationId',
                custom: 'pickupCustom',
                address: 'pickupAddress',
                outside: 'pickupOutsideCity',
                label: b('pickupLocation'),
                toggle: b('pickupCustom'),
                options: locations.filter((l) => l.forPickup),
                location: pickupLocation,
              },
              {
                field: 'returnLocationId',
                custom: 'returnCustom',
                address: 'returnAddress',
                outside: 'returnOutsideCity',
                label: b('returnLocation'),
                toggle: b('returnCustom'),
                options: locations.filter((l) => l.forReturn),
                location: returnLocation,
              },
            ] as const
          ).map((place) => (
            <div key={place.field} className="min-w-0">
              {values[place.custom] ? (
                <Field id={place.address} label={place.label} error={err(place.address)}>
                  <TextInput
                    id={place.address}
                    value={values[place.address]}
                    maxLength={200}
                    placeholder={b('addressPlaceholder')}
                    onChange={(event) => set(place.address, event.target.value)}
                    {...describe(place.address, err(place.address))}
                  />
                </Field>
              ) : place.options.length > 1 ? (
                <Field id={place.field} label={place.label}>
                  <SelectInput id={place.field} value={values[place.field]} onChange={(event) => set(place.field, event.target.value)}>
                    {place.options.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.surchargeCents > 0 ? b('locationSurcharge', { name: location.name, price: euro(location.surchargeCents) }) : location.name}
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
                      className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-[15px] text-white ${values[place.outside] === outside ? 'border-gold bg-gold/10' : 'border-line'}`}
                    >
                      <input type="radio" name={place.outside} checked={values[place.outside] === outside} onChange={() => set(place.outside, outside)} className="h-4 w-4 shrink-0 accent-gold" />
                      {b(outside ? 'addressOutside' : 'addressInCity')}
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="mt-4 border-t border-line pt-3">
          <CheckField id="abroadTrip" checked={values.abroadTrip} onChange={(checked) => set('abroadTrip', checked)}>
            {b('abroad')}
          </CheckField>
          {values.abroadTrip ? (
            <Field id="abroadCountries" label={b('abroadCountries')} className="mt-2 pl-8">
              <TextInput id="abroadCountries" value={values.abroadCountries} maxLength={300} onChange={(event) => set('abroadCountries', event.target.value)} />
            </Field>
          ) : null}
        </div>
      </Card>

      {vehicle.extras.length > 0 ? (
        <Card title={b('extras')}>
          <ul className="divide-y divide-line">
            {vehicle.extras.map((extra) => (
              <li key={extra.id} className="flex items-center justify-between gap-4 py-2.5">
                <label htmlFor={`extra-${extra.id}`} className="text-[15px] text-white">
                  {pick(extra.name)}
                  <span className="block text-sm text-muted2">
                    {extra.pricingType === 'per_rental' ? b('perRental', { price: euro(extra.priceCents) }) : b('perDay', { price: euro(extra.priceCents) })}
                  </span>
                </label>
                <SelectInput
                  id={`extra-${extra.id}`}
                  className="w-24"
                  value={values.extras[extra.id] ?? 0}
                  onChange={(event) => set('extras', { ...values.extras, [extra.id]: Number(event.target.value) })}
                >
                  {Array.from({ length: extra.maxQuantity + 1 }, (_, n) => (
                    <option key={n} value={n}>
                      {n === 0 ? '—' : b('pieces', { count: n })}
                    </option>
                  ))}
                </SelectInput>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title={b('note')}>
        <label htmlFor="note" className="sr-only">
          {b('note')}
        </label>
        <textarea id="note" rows={3} maxLength={2000} value={values.note} onChange={(event) => set('note', event.target.value)} className={`${controlClass} h-auto py-2.5`} />
      </Card>

      <Card title={t('price')}>
        <dl className="space-y-1.5 text-[15px]">
          {currentTotalCents !== null ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted2">{t('currentPrice')}</dt>
              <dd className="text-white">{euro(currentTotalCents)}</dd>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between gap-4 border-t border-gold/40 pt-2">
            <dt className="font-semibold text-white">
              {t('newPrice')}
              {price ? <span className="font-normal text-muted2"> · {t('days', { count: price.days })}</span> : null}
            </dt>
            <dd className="text-xl font-bold text-white" aria-live="polite">
              {price ? (price.totalCents !== null ? euro(price.totalCents) : t('individual')) : '—'}
            </dd>
          </div>
        </dl>
      </Card>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-gold px-8 text-base font-semibold text-white transition-colors hover:bg-gold-hover disabled:opacity-60 sm:w-auto"
      >
        {pending ? t('editPending') : confirmed ? t('editSubmit') : t('editSubmitNew')}
      </button>
    </form>
  )
}
