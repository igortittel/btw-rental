import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { BookingEditor } from '@/components/admin/booking-editor'
import { PageHeader } from '@/components/admin/section'
import { requireStaff } from '@/lib/auth/session'
import { isEditable } from '@/lib/booking-status'
import { COUNTRY_CODES } from '@/lib/booking/countries'
import { loadEditorData, splitPhone } from '@/lib/booking/editor-data'
import type { StaffBookingValues } from '@/lib/booking/staff-schema'
import { centsToInput } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { utcToZonedLocal } from '@/lib/time'

export const metadata: Metadata = { title: 'Úprava rezervácie' }

type Customer = {
  first_name?: string; last_name?: string; email?: string; phone?: string; date_of_birth?: string | null
  is_company?: boolean; company_name?: string | null; ico?: string | null; dic?: string | null; ic_dph?: string | null
  billing_address?: { street?: string; city?: string; zip?: string; country?: string }
}

export default async function EditBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireStaff('manager', `/admin/rezervacie/${id}/upravit`)
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const supabase = await createClient()
  const [{ data: booking }, { data: extras }, { vehicles, locations, config, blank }] = await Promise.all([
    supabase.from('bookings').select('*, vehicles(vin, name)').eq('id', id).maybeSingle(),
    supabase.from('booking_extras').select('extra_id, quantity').eq('booking_id', id),
    loadEditorData(),
  ])
  if (!booking) notFound()
  if (!isEditable(booking.status)) redirect(`/admin/rezervacie/${id}`)

  const customer = (booking.customer_snapshot ?? {}) as Customer
  const snapshot = (booking.price_snapshot ?? {}) as { delivery_outside_city?: boolean }
  const address = customer.billing_address ?? {}
  const pickup = utcToZonedLocal(booking.pickup_at)
  const ret = utcToZonedLocal(booking.return_at)
  const initial: StaffBookingValues = {
    ...blank,
    vin: booking.vehicles?.vin ?? '',
    pickupDate: pickup.slice(0, 10),
    pickupTime: pickup.slice(11, 16),
    returnDate: ret.slice(0, 10),
    returnTime: ret.slice(11, 16),
    pickupLocationId: booking.pickup_location_id,
    returnLocationId: booking.return_location_id,
    pickupCustom: !!booking.pickup_custom_address,
    pickupAddress: booking.pickup_custom_address ?? '',
    pickupOutsideCity: !!booking.pickup_custom_address && !!snapshot.delivery_outside_city,
    returnCustom: !!booking.return_custom_address,
    returnAddress: booking.return_custom_address ?? '',
    returnOutsideCity: !!booking.return_custom_address && !!snapshot.delivery_outside_city,
    abroadTrip: booking.abroad_trip,
    abroadCountries: booking.abroad_countries ?? '',
    firstName: customer.first_name ?? '',
    lastName: customer.last_name ?? '',
    email: customer.email ?? '',
    ...(splitPhone(customer.phone) ?? {}),
    dateOfBirth: customer.date_of_birth ?? '',
    isCompany: !!customer.is_company,
    companyName: customer.company_name ?? '',
    ico: customer.ico ?? '',
    dic: customer.dic ?? '',
    icDph: customer.ic_dph ?? '',
    street: address.street ?? '',
    city: address.city ?? '',
    zip: address.zip ?? '',
    country: (COUNTRY_CODES as readonly string[]).includes(address.country ?? '') ? (address.country as StaffBookingValues['country']) : 'SK',
    extras: Object.fromEntries((extras ?? []).filter((e) => e.extra_id).map((e) => [e.extra_id!, e.quantity])),
    rentalPaymentMethod: booking.rental_payment_method,
    depositPaymentMethod: booking.deposit_payment_method,
    note: booking.customer_note ?? '',
    priceMode: booking.total_cents !== null ? 'keep' : 'auto',
    customPrice: centsToInput(booking.total_cents),
    priceReason: booking.price_override_reason ?? '',
    locale: booking.locale === 'en' ? 'en' : 'sk',
  }
  const vehicleMissing = !vehicles.some((v) => v.vin === initial.vin)

  return (
    <div>
      <PageHeader title={`Úprava rezervácie ${booking.number}`} back={{ href: `/admin/rezervacie/${id}`, label: booking.number }} />
      {vehicleMissing ? (
        <p className="mb-4 rounded-lg border border-amber-400/60 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          Vozidlo {booking.vehicles?.name} už nie je v ponuke. Pred uložením vyberte iné vozidlo, alebo ho v administrácii znova aktivujte.
        </p>
      ) : null}
      <BookingEditor mode="edit" bookingId={id} vehicles={vehicles} locations={locations} config={config} initial={{ ...initial, vin: vehicleMissing ? '' : initial.vin }} storedTotalCents={booking.total_cents} mustHavePrice={booking.status !== 'new'} />
    </div>
  )
}
