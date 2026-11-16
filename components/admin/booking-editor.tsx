'use client'

import { useMemo, useState, useTransition } from 'react'
import { createStaffBookingAction, updateBookingAction } from '@/app/admin/rezervacie/actions'
import { Card, CheckField, DateInput, Field, RadioCards, SelectInput, TextInput, controlClass, describe } from '@/components/booking/fields'
import type { BookingLocation, BookingVehicle } from '@/components/booking/types'
import { COUNTRY_CODES, PHONE_PREFIXES, countryName } from '@/lib/booking/countries'
import { termInstants } from '@/lib/booking/schema'
import { STAFF_ERROR_MESSAGES, staffBookingSchema, staffFieldErrors, staffRuleErrors, type StaffBookingValues, type StaffFieldErrors } from '@/lib/booking/staff-schema'
import { PAYMENT_METHOD_LABELS } from '@/lib/booking/status'
import { formatEuro, parseEuroToCents } from '@/lib/format'
import { applyPriceOverride, calculatePrice } from '@/lib/pricing'

type Props = {
  mode: 'create' | 'edit'
  bookingId?: string
  vehicles: BookingVehicle[]
  locations: BookingLocation[]
  config: { vatRate: number; toleranceMinutes: number; individualFromDays: number; paymentMethods: ('transfer' | 'terminal' | 'cash')[] }
  initial: StaffBookingValues
  /** Edit: the price currently stored with the booking. */
  storedTotalCents?: number | null
  /** Edit: a booking that already blocks the vehicle must keep a price. */
  mustHavePrice?: boolean
}

const BASE_TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)

