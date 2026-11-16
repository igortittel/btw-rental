import type { PaymentMethod } from '@/lib/booking/schema'
import type { PricingExtra, PricingTier } from '@/lib/pricing'

// Public data handed from the server page to the client form. Nothing internal.
export type BookingVehicle = {
  vin: string
  name: string
  categoryName: string
  imageUrl: string | null
  prices: PricingTier[]
  extras: PricingExtra[]
  priceFromCents: number | null
  depositCents: number
  kmLimitPerDay: number
  extraKmCents: number
  minDriverAge: number
  minLicenseMonths: number
}

export type BookingLocation = { id: string; name: string; address: string; surchargeCents: number; forPickup: boolean; forReturn: boolean; isDefault: boolean }

export type BookingConfig = {
  vatRate: number
  minLeadHours: number
  minRentalDays: number
  toleranceMinutes: number
  individualFromDays: number
  paymentMethods: PaymentMethod[]
  cancellationTiers: { min_hours: number; fee_percent: number }[]
  termsUrl: string
  gdprUrl: string
  turnstileSiteKey: string | null
  /** Email of the signed-in customer; the booking goes to this account. */
  lockedEmail: string | null
}
