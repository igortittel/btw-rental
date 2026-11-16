import type { EmailCompany } from './layout'

/** Everything the booking emails show, already formatted for the recipient's language. */
export type BookingEmailData = {
  locale: 'sk' | 'en'
  number: string
  isIndividual: boolean
  customer: { firstName: string; lastName: string; email: string; phone: string; companyName: string | null }
  vehicleName: string
  pickup: { at: string; place: string; address: string }
  return: { at: string; place: string; address: string }
  days: number
  /** Price lines in display order (rental, extras, location surcharges). */
  lines: { label: string; amount: string }[]
  /** A delivery fee (own address) will be added by staff; the total does not include it yet. */
  deliveryFeePending: boolean
  total: string | null
  net: string | null
  vat: string | null
  vatRate: number
  deposit: string
  rentalPayment: string
  depositPayment: string
  kmLimit: string
  note: string | null
  abroad: string | null
  company: EmailCompany
}
