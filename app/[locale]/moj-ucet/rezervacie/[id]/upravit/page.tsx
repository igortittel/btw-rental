import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { BookingEditForm } from '@/components/account/booking-edit-form'
import type { BookingLocation, BookingVehicle } from '@/components/booking/types'
import { Link } from '@/i18n/navigation'
import { localizedPath } from '@/i18n/routing'
import type { BookingEditValues } from '@/lib/account/actions'
import { requireUser } from '@/lib/auth/session'
import { customerEditBlock } from '@/lib/booking/change'
import { getCatalog, localize } from '@/lib/catalog'
import { vehicleImageUrl } from '@/lib/storage'
import { createClient } from '@/lib/supabase/server'
import { utcToZonedLocal } from '@/lib/time'

type Props = { params: Promise<{ locale: string; id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'account' })
  return { title: t('edit'), robots: { index: false, follow: false } }
}

export default async function EditMyBookingPage({ params }: Props) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const detail = localizedPath(locale, `/moj-ucet/rezervacie/${id}`)
  const user = await requireUser(`${detail}/upravit`)
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const supabase = await createClient()
  const [{ data: booking }, { data: extras }, catalog, t] = await Promise.all([
    supabase.from('bookings').select('*').eq('id', id).eq('customer_id', user.id).maybeSingle(),
    supabase.from('booking_extras').select('extra_id, quantity').eq('booking_id', id),
    getCatalog(),
    getTranslations('account'),
  ])
  if (!booking) notFound()
  const { settings } = catalog
  const v = catalog.vehicles.find((item) => item.id === booking.vehicle_id)
  // Not editable online (too late, already running, individual price…): the detail explains why.
  if (!v || customerEditBlock(booking, settings.modification_deadline_hours)) redirect(detail)

  const vehicle: BookingVehicle = {
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
  }
  const locations: BookingLocation[] = catalog.locations.map((l) => ({
    id: l.id,
    name: localize(l.name, locale),
    address: l.address,
    surchargeCents: l.surchargeCents,
    forPickup: l.forPickup,
    forReturn: l.forReturn,
    isDefault: l.isDefault,
  }))
  const snapshot = (booking.price_snapshot ?? {}) as { delivery_outside_city?: boolean }
  const pickup = utcToZonedLocal(booking.pickup_at)
  const ret = utcToZonedLocal(booking.return_at)
  const known = (locationId: string) => (locations.some((l) => l.id === locationId) ? locationId : (locations.find((l) => l.isDefault)?.id ?? locations[0]?.id ?? ''))
  const initial: BookingEditValues = {
    vin: v.vin,
    pickupDate: pickup.slice(0, 10),
    pickupTime: pickup.slice(11, 16),
    returnDate: ret.slice(0, 10),
    returnTime: ret.slice(11, 16),
    pickupLocationId: known(booking.pickup_location_id),
    returnLocationId: known(booking.return_location_id),
    pickupCustom: !!booking.pickup_custom_address,
    pickupAddress: booking.pickup_custom_address ?? '',
    pickupOutsideCity: !!booking.pickup_custom_address && !!snapshot.delivery_outside_city,
    returnCustom: !!booking.return_custom_address,
    returnAddress: booking.return_custom_address ?? '',
    returnOutsideCity: !!booking.return_custom_address && !!snapshot.delivery_outside_city,
    abroadTrip: booking.abroad_trip,
    abroadCountries: booking.abroad_countries ?? '',
    extras: Object.fromEntries((extras ?? []).filter((e) => e.extra_id && v.extras.some((x) => x.id === e.extra_id)).map((e) => [e.extra_id!, e.quantity])),
    note: booking.customer_note ?? '',
  }

  return (
    <section className="mx-auto max-w-3xl px-4 pb-20 pt-28 sm:px-6">
      <Link href={`/moj-ucet/rezervacie/${id}`} className="inline-flex min-h-11 items-center text-sm text-muted2 hover:text-white">
        ← {t('backToBooking')}
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-wide text-white sm:text-3xl">{t('editTitle', { number: booking.number })}</h1>
      <p className="mb-6 mt-2 text-[15px] leading-6 text-muted2">
        {vehicle.name} · {t('editLead')}
      </p>
      <BookingEditForm
        bookingId={id}
        confirmed={booking.status === 'confirmed'}
        vehicle={vehicle}
        locations={locations}
        config={{
          vatRate: settings.vat_rate,
          minLeadHours: settings.min_lead_hours,
          minRentalDays: settings.min_rental_days,
          toleranceMinutes: settings.return_tolerance_minutes,
          individualFromDays: settings.individual_price_from_days,
        }}
        initial={initial}
        currentTotalCents={booking.total_cents}
      />
    </section>
  )
}
