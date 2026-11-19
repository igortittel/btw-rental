import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { BookingCalendar } from '@/components/catalog/booking-calendar'
import { Gallery } from '@/components/catalog/gallery'
import { bookingHref } from '@/components/catalog/vehicle-card'
import { Link } from '@/i18n/navigation'
import { localizedPath } from '@/i18n/routing'
import { getCatalog, localize, type PublicVehicle } from '@/lib/catalog'
import { formatEuro } from '@/lib/format'
import { absoluteUrl, alternates, jsonLdScript, ogLocale, SITE_URL } from '@/lib/seo'
import { vehicleImageUrl } from '@/lib/storage'
import { localDateInHours } from '@/lib/time'
import { parseVehicleSegment, vehiclePath } from '@/lib/vehicle-url'

type Props = { params: Promise<{ locale: string; kategoria: string; vozidlo: string }> }

const GROUPS = ['comfort', 'technical', 'safety', 'included'] as const

/** The vehicle is always looked up by VIN (the part after the last dash). */
async function findVehicle(segment: string) {
  const parsed = parseVehicleSegment(decodeURIComponent(segment))
  if (!parsed) return null
  const catalog = await getCatalog()
  const vehicle = catalog.vehicles.find((v) => v.vin === parsed.vin.toUpperCase())
  return vehicle ? { catalog, vehicle } : null
}

function summary(vehicle: PublicVehicle, t: Awaited<ReturnType<typeof getTranslations>>) {
  return {
    engine: [vehicle.engine, vehicle.powerKw ? `${vehicle.powerKw} kW` : null].filter(Boolean).join(', ') || vehicle.name,
    transmission: t(`transmissionLabels.${vehicle.transmission}`).toLowerCase(),
    seats: t('seatsCount', { count: vehicle.seats }),
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, vozidlo } = await params
  const found = await findVehicle(vozidlo)
  if (!found) return {}
  const { vehicle } = found
  const [t, c] = await Promise.all([getTranslations({ locale, namespace: 'vehicle' }), getTranslations({ locale, namespace: 'catalog' })])
  const path = vehiclePath(vehicle.categorySlug, vehicle.slug, vehicle.vin)
  const title = t('metaTitle', { name: vehicle.name })
  const description = t('metaDescription', {
    name: vehicle.name,
    price: vehicle.priceFromCents !== null ? formatEuro(vehicle.priceFromCents, locale) : '—',
    km: vehicle.kmLimitPerDay,
    deposit: formatEuro(vehicle.depositCents, locale),
    ...summary(vehicle, c),
  })
  const image = vehicle.images[0]
  return {
    title,
    description,
    alternates: alternates(path, locale),
    openGraph: {
      title,
      description,
      type: 'website',
      url: absoluteUrl(path, locale),
      locale: ogLocale(locale),
      siteName: 'BY THE WAVE',
      images: image ? [{ url: vehicleImageUrl(image.path), width: image.width ?? undefined, height: image.height ?? undefined, alt: vehicle.name }] : undefined,
    },
  }
}

