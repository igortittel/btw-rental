import Image from 'next/image'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { localize, type PublicVehicle } from '@/lib/catalog'
import { formatEuro } from '@/lib/format'
import { vehicleImageUrl } from '@/lib/storage'
import { vehiclePath } from '@/lib/vehicle-url'

export function bookingHref(vehicle: PublicVehicle, query?: URLSearchParams): string {
  const params = new URLSearchParams(query)
  params.set('vozidlo', vehicle.vin)
  return `/rezervacia?${params.toString()}`
}

export async function VehicleCard({ vehicle, priority = false, dates }: { vehicle: PublicVehicle; priority?: boolean; dates?: URLSearchParams }) {
  const [t, locale] = await Promise.all([getTranslations('catalog'), getLocale()])
  const image = vehicle.images[0]
  const href = vehiclePath(vehicle.categorySlug, vehicle.slug, vehicle.vin)
  const engine = [vehicle.engine, vehicle.powerKw ? `${vehicle.powerKw} kW` : null].filter(Boolean).join(', ')
  const specs = [
    t(`fuelLabels.${vehicle.fuel}`),
    t(`transmissionLabels.${vehicle.transmission}`),
    t('seatsCount', { count: vehicle.seats }),
    vehicle.luggage ? t('luggageCount', { count: vehicle.luggage }) : null,
  ].filter(Boolean)

  return (
    <article className="flex h-full flex-col rounded-xl border border-gold/50 bg-surface transition-colors hover:border-gold">
      <Link href={href} className="block p-6 pb-0" tabIndex={-1} aria-hidden="true">
        <div className="relative aspect-[10/7]">
          {image ? (
            <Image
              src={vehicleImageUrl(image.path)}
              alt=""
              fill
              sizes="(min-width: 1024px) 340px, (min-width: 640px) 45vw, 90vw"
              className="object-contain"
              priority={priority}
            />
          ) : null}
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-gold">{localize(vehicle.categoryName, locale)}</p>
        <h2 className="mt-2 text-lg font-bold text-white">
          <Link href={href} className="hover:underline">
            {vehicle.name}
          </Link>
        </h2>
        {engine ? <p className="mt-1 text-sm text-muted2">{engine}</p> : null}
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted2">
          {specs.map((spec) => (
            <li key={spec}>{spec}</li>
          ))}
        </ul>
        <p className="mt-5 text-base font-semibold text-white">
          {vehicle.priceFromCents !== null ? t('priceFrom', { price: formatEuro(vehicle.priceFromCents, locale) }) : t('priceOnRequest')}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 pt-1">
          <Link href={href} className="flex h-11 items-center justify-center rounded-lg border border-gold text-sm font-semibold text-white transition-colors hover:bg-gold/15">
            {t('detail')}
          </Link>
          <Link href={bookingHref(vehicle, dates)} className="flex h-11 items-center justify-center rounded-lg bg-gold text-sm font-semibold text-white transition-colors hover:bg-gold-hover" rel="nofollow">
            {t('book')}
          </Link>
        </div>
      </div>
    </article>
  )
}
