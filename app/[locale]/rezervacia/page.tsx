import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { BookingForm } from '@/components/booking/booking-form'
import type { BookingConfig, BookingLocation, BookingVehicle } from '@/components/booking/types'
import { getSessionUser } from '@/lib/auth/session'
import { COUNTRY_CODES, PHONE_PREFIXES } from '@/lib/booking/countries'
import type { BookingFormState } from '@/lib/booking/schema'
import { getCatalog, localize } from '@/lib/catalog'
import { vehicleImageUrl } from '@/lib/storage'
import { createClient } from '@/lib/supabase/server'
import { turnstileSiteKey } from '@/lib/turnstile'

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ vozidlo?: string; od?: string; do?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'booking' })
  return { title: t('metaTitle'), robots: { index: false, follow: false } }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Contact and billing data of a signed-in customer, to save them retyping. */
async function profileDefaults(userId: string): Promise<Partial<BookingFormState>> {
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name, phone, date_of_birth, is_company, company_name, ico, dic, ic_dph, billing_address')
    .eq('id', userId)
    .maybeSingle()
  if (!profile) return {}
  const address = (profile.billing_address ?? {}) as { street?: string; city?: string; zip?: string; country?: string }
  const prefix = [...PHONE_PREFIXES].sort((a, b) => b.dial.length - a.dial.length).find((p) => profile.phone?.startsWith(p.dial))
  return {
    firstName: profile.first_name,
    lastName: profile.last_name,
    ...(prefix && profile.phone ? { phonePrefix: prefix.dial, phoneNumber: profile.phone.slice(prefix.dial.length) } : {}),
    dateOfBirth: profile.date_of_birth ?? '',
    isCompany: profile.is_company,
    companyName: profile.company_name ?? '',
    ico: profile.ico ?? '',
    dic: profile.dic ?? '',
    icDph: profile.ic_dph ?? '',
    street: address.street ?? '',
    city: address.city ?? '',
    zip: address.zip ?? '',
    ...(address.country && (COUNTRY_CODES as readonly string[]).includes(address.country) ? { country: address.country } : {}),
  }
}

export default async function BookingPage({ params, searchParams }: Props) {
  const [{ locale }, query] = await Promise.all([params, searchParams])
  setRequestLocale(locale)
  const [catalog, user] = await Promise.all([getCatalog(), getSessionUser()])

  const vehicles: BookingVehicle[] = catalog.vehicles.map((v) => ({
    vin: v.vin,
    name: v.name,
    categoryName: localize(v.categoryName, locale),
    imageUrl: v.images[0] ? vehicleImageUrl(v.images[0].path) : null,
    prices: v.prices.map((p) => ({ minDays: p.minDays, maxDays: p.maxDays, pricePerDayCents: p.pricePerDayCents })),
    extras: v.extras.map((e) => ({ id: e.id, name: e.name, priceCents: e.priceCents, pricingType: e.pricingType, maxQuantity: e.maxQuantity, maxChargeCents: e.maxChargeCents })),
    priceFromCents: v.priceFromCents,
    depositCents: v.depositCents,
    kmLimitPerDay: v.kmLimitPerDay,
    extraKmCents: v.extraKmCents,
    minDriverAge: v.minDriverAge,
    minLicenseMonths: v.minLicenseMonths,
  }))
  const locations: BookingLocation[] = catalog.locations.map((l) => ({ id: l.id, name: localize(l.name, locale), address: l.address, surchargeCents: l.surchargeCents, forPickup: l.forPickup, forReturn: l.forReturn, isDefault: l.isDefault }))
  const defaultFor = (kind: 'forPickup' | 'forReturn') => (locations.find((l) => l.isDefault && l[kind]) ?? locations.find((l) => l[kind]))?.id ?? ''

  const { settings } = catalog
  const config: BookingConfig = {
    vatRate: settings.vat_rate,
    minLeadHours: settings.min_lead_hours,
    minRentalDays: settings.min_rental_days,
    toleranceMinutes: settings.return_tolerance_minutes,
    individualFromDays: settings.individual_price_from_days,
    paymentMethods: settings.payment_methods,
    cancellationTiers: settings.cancellation_tiers,
    termsUrl: settings.terms_url,
    gdprUrl: settings.gdpr_url,
    turnstileSiteKey: turnstileSiteKey(),
    lockedEmail: user?.email || null,
  }

  const vin = (query.vozidlo ?? '').toUpperCase()
  const datesOk = DATE.test(query.od ?? '') && DATE.test(query.do ?? '') && query.od! <= query.do!
  const initial: BookingFormState = {
    vin: vehicles.some((v) => v.vin === vin) ? vin : vehicles.length === 1 ? vehicles[0].vin : '',
    pickupDate: datesOk ? query.od! : '',
    // A one-day term from the catalogue filter gets a morning pick-up and an evening return.
    pickupTime: datesOk && query.od === query.do ? '08:00' : '10:00',
    returnDate: datesOk ? query.do! : '',
    returnTime: datesOk && query.od === query.do ? '20:00' : '10:00',
    pickupLocationId: defaultFor('forPickup'),
    returnLocationId: defaultFor('forReturn'),
    pickupCustom: false,
    pickupAddress: '',
    pickupOutsideCity: false,
    returnCustom: false,
    returnAddress: '',
    returnOutsideCity: false,
    abroadTrip: false,
    abroadCountries: '',
    firstName: '',
    lastName: '',
    email: user?.email ?? '',
    phonePrefix: PHONE_PREFIXES[0].dial,
    phoneNumber: '',
    note: '',
    dateOfBirth: '',
    licenseConfirmed: false,
    isCompany: false,
    companyName: '',
    ico: '',
    dic: '',
    icDph: '',
    street: '',
    city: '',
    zip: '',
    country: 'SK',
    depositConsent: false,
    kmLimitConsent: false,
    rentalPaymentMethod: settings.payment_methods[0] ?? 'transfer',
    depositPaymentMethod: settings.payment_methods[0] ?? 'transfer',
    extras: {},
    termsConsent: false,
    gdprConsent: false,
    marketingConsent: false,
    ...(user ? await profileDefaults(user.id) : {}),
  }

  return <BookingForm vehicles={vehicles} locations={locations} config={config} initial={initial} />
}
