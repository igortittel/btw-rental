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
      : { label: l.rentalIndividual, amount: l.individual },
    ...price.extras.map((line) => ({
      label: `${pick(line.name, locale)}${line.quantity > 1 ? ` (${l.pieces(line.quantity)})` : ''}`,
      amount: euro(line.totalCents),
    })),
  ]
  if (price.pickupSurchargeCents > 0) lines.push({ label: `${l.pickupSurcharge} – ${pick(input.pickupLocation.name, locale)}`, amount: euro(price.pickupSurchargeCents) })
  if (price.returnSurchargeCents > 0) lines.push({ label: `${l.returnSurcharge} – ${pick(input.returnLocation.name, locale)}`, amount: euro(price.returnSurchargeCents) })

  return {
    locale,
    number: input.number,
    isIndividual: price.isIndividual,
    customer: input.customer,
    vehicleName: input.vehicleName,
    pickup: { at: formatDateTime(input.pickupAt, locale), place: pick(input.pickupLocation.name, locale), address: input.pickupLocation.address },
    return: { at: formatDateTime(input.returnAt, locale), place: pick(input.returnLocation.name, locale), address: input.returnLocation.address },
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
