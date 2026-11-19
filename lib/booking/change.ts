import { formatEuro } from '@/lib/format'
import { formatDateTime } from '@/lib/time'

type Localized = { sk?: string; en?: string }
export type ChangeRow = { label: string; before: string; after: string }

/** The part of a booking a customer may change, in the shape stored in the row and in pending_change.booking. */
export type ChangeableBooking = {
  pickup_at: string
  return_at: string
  pickup_custom_address?: string | null
  return_custom_address?: string | null
  customer_note?: string | null
  total_cents: number | null
  days: number
  abroad_trip?: boolean
  abroad_countries?: string | null
  price_snapshot?: unknown
}
type Extra = { name_snapshot: unknown; quantity: number }

const LABELS = {
  sk: {
    pickup: 'Vyzdvihnutie',
    ret: 'Odovzdanie',
    pickupPlace: 'Miesto vyzdvihnutia',
    returnPlace: 'Miesto odovzdania',
    extras: 'Doplnky',
    note: 'Poznámka',
    abroad: 'Cesta do zahraničia',
    price: 'Cena s DPH',
    none: '—',
    yes: 'áno',
    no: 'nie',
    individual: 'individuálna',
    pcs: 'ks',
  },
  en: {
    pickup: 'Pick-up',
    ret: 'Return',
    pickupPlace: 'Pick-up location',
    returnPlace: 'Return location',
    extras: 'Extras',
    note: 'Note',
    abroad: 'Travel abroad',
    price: 'Price incl. VAT',
    none: '—',
    yes: 'yes',
    no: 'no',
    individual: 'individual',
    pcs: 'pcs',
  },
}

/** Rows that differ between the stored booking and a proposed change, formatted for display. */
export function describeBookingChange(before: ChangeableBooking, beforeExtras: Extra[], after: ChangeableBooking, afterExtras: Extra[], locale: 'sk' | 'en' = 'sk'): ChangeRow[] {
  const l = LABELS[locale]
  const pick = (name: unknown) => {
    const value = (name ?? {}) as Localized
    return (locale === 'en' ? value.en : value.sk) || value.sk || value.en || ''
  }
  const place = (booking: ChangeableBooking, kind: 'pickup' | 'return') => {
    const custom = kind === 'pickup' ? booking.pickup_custom_address : booking.return_custom_address
    if (custom) return custom
    const snapshot = (booking.price_snapshot ?? {}) as Record<string, { name?: Localized; address?: string } | undefined>
    const location = snapshot[`${kind}_location`]
    return location ? pick(location.name) || location.address || l.none : l.none
  }
  const extras = (list: Extra[]) =>
    list
      .map((extra) => `${pick(extra.name_snapshot)}${extra.quantity > 1 ? ` (${extra.quantity} ${l.pcs})` : ''}`)
      .sort()
      .join(', ') || l.none
  const abroad = (booking: ChangeableBooking) => (booking.abroad_trip ? booking.abroad_countries || l.yes : l.no)
  const price = (booking: ChangeableBooking) => (booking.total_cents === null ? l.individual : formatEuro(booking.total_cents, locale))

  const rows: ChangeRow[] = [
    { label: l.pickup, before: formatDateTime(before.pickup_at, locale), after: formatDateTime(after.pickup_at, locale) },
    { label: l.ret, before: formatDateTime(before.return_at, locale), after: formatDateTime(after.return_at, locale) },
    { label: l.pickupPlace, before: place(before, 'pickup'), after: place(after, 'pickup') },
    { label: l.returnPlace, before: place(before, 'return'), after: place(after, 'return') },
    { label: l.extras, before: extras(beforeExtras), after: extras(afterExtras) },
    { label: l.abroad, before: abroad(before), after: abroad(after) },
    { label: l.note, before: before.customer_note || l.none, after: after.customer_note || l.none },
    { label: l.price, before: price(before), after: price(after) },
  ]
  return rows.filter((row) => row.before !== row.after)
}

/** Latest moment (ms) at which the customer may still change the booking online. */
export function modificationDeadline(pickupAt: Date, deadlineHours: number): Date {
  return new Date(pickupAt.getTime() - deadlineHours * 3600_000)
}

export type CustomerEditBlock = 'status' | 'deadline' | 'manual_price' | null

/**
 * May the customer change this booking online? Only new and confirmed bookings, only
 * until the deadline, and not when the price was agreed individually (then staff must
 * recalculate it by hand).
 */
export function customerEditBlock(
  booking: { status: string; pickup_at: string; total_cents: number | null; price_override_reason: string | null },
  deadlineHours: number,
  now: Date = new Date(),
): CustomerEditBlock {
  if (booking.status !== 'new' && booking.status !== 'confirmed') return 'status'
  if (now > modificationDeadline(new Date(booking.pickup_at), deadlineHours)) return 'deadline'
  if (booking.total_cents === null || booking.price_override_reason) return 'manual_price'
  return null
}
