import type { BookingEmailData } from '@/emails/booking-types'
import type { PaymentMethod } from '@/lib/booking/schema'
import { formatEuro } from '@/lib/format'
import type { PriceBreakdown } from '@/lib/pricing'
import type { Settings } from '@/lib/settings'
import { formatDateTime } from '@/lib/time'

type Localized = { sk?: string; en?: string }
const pick = (value: Localized, locale: string) => (locale === 'en' ? value.en : value.sk) || value.sk || value.en || ''

const LABELS = {
  sk: {
    rental: (days: number, rate: string) => `Prenájom ${days} × ${rate}`,
    rentalIndividual: 'Prenájom',
    individual: 'individuálna cena',
    pieces: (n: number) => `${n} ks`,
    pickupSurcharge: 'Miesto vyzdvihnutia',
    returnSurcharge: 'Miesto odovzdania',
    payment: { transfer: 'bankový prevod', terminal: 'platobný terminál', cash: 'hotovosť' },
    kmLimit: (km: number, price: string) => `${km} km / deň, nad limit ${price} / km`,
    abroadYes: 'áno',
    ownAddress: 'Pristavenie na adresu',
    delivery: 'Pristavenie v Bratislave',
    deliveryFree: 'bezplatne',
    deliveryOutside: 'Pristavenie mimo Bratislavy',
    deliveryIndividual: 'dohodneme individuálne',
  },
  en: {
    rental: (days: number, rate: string) => `Rental ${days} × ${rate}`,
    rentalIndividual: 'Rental',
    individual: 'individual price',
    pieces: (n: number) => `${n} pcs`,
    pickupSurcharge: 'Pick-up location',
    returnSurcharge: 'Return location',
    payment: { transfer: 'bank transfer', terminal: 'card terminal', cash: 'cash' },
    kmLimit: (km: number, price: string) => `${km} km / day, ${price} per extra km`,
    abroadYes: 'yes',
    ownAddress: 'Delivery to address',
    delivery: 'Delivery within Bratislava',
    deliveryFree: 'free of charge',
    deliveryOutside: 'Delivery outside Bratislava',
    deliveryIndividual: 'to be agreed individually',
  },
}

export type BookingEmailInput = {
  locale: 'sk' | 'en'
  number: string
  price: PriceBreakdown
  customer: BookingEmailData['customer']
  vehicleName: string
  pickupAt: Date
  returnAt: Date
  pickupLocation: { name: Localized; address: string }
  returnLocation: { name: Localized; address: string }
  /** Customer's own delivery / collection address, if requested. */
  pickupAddress?: string | null
  returnAddress?: string | null
  /** An own address outside Bratislava: handled manually, staff contact the customer. */
  deliveryOutsideCity?: boolean
  depositCents: number
  kmLimitPerDay: number
  extraKmCents: number
  rentalPaymentMethod: PaymentMethod
  depositPaymentMethod: PaymentMethod
  note: string | null
  abroadTrip: boolean
  abroadCountries: string | null
  company: Settings['company']
}

/** Formats a booking for the emails in the given language. */
export function buildBookingEmailData(input: BookingEmailInput, locale: 'sk' | 'en' = input.locale): BookingEmailData {
  const l = LABELS[locale]
  const { price } = input
  const euro = (cents: number) => formatEuro(cents, locale)

  const lines: BookingEmailData['lines'] = [
    price.ratePerDayCents !== null && price.rentalCents !== null
      ? { label: l.rental(price.days, euro(price.ratePerDayCents)), amount: euro(price.rentalCents) }
      : price.rentalCents !== null && price.totalCents !== null
        ? { label: l.rentalIndividual, amount: euro(price.rentalCents) } // price set by staff
        : { label: l.rentalIndividual, amount: l.individual },
    ...price.extras.map((line) => ({
      label: `${pick(line.name, locale)}${line.quantity > 1 ? ` (${l.pieces(line.quantity)})` : ''}`,
      amount: euro(line.totalCents),
    })),
  ]
  const hasDelivery = !!(input.pickupAddress || input.returnAddress)
  const deliveryOutsideCity = hasDelivery && !!input.deliveryOutsideCity
  if (hasDelivery) lines.push(deliveryOutsideCity ? { label: l.deliveryOutside, amount: l.deliveryIndividual } : { label: l.delivery, amount: l.deliveryFree })
  if (price.pickupSurchargeCents > 0) lines.push({ label: `${l.pickupSurcharge} – ${pick(input.pickupLocation.name, locale)}`, amount: euro(price.pickupSurchargeCents) })
  if (price.returnSurchargeCents > 0) lines.push({ label: `${l.returnSurcharge} – ${pick(input.returnLocation.name, locale)}`, amount: euro(price.returnSurchargeCents) })

  return {
    locale,
    number: input.number,
    isIndividual: price.isIndividual,
    customer: input.customer,
    vehicleName: input.vehicleName,
    pickup: input.pickupAddress
      ? { at: formatDateTime(input.pickupAt, locale), place: l.ownAddress, address: input.pickupAddress }
      : { at: formatDateTime(input.pickupAt, locale), place: pick(input.pickupLocation.name, locale), address: input.pickupLocation.address },
    return: input.returnAddress
      ? { at: formatDateTime(input.returnAt, locale), place: l.ownAddress, address: input.returnAddress }
      : { at: formatDateTime(input.returnAt, locale), place: pick(input.returnLocation.name, locale), address: input.returnLocation.address },
    deliveryOutsideCity,
    days: price.days,
    lines,
    total: price.totalCents === null ? null : euro(price.totalCents),
    net: price.netCents === null ? null : euro(price.netCents),
    vat: price.vatCents === null ? null : euro(price.vatCents),
    vatRate: price.vatRate,
    deposit: euro(input.depositCents),
    rentalPayment: l.payment[input.rentalPaymentMethod],
    depositPayment: l.payment[input.depositPaymentMethod],
    kmLimit: l.kmLimit(input.kmLimitPerDay, euro(input.extraKmCents)),
    note: input.note,
    abroad: input.abroadTrip ? input.abroadCountries || l.abroadYes : null,
    company: { name: input.company.name, address: input.company.address, phone: input.company.phone, email: input.company.email },
  }
}

