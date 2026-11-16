import type { PaymentMethod } from '@/lib/booking/schema'
import type { PriceBreakdown } from '@/lib/pricing'

type Localized = { sk?: string; en?: string }
type Place = { id: string; name: Localized; address: string }

export type BookingRecordInput = {
  vehicle: { id: string; vin: string; name: string; depositCents: number; kmLimitPerDay: number; extraKmCents: number; minDriverAge: number; minLicenseMonths: number }
  pickupAt: Date
  returnAt: Date
  pickupLocation: Place
  returnLocation: Place
  /** Customer's own delivery / collection address, or null for the standard location. */
  pickupAddress: string | null
  returnAddress: string | null
  deliveryOutsideCity: boolean
  price: PriceBreakdown
  priceOverrideReason?: string | null
  toleranceMinutes: number
  customerSnapshot: Record<string, unknown>
  note: string
  rentalPaymentMethod: PaymentMethod
  depositPaymentMethod: PaymentMethod
  locale: 'sk' | 'en'
  abroadTrip: boolean
  abroadCountries: string
}

/**
 * Columns of a booking and its extras as create_booking() / staff_update_booking()
 * expect them. One place builds the price snapshot for the public form, for bookings
 * entered by staff and for edits – later price-list changes never affect a stored booking.
 */
export function buildBookingRecord(input: BookingRecordInput) {
  const { vehicle, price, pickupLocation, returnLocation } = input
  return {
    booking: {
      vehicle_id: vehicle.id,
      pickup_at: input.pickupAt.toISOString(),
      return_at: input.returnAt.toISOString(),
      pickup_location_id: pickupLocation.id,
      return_location_id: returnLocation.id,
      pickup_custom_address: input.pickupAddress ?? '',
      return_custom_address: input.returnAddress ?? '',
      customer_note: input.note,
      customer_snapshot: input.customerSnapshot,
      days: price.days,
      price_snapshot: {
        ...price,
        tolerance_minutes: input.toleranceMinutes,
        vehicle: { id: vehicle.id, vin: vehicle.vin, name: vehicle.name },
        pickup_location: { id: pickupLocation.id, name: pickupLocation.name, address: pickupLocation.address },
        return_location: { id: returnLocation.id, name: returnLocation.name, address: returnLocation.address },
        pickup_custom_address: input.pickupAddress,
        return_custom_address: input.returnAddress,
        delivery_outside_city: input.deliveryOutsideCity,
        min_driver_age: vehicle.minDriverAge,
        min_license_months: vehicle.minLicenseMonths,
      },
      subtotal_cents: price.rentalCents,
      total_cents: price.totalCents,
      vat_rate: price.vatRate,
      is_individual_price: price.isIndividual,
      price_override_reason: input.priceOverrideReason ?? '',
      deposit_cents: vehicle.depositCents,
      rental_payment_method: input.rentalPaymentMethod,
      deposit_payment_method: input.depositPaymentMethod,
      km_limit_per_day: vehicle.kmLimitPerDay,
      extra_km_cents: vehicle.extraKmCents,
      locale: input.locale,
      abroad_trip: input.abroadTrip,
      abroad_countries: input.abroadTrip ? input.abroadCountries : '',
    },
    extras: price.extras.map((line) => ({
      extra_id: line.extraId,
      name_snapshot: line.name,
      quantity: line.quantity,
      unit_price_cents: line.unitPriceCents,
      pricing_type: line.pricingType,
      total_cents: line.totalCents,
    })),
  }
}