/** Form for a booking entered by staff (phone order) and for editing an existing one. */
export function BookingEditor({ mode, bookingId, vehicles, locations, config, initial, storedTotalCents = null, mustHavePrice = false }: Props) {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<StaffFieldErrors>({})
  const [status, setStatus] = useState<'new' | 'confirmed'>('confirmed')
  const [sendEmail, setSendEmail] = useState(true)
  const [pending, startTransition] = useTransition()

  type Key = keyof StaffBookingValues
  const set = <K extends Key>(key: K, value: StaffBookingValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => (current[key] || current.form ? { ...current, [key]: undefined, form: undefined } : current))
  }
  const err = (key: Key | 'form') => (errors[key] ? (STAFF_ERROR_MESSAGES[errors[key]!] ?? STAFF_ERROR_MESSAGES.unknown) : undefined)
  const euro = (cents: number) => formatEuro(cents)
  const times = useMemo(() => [...new Set([...BASE_TIMES, initial.pickupTime, initial.returnTime])].sort(), [initial.pickupTime, initial.returnTime])

  const vehicle = vehicles.find((v) => v.vin === values.vin) ?? null
  const pickupLocation = locations.find((l) => l.id === values.pickupLocationId) ?? null
  const returnLocation = locations.find((l) => l.id === values.returnLocationId) ?? null

  // Live preview with the same function the server uses; the server result is what is stored.
  const price = useMemo(() => {
    const instants = termInstants(values)
    if (!vehicle || !instants || instants.returnAt <= instants.pickupAt) return null
    const auto = calculatePrice({
      ...instants,
      tiers: vehicle.prices,
      extras: vehicle.extras.filter((extra) => (values.extras[extra.id] ?? 0) > 0).map((extra) => ({ extra, quantity: values.extras[extra.id] })),
      pickupSurchargeCents: values.pickupCustom ? 0 : (pickupLocation?.surchargeCents ?? 0),
      returnSurchargeCents: values.returnCustom ? 0 : (returnLocation?.surchargeCents ?? 0),
      vatRate: config.vatRate,
      toleranceMinutes: config.toleranceMinutes,
      individualFromDays: config.individualFromDays,
    })
    const custom = parseEuroToCents(values.customPrice)
    if (values.priceMode === 'custom' && custom !== null && !Number.isNaN(custom)) return { auto, final: applyPriceOverride(auto, custom) }
    if (values.priceMode === 'keep' && storedTotalCents !== null) return { auto, final: applyPriceOverride(auto, storedTotalCents) }
    return { auto, final: auto }
  }, [values, vehicle, pickupLocation, returnLocation, config, storedTotalCents])

  const submit = () => {
    const parsed = staffBookingSchema.safeParse(values)
    const found: StaffFieldErrors = { ...staffRuleErrors(values), ...(parsed.success ? {} : staffFieldErrors(parsed.error)) }
    const instants = termInstants(values)
    if (!found.returnDate && instants && instants.returnAt <= instants.pickupAt) found.returnDate = 'return_before_pickup'
    if (Object.values(found).some(Boolean)) {
      setErrors(found)
      requestAnimationFrame(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus())
      return
    }
    startTransition(async () => {
      const call = mode === 'create' ? createStaffBookingAction(values, { status, sendEmail }) : updateBookingAction(bookingId!, values)
      const result: { errors: StaffFieldErrors; redirectTo?: string } = await call.catch(() => ({ errors: { form: 'unknown' } }))
      if (result.redirectTo) {
        window.location.assign(result.redirectTo)
        return
      }
      setErrors(result.errors)
      window.scrollTo({ top: 0, behavior: 'instant' })
    })
  }

  const text = (key: 'firstName' | 'lastName' | 'email' | 'phoneNumber' | 'companyName' | 'ico' | 'dic' | 'icDph' | 'street' | 'city' | 'zip' | 'abroadCountries' | 'pickupAddress' | 'returnAddress' | 'customPrice' | 'priceReason', label: string, props: React.ComponentProps<'input'> = {}, className?: string) => (
    <Field id={key} label={label} error={err(key)} className={className}>
      <TextInput id={key} value={values[key]} onChange={(event) => set(key, event.target.value)} {...describe(key, err(key))} {...props} />
    </Field>
  )
  const methodOptions = config.paymentMethods.map((value) => ({ value, label: PAYMENT_METHOD_LABELS[value] }))
  const needsPrice = mode === 'create' ? status === 'confirmed' : mustHavePrice

  return (
    <form
      noValidate
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="space-y-4">
        {Object.values(errors).some(Boolean) ? (
          <p role="alert" className="rounded-lg border border-red-400/60 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {err('form') ?? err('priceMode') ?? 'Skontrolujte označené polia.'}
          </p>
        ) : null}

        <Card title="Vozidlo a termín">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="vin" label="Vozidlo" error={err('vin')} className="sm:col-span-2">
              <SelectInput id="vin" value={values.vin} {...describe('vin', err('vin'))} onChange={(event) => setValues((current) => ({ ...current, vin: event.target.value, extras: {} }))}>
                <option value="">Vyberte vozidlo</option>
                {vehicles.map((v) => (
                  <option key={v.vin} value={v.vin}>
                    {v.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field id="pickupDate" label="Vyzdvihnutie – dátum" error={err('pickupDate')}>
              <DateInput id="pickupDate" value={values.pickupDate} onChange={(event) => set('pickupDate', event.target.value)} {...describe('pickupDate', err('pickupDate'))} />
            </Field>
            <Field id="pickupTime" label="Čas">
              <SelectInput id="pickupTime" value={values.pickupTime} onChange={(event) => set('pickupTime', event.target.value)}>
                {times.map((time) => (
                  <option key={time}>{time}</option>
                ))}
              </SelectInput>
            </Field>
            <Field id="returnDate" label="Odovzdanie – dátum" error={err('returnDate')}>
              <DateInput id="returnDate" min={values.pickupDate} value={values.returnDate} onChange={(event) => set('returnDate', event.target.value)} {...describe('returnDate', err('returnDate'))} />
            </Field>
            <Field id="returnTime" label="Čas">
              <SelectInput id="returnTime" value={values.returnTime} onChange={(event) => set('returnTime', event.target.value)}>
                {times.map((time) => (
                  <option key={time}>{time}</option>
                ))}
              </SelectInput>
            </Field>
          </div>
        </Card>

        <Card title="Miesto">
          <div className="grid gap-6 sm:grid-cols-2">
            {(
              [
                { field: 'pickupLocationId', custom: 'pickupCustom', address: 'pickupAddress', outside: 'pickupOutsideCity', label: 'Miesto vyzdvihnutia', options: locations.filter((l) => l.forPickup) },
                { field: 'returnLocationId', custom: 'returnCustom', address: 'returnAddress', outside: 'returnOutsideCity', label: 'Miesto odovzdania', options: locations.filter((l) => l.forReturn) },
              ] as const
            ).map((place) => (
              <div key={place.field} className="min-w-0">
                {values[place.custom] ? (
                  text(place.address, place.label, { placeholder: 'Ulica, číslo, mesto', maxLength: 200 })
                ) : (
                  <Field id={place.field} label={place.label} error={err(place.field)}>
                    <SelectInput id={place.field} value={values[place.field]} onChange={(event) => set(place.field, event.target.value)}>
                      {place.options.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                          {location.surchargeCents > 0 ? ` (+${euro(location.surchargeCents)})` : ''}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                )}
                <CheckField id={place.custom} checked={values[place.custom]} onChange={(checked) => set(place.custom, checked)}>
                  Pristavenie na inú adresu
                </CheckField>
                {values[place.custom] ? (
                  <CheckField id={place.outside} checked={values[place.outside]} onChange={(checked) => set(place.outside, checked)}>
                    Adresa je mimo Bratislavy (individuálne)
                  </CheckField>
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-2 border-t border-line pt-2">
            <CheckField id="abroadTrip" checked={values.abroadTrip} onChange={(checked) => set('abroadTrip', checked)}>
              Cesta do zahraničia
            </CheckField>
            {values.abroadTrip ? text('abroadCountries', 'Krajiny', { maxLength: 300 }) : null}
          </div>
        </Card>

        <Card title="Zákazník">
          <div className="grid gap-4 sm:grid-cols-2">
            {text('firstName', 'Meno', { maxLength: 80 })}
            {text('lastName', 'Priezvisko', { maxLength: 80 })}
            <Field id="email" label="E-mail" error={err('email')} hint={mode === 'edit' ? 'E-mail určuje účet zákazníka a tu sa nemení.' : 'Podľa e-mailu sa rezervácia priradí k existujúcemu účtu, inak sa vytvorí nový.'} className="sm:col-span-2">
              <TextInput id="email" type="email" inputMode="email" value={values.email} readOnly={mode === 'edit'} spellCheck={false} onChange={(event) => set('email', event.target.value)} {...describe('email', err('email'), 'hint')} />
            </Field>
            <div className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] gap-3 sm:col-span-2">
              <Field id="phonePrefix" label="Predvoľba">
                <SelectInput id="phonePrefix" value={values.phonePrefix} onChange={(event) => set('phonePrefix', event.target.value)}>
                  {PHONE_PREFIXES.map((prefix) => (
                    <option key={prefix.country} value={prefix.dial}>
                      {prefix.country} {prefix.dial}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              {text('phoneNumber', 'Telefón', { type: 'tel', inputMode: 'tel', maxLength: 20 })}
            </div>
            <Field id="dateOfBirth" label="Dátum narodenia (nepovinné)" error={err('dateOfBirth')}>
              <DateInput id="dateOfBirth" value={values.dateOfBirth} onChange={(event) => set('dateOfBirth', event.target.value)} />
            </Field>
            <Field id="locale" label="Jazyk e-mailov">
              <SelectInput id="locale" value={values.locale} onChange={(event) => set('locale', event.target.value as 'sk' | 'en')}>
                <option value="sk">Slovenčina</option>
                <option value="en">English</option>
              </SelectInput>
            </Field>
          </div>
          <div className="mt-4 border-t border-line pt-3">
            <CheckField id="isCompany" checked={values.isCompany} onChange={(checked) => set('isCompany', checked)}>
              Firma
            </CheckField>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              {values.isCompany ? (
                <>
                  {text('companyName', 'Názov firmy', { maxLength: 160 }, 'sm:col-span-2')}
                  {text('ico', 'IČO', { maxLength: 14 })}
                  {text('dic', 'DIČ', { maxLength: 20 })}
                  {text('icDph', 'IČ DPH', { maxLength: 20 })}
                </>
              ) : null}
              {text('street', 'Ulica a číslo (fakturačná adresa)', { maxLength: 160 }, 'sm:col-span-2')}
              {text('city', 'Mesto', { maxLength: 100 })}
              {text('zip', 'PSČ', { maxLength: 12 })}
              <Field id="country" label="Krajina" className="sm:col-span-2">
                <SelectInput id="country" value={values.country} onChange={(event) => set('country', event.target.value as StaffBookingValues['country'])}>
                  {COUNTRY_CODES.map((code) => (
                    <option key={code} value={code}>
                      {countryName(code, 'sk')}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
          </div>
        </Card>

        {vehicle && vehicle.extras.length > 0 ? (
          <Card title="Doplnky">
            <ul className="divide-y divide-line">
              {vehicle.extras.map((extra) => {
                const quantity = values.extras[extra.id] ?? 0
                return (
                  <li key={extra.id} className="flex items-center justify-between gap-4 py-2.5">
                    <label htmlFor={`extra-${extra.id}`} className="text-sm text-white">
                      {extra.name.sk} <span className="text-muted2">· {euro(extra.priceCents)} {extra.pricingType === 'per_day' ? '/ deň' : '/ prenájom'}</span>
                    </label>
                    <SelectInput id={`extra-${extra.id}`} className="w-24" value={quantity} onChange={(event) => set('extras', { ...values.extras, [extra.id]: Number(event.target.value) })}>
                      {Array.from({ length: extra.maxQuantity + 1 }, (_, n) => (
                        <option key={n} value={n}>
                          {n === 0 ? '—' : `${n} ks`}
                        </option>
                      ))}
                    </SelectInput>
                  </li>
                )
              })}
            </ul>
          </Card>
        ) : null}

        <Card title="Platba a poznámka">
          <div className="space-y-4">
            <RadioCards name="rentalPaymentMethod" legend="Platba prenájmu" value={values.rentalPaymentMethod} options={methodOptions} onChange={(value) => set('rentalPaymentMethod', value)} />
            <RadioCards name="depositPaymentMethod" legend="Platba depozitu" value={values.depositPaymentMethod} options={methodOptions} onChange={(value) => set('depositPaymentMethod', value)} />
            <Field id="note" label="Poznámka zákazníka / k objednávke">
              <textarea id="note" rows={3} maxLength={2000} value={values.note} onChange={(event) => set('note', event.target.value)} className={`${controlClass} h-auto py-2.5`} />
            </Field>
          </div>
        </Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card title="Cena">
          <RadioCards
            name="priceMode"
            stack
            legend="Spôsob určenia ceny"
            value={values.priceMode}
            options={[
              ...(mode === 'edit' && storedTotalCents !== null ? [{ value: 'keep' as const, label: `Ponechať ${euro(storedTotalCents)}` }] : []),
              { value: 'auto' as const, label: 'Podľa cenníka' },
              { value: 'custom' as const, label: 'Vlastná cena' },
            ]}
            onChange={(value) => set('priceMode', value)}
          />
          {values.priceMode === 'custom' ? (
            <div className="mt-4 space-y-4">
              {text('customPrice', 'Cena spolu s DPH (€)', { inputMode: 'decimal', placeholder: 'napr. 450' })}
              {text('priceReason', 'Dôvod úpravy ceny', { maxLength: 300 })}
            </div>
          ) : null}
          <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
            {price ? (
              <>
                <Row label="Počet dní" value={String(price.final.days)} />
                <Row label="Podľa cenníka" value={price.auto.totalCents !== null ? euro(price.auto.totalCents) : 'individuálna cena'} />
                {price.final.extrasCents > 0 ? <Row label="z toho doplnky" value={euro(price.final.extrasCents)} /> : null}
                <div className="flex items-baseline justify-between gap-4 border-t border-gold/40 pt-2 text-base">
                  <dt className="font-semibold text-white">Spolu s DPH</dt>
                  <dd className="text-lg font-bold text-white">{price.final.totalCents !== null ? euro(price.final.totalCents) : 'bez ceny'}</dd>
                </div>
                {price.final.totalCents === null ? (
                  <p className={`pt-1 text-xs ${needsPrice ? 'text-red-300' : 'text-muted2'}`}>{needsPrice ? 'Potvrdená rezervácia musí mať cenu – zvoľte „Vlastná cena“.' : 'Dlhodobý prenájom: cenu doplníte neskôr, potom sa dá rezervácia potvrdiť.'}</p>
                ) : null}
                {vehicle ? <Row label="Depozit" value={euro(vehicle.depositCents)} /> : null}
              </>
            ) : (
              <p className="text-muted2">Vyberte vozidlo a termín.</p>
            )}
          </dl>
        </Card>

        {mode === 'create' ? (
          <Card title="Uloženie">
            <RadioCards
              name="status"
              stack
              legend="Stav rezervácie"
              value={status}
              options={[
                { value: 'confirmed' as const, label: 'Potvrdená' },
                { value: 'new' as const, label: 'Nová' },
              ]}
              onChange={setStatus}
            />
            <div className="mt-2">
              <CheckField id="sendEmail" checked={sendEmail} onChange={setSendEmail}>
                Poslať zákazníkovi e-mail
              </CheckField>
            </div>
          </Card>
        ) : null}

        <button type="submit" disabled={pending} className="h-12 w-full rounded-lg bg-gold px-6 text-base font-semibold text-white transition-colors hover:bg-gold-hover disabled:opacity-60">
          {pending ? 'Ukladám…' : mode === 'create' ? 'Vytvoriť rezerváciu' : 'Uložiť zmeny'}
        </button>
      </aside>
    </form>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted2">{label}</dt>
      <dd className="text-right text-white">{value}</dd>
    </div>
  )
}