type BookingRow = {
  number: string
  locale: string
  pickup_at: string
  return_at: string
  days: number
  total_cents: number | null
  vat_rate: number | string
  deposit_cents: number
  km_limit_per_day: number
  extra_km_cents: number
  rental_payment_method: PaymentMethod
  deposit_payment_method: PaymentMethod
  customer_note: string | null
  abroad_trip: boolean
  abroad_countries: string | null
  pickup_custom_address: string | null
  return_custom_address: string | null
  customer_snapshot: unknown
  price_snapshot: unknown
}

/** The same email data built from a stored booking (confirmation, cancellation…), using its price snapshot. */
export function bookingEmailDataFromRow(row: BookingRow, vehicleName: string, company: Settings['company'], locale?: 'sk' | 'en'): BookingEmailData {
  const customer = (row.customer_snapshot ?? {}) as { first_name?: string; last_name?: string; email?: string; phone?: string; company_name?: string | null }
  const snapshot = (row.price_snapshot ?? {}) as Partial<PriceBreakdown> & {
    pickup_location?: { name: Localized; address: string }
    return_location?: { name: Localized; address: string }
    delivery_outside_city?: boolean
  }
  const vatRate = Number(row.vat_rate)
  const total = row.total_cents
  const net = total === null ? null : Math.round((total * 100) / (100 + vatRate))
  const price: PriceBreakdown = {
    days: row.days,
    isIndividual: total === null,
    tier: snapshot.tier ?? null,
    ratePerDayCents: snapshot.ratePerDayCents ?? null,
    rentalCents: total === null ? null : (snapshot.rentalCents ?? null),
    extras: snapshot.extras ?? [],
    extrasCents: snapshot.extrasCents ?? 0,
    pickupSurchargeCents: snapshot.pickupSurchargeCents ?? 0,
    returnSurchargeCents: snapshot.returnSurchargeCents ?? 0,
    totalCents: total,
    netCents: net,
    vatCents: total === null || net === null ? null : total - net,
    vatRate,
  }
  const fallback = { name: {}, address: '' }
  return buildBookingEmailData(
    {
      locale: row.locale === 'en' ? 'en' : 'sk',
      number: row.number,
      price,
      customer: { firstName: customer.first_name ?? '', lastName: customer.last_name ?? '', email: customer.email ?? '', phone: customer.phone ?? '', companyName: customer.company_name ?? null },
      vehicleName,
      pickupAt: new Date(row.pickup_at),
      returnAt: new Date(row.return_at),
      pickupLocation: snapshot.pickup_location ?? fallback,
      returnLocation: snapshot.return_location ?? fallback,
      pickupAddress: row.pickup_custom_address,
      returnAddress: row.return_custom_address,
      deliveryOutsideCity: !!snapshot.delivery_outside_city,
      depositCents: row.deposit_cents,
      kmLimitPerDay: row.km_limit_per_day,
      extraKmCents: row.extra_km_cents,
      rentalPaymentMethod: row.rental_payment_method,
      depositPaymentMethod: row.deposit_payment_method,
      note: row.customer_note,
      abroadTrip: row.abroad_trip,
      abroadCountries: row.abroad_countries,
      company,
    },
    locale ?? (row.locale === 'en' ? 'en' : 'sk'),
  )
}
