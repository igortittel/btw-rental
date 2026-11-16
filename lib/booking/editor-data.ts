import 'server-only'
import type { BookingLocation, BookingVehicle } from '@/components/booking/types'
import { PHONE_PREFIXES } from '@/lib/booking/countries'
import type { StaffBookingValues } from '@/lib/booking/staff-schema'
import { getCatalog, localize } from '@/lib/catalog'
import { vehicleImageUrl } from '@/lib/storage'

/** Vehicles, locations and settings the admin booking editor needs (public catalogue data). */
export async function loadEditorData() {
  const catalog = await getCatalog()
  const vehicles: BookingVehicle[] = catalog.vehicles.map((v) => ({
    vin: v.vin,
    name: v.name,
    categoryName: localize(v.categoryName, 'sk'),
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
  const locations: BookingLocation[] = catalog.locations.map((l) => ({ id: l.id, name: localize(l.name, 'sk'), address: l.address, surchargeCents: l.surchargeCents, forPickup: l.forPickup, forReturn: l.forReturn, isDefault: l.isDefault }))
  const { settings } = catalog
  const defaultLocation = (locations.find((l) => l.isDefault) ?? locations[0])?.id ?? ''
  const config = { vatRate: settings.vat_rate, toleranceMinutes: settings.return_tolerance_minutes, individualFromDays: settings.individual_price_from_days, paymentMethods: settings.payment_methods }
  const blank: StaffBookingValues = {
    vin: '',
    pickupDate: '',
    pickupTime: '10:00',
    returnDate: '',
    returnTime: '10:00',
    pickupLocationId: defaultLocation,
    returnLocationId: defaultLocation,
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
    email: '',
    phonePrefix: PHONE_PREFIXES[0].dial,
    phoneNumber: '',
    dateOfBirth: '',
    isCompany: false,
    companyName: '',
    ico: '',
    dic: '',
    icDph: '',
    street: '',
    city: '',
    zip: '',
    country: 'SK',
    extras: {},
    rentalPaymentMethod: settings.payment_methods[0] ?? 'transfer',
    depositPaymentMethod: settings.payment_methods[0] ?? 'transfer',
    note: '',
    priceMode: 'auto',
    customPrice: '',
    priceReason: '',
    locale: 'sk',
  }
  return { vehicles, locations, config, blank }
}

/** Splits "+421900123456" into the dial code and the national number. */
export function splitPhone(phone: string | null | undefined): { phonePrefix: string; phoneNumber: string } | null {
  if (!phone) return null
  const prefix = [...PHONE_PREFIXES].sort((a, b) => b.dial.length - a.dial.length).find((p) => phone.startsWith(p.dial))
  return prefix ? { phonePrefix: prefix.dial, phoneNumber: phone.slice(prefix.dial.length) } : null
}