export default async function VehiclePage({ params }: Props) {
  const { locale, kategoria, vozidlo } = await params
  setRequestLocale(locale)
  const found = await findVehicle(vozidlo)
  if (!found) notFound()
  const { vehicle, catalog } = found

  // Wrong category, outdated name or lower-case VIN -> permanent redirect to the canonical URL.
  const canonical = vehiclePath(vehicle.categorySlug, vehicle.slug, vehicle.vin)
  if (`/${kategoria}/${decodeURIComponent(vozidlo)}` !== canonical) permanentRedirect(localizedPath(locale, canonical))

  const [t, c] = await Promise.all([getTranslations('vehicle'), getTranslations('catalog')])
  const { settings } = catalog
  const defaultLocation = catalog.locations.find((l) => l.isDefault) ?? catalog.locations[0]
  const euro = (cents: number | null) => formatEuro(cents, locale)
  const description = localize(vehicle.description, locale)

  const parameters = [
    [c('fuel'), c(`fuelLabels.${vehicle.fuel}`)],
    [c('transmission'), [c(`transmissionLabels.${vehicle.transmission}`), vehicle.gears ? t('gears', { count: vehicle.gears }) : null].filter(Boolean).join(', ')],
    vehicle.engine ? [t('engine'), vehicle.engine] : null,
    vehicle.powerKw ? [t('power'), vehicle.powerHp ? t('powerValueHp', { kw: vehicle.powerKw, hp: vehicle.powerHp }) : t('powerValue', { kw: vehicle.powerKw })] : null,
    vehicle.drivetrain ? [t('drivetrain'), c('drivetrainLabels.' + vehicle.drivetrain)] : null,
    [c('seats'), String(vehicle.seats)],
    vehicle.luggage ? [t('luggage'), c('luggageCount', { count: vehicle.luggage })] : null,
    [t('vin'), vehicle.vin],
  ].filter((row): row is [string, string] => row !== null)

  const tierLabel = (min: number, max: number | null) =>
    max === null ? t('tierOpen', { min }) : min === max ? (min === 1 ? t('tierOne') : t('tierSame', { count: min })) : t('tierRange', { min, max })

  const tiers = [...settings.cancellation_tiers].sort((a, b) => b.min_hours - a.min_hours)
  const cancellationRows = tiers.map((tier, i) => ({
    when:
      i === 0
        ? t('cancelMoreThan', { hours: tier.min_hours })
        : tier.min_hours === 0
          ? t('cancelLessThan', { hours: tiers[i - 1].min_hours })
          : t('cancelBetween', { from: tiers[i - 1].min_hours, to: tier.min_hours }),
    fee: tier.fee_percent === 0 ? t('cancelFree') : `${tier.fee_percent} %`,
  }))

  const conditions: [string, string][] = [
    [t('deposit'), euro(vehicle.depositCents)],
    [t('kmLimit'), t('kmLimitValue', { km: vehicle.kmLimitPerDay })],
    [t('extraKm'), t('extraKmValue', { price: euro(vehicle.extraKmCents) })],
    [t('minAge'), t('minAgeValue', { age: vehicle.minDriverAge })],
    [t('license'), t('licenseValue', { months: vehicle.minLicenseMonths })],
    [t('payment'), settings.payment_methods.map((m) => t(`paymentMethods.${m}`)).join(', ')],
    ...(defaultLocation ? ([[t('pickup'), t('pickupValue', { address: defaultLocation.address })]] as [string, string][]) : []),
    [t('abroad'), t('abroadValue')],
  ]

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Car',
    name: vehicle.name,
    brand: { '@type': 'Brand', name: vehicle.brand },
    model: [vehicle.model, vehicle.variant].filter(Boolean).join(' '),
    vehicleIdentificationNumber: vehicle.vin,
    description: description || undefined,
    image: vehicle.images.map((i) => vehicleImageUrl(i.path)),
    fuelType: c(`fuelLabels.${vehicle.fuel}`),
    vehicleTransmission: c(`transmissionLabels.${vehicle.transmission}`),
    seatingCapacity: vehicle.seats,
    numberOfForwardGears: vehicle.gears ?? undefined,
    vehicleEngine: vehicle.engine
      ? { '@type': 'EngineSpecification', name: vehicle.engine, enginePower: vehicle.powerKw ? { '@type': 'QuantitativeValue', value: vehicle.powerKw, unitCode: 'KWT' } : undefined }
      : undefined,
    url: absoluteUrl(canonical, locale),
    offers:
      vehicle.priceFromCents !== null
        ? {
            '@type': 'Offer',
            businessFunction: 'http://purl.org/goodrelations/v1#LeaseOut',
            price: (vehicle.priceFromCents / 100).toFixed(2),
            priceCurrency: 'EUR',
            priceSpecification: { '@type': 'UnitPriceSpecification', price: (vehicle.priceFromCents / 100).toFixed(2), priceCurrency: 'EUR', unitCode: 'DAY', valueAddedTaxIncluded: true },
            availability: 'https://schema.org/InStock',
            url: absoluteUrl(canonical, locale),
            seller: { '@type': 'AutoRental', '@id': `${SITE_URL}/#organization`, name: settings.company.name },
          }
        : undefined,
  }

  const h2 = 'text-2xl font-bold tracking-wide text-white'
  const card = 'rounded-xl border border-gold/40 bg-surface p-6'
  const cardTitle = 'text-xl font-bold tracking-wide text-white'
  const cardLead = 'mt-2 text-sm text-muted2'
  const row = 'flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-3 text-sm last:border-0'
  const minDate = localDateInHours(settings.min_lead_hours)
  const book = (
    <Link
      href={bookingHref(vehicle)}
      rel="nofollow"
      className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-gold px-8 text-base font-semibold text-white transition-colors hover:bg-gold-hover sm:w-auto"
    >
      {t('book')}
    </Link>
  )

  return (
    <article className="pb-20 pt-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />

      <div className="mx-auto max-w-6xl px-6">
        <Link href={`/${vehicle.categorySlug}`} className="inline-flex min-h-11 items-center text-sm text-muted2 hover:text-white">
          ← {t('back')}
        </Link>

        <div className="mt-4 grid gap-10 lg:grid-cols-2">
          <Gallery images={vehicle.images.map((i) => ({ id: i.id, url: vehicleImageUrl(i.path), alt: localize(i.alt, locale) || vehicle.name, fit: i.isMain ? 'contain' : 'cover' }))} />

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gold">{localize(vehicle.categoryName, locale)}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-wide text-white md:text-4xl">{vehicle.name}</h1>
            <p className="mt-3 text-xl font-semibold text-white">{vehicle.priceFromCents !== null ? t('priceFrom', { price: euro(vehicle.priceFromCents) }) : c('priceOnRequest')}</p>
            {description ? <p className="mt-5 leading-7 text-muted2">{description}</p> : null}

            <h2 className="sr-only">{t('parameters')}</h2>
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-gold/40 pt-6 text-sm">
              {parameters.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted2">{label}</dt>
                  <dd className="break-words text-white">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-8">{book}</div>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-16 max-w-6xl space-y-16 px-6">
        <section aria-labelledby="availability">
          <h2 id="availability" className={h2}>
            {t('availability')}
          </h2>
          <p className="mb-6 mt-2 text-sm text-muted2">{t('availabilityLead')}</p>
          <div className="rounded-xl border border-gold/40 bg-surface p-5 sm:p-6">
            <BookingCalendar vin={vehicle.vin} minDate={minDate} />
          </div>
        </section>

        <section aria-labelledby="equipment">
          <h2 id="equipment" className={h2}>
            {t('equipment')}
          </h2>
          <div className="mt-6 grid gap-8 md:grid-cols-2">
            {GROUPS.map((group) => {
              const items = vehicle.features.filter((f) => f.group === group)
              if (items.length === 0) return null
              return (
                <div key={group} className="rounded-xl border border-gold/40 bg-surface p-6">
                  <h3 className="text-sm font-semibold uppercase tracking-widest text-gold">{t(`groups.${group}`)}</h3>
                  <ul className="mt-4 space-y-2 text-sm leading-6 text-muted2">
                    {items.map((item) => (
                      <li key={item.id} className="flex gap-3">
                        <span aria-hidden="true" className="mt-2.5 h-px w-3 shrink-0 bg-gold" />
                        {localize(item.name, locale)}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </section>

        {/* Four equal cards on one 2 × 2 grid. */}
        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="pricing" className={card}>
            <h2 id="pricing" className={cardTitle}>
              {t('pricing')}
            </h2>
            <p className={cardLead}>{t('pricingLead')}</p>
            <dl className="mt-4">
              {vehicle.prices.map((price) => (
                <div key={price.tierId} className={row}>
                  <dt className="text-muted2">{tierLabel(price.minDays, price.maxDays)}</dt>
                  <dd className="text-right font-semibold text-white">
                    {price.maxDays === null || price.pricePerDayCents === null ? t('individualPrice') : `${euro(price.pricePerDayCents)} ${t('perDay')}`}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="extras" className={card}>
            <h2 id="extras" className={cardTitle}>
              {t('extras')}
            </h2>
            <p className={cardLead}>{t('extrasLead')}</p>
            <dl className="mt-4">
              {vehicle.extras.map((extra) => (
                <div key={extra.id} className={row}>
                  <dt className="text-muted2">
                    {localize(extra.name, locale)}
                    {extra.maxQuantity > 1 ? <span className="text-xs"> · {t('maxQuantity', { count: extra.maxQuantity })}</span> : null}
                  </dt>
                  <dd className="whitespace-nowrap text-right font-semibold text-white">
                    {euro(extra.priceCents)} {extra.pricingType === 'per_day' ? t('perDay') : t('perRental')}
                  </dd>
                </div>
              ))}
              {vehicle.extras.length === 0 ? <p className="py-3 text-sm text-muted2">—</p> : null}
            </dl>
          </section>

          <section aria-labelledby="conditions" className={card}>
            <h2 id="conditions" className={cardTitle}>
              {t('conditions')}
            </h2>
            <dl className="mt-4">
              {conditions.map(([label, value]) => (
                <div key={label} className={row}>
                  <dt className="text-muted2">{label}</dt>
                  <dd className="text-right font-semibold text-white">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="cancellation" className={card}>
            <h2 id="cancellation" className={cardTitle}>
              {t('cancellation')}
            </h2>
            <p className={cardLead}>{t('cancellationLead')}</p>
            <dl className="mt-4">
              {cancellationRows.map((item) => (
                <div key={item.when} className={row}>
                  <dt className="text-muted2">{item.when}</dt>
                  <dd className="text-right font-semibold text-white">{item.fee}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <div className="text-center">{book}</div>
      </div>
    </article>
  )
}
