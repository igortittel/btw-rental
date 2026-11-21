import 'server-only'
import { buildBookingEmailData } from '@/lib/booking/email-data'
import { calculatePrice } from '@/lib/pricing'
import { DEFAULT_SETTINGS } from '@/lib/settings'
import { zonedLocalToUtc } from '@/lib/time'

/** Made-up booking used for the email previews in the admin. */
export function sampleBookingEmailData(locale: 'sk' | 'en', individual = false) {
  const pickupAt = zonedLocalToUtc('2027-06-14T10:00')!
  const returnAt = zonedLocalToUtc(individual ? '2027-07-29T10:00' : '2027-06-19T10:00')!
  const price = calculatePrice({
    pickupAt,
    returnAt,
    tiers: [
      { minDays: 1, maxDays: 30, pricePerDayCents: 7900 },
      { minDays: 31, maxDays: null, pricePerDayCents: null },
    ],
    extras: [
      { extra: { id: 'a', name: { sk: 'Autosedačka', en: 'Child seat' }, priceCents: 400, pricingType: 'per_day', maxQuantity: 4, maxChargeCents: null }, quantity: 2 },
      { extra: { id: 'b', name: { sk: 'Druhý šofér', en: 'Additional driver' }, priceCents: 500, pricingType: 'per_day', maxQuantity: 1, maxChargeCents: null }, quantity: 1 },
    ],
    pickupSurchargeCents: 0,
    returnSurchargeCents: 0,
    vatRate: 23,
    toleranceMinutes: 59,
    individualFromDays: 31,
  })
  const location = { name: { sk: 'Bratislava – Trenčianska 56/A', en: 'Bratislava – Trenčianska 56/A' }, address: 'Trenčianska 56/A, 821 09 Bratislava' }
  return buildBookingEmailData(
    {
      locale,
      number: '20270042',
      price,
      customer: { firstName: 'Anna', lastName: 'Nováková', email: 'anna.novakova@example.com', phone: '+421900123456', companyName: null },
      vehicleName: 'Mercedes-Benz E 220 d',
      pickupAt,
      returnAt,
      pickupLocation: location,
      returnLocation: location,
      depositCents: 100000,
      kmLimitPerDay: 300,
      extraKmCents: 62,
      rentalPaymentMethod: 'transfer',
      depositPaymentMethod: 'cash',
      note: locale === 'en' ? 'Arriving on flight OS 571.' : 'Priletím letom OS 571.',
      abroadTrip: true,
      abroadCountries: locale === 'en' ? 'Austria, Croatia' : 'Rakúsko, Chorvátsko',
      company: DEFAULT_SETTINGS.company,
    },
    locale,
  )
}
