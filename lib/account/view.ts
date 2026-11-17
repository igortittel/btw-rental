import type { BookingStatus } from '@/lib/booking-status'

/** Badge colours of a booking status in the customer area. */
export const CUSTOMER_STATUS_CLASS: Record<BookingStatus, string> = {
  new: 'border-gold bg-gold/15 text-white',
  confirmed: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200',
  modified: 'border-amber-400/60 bg-amber-400/10 text-amber-100',
  active: 'border-sky-400/60 bg-sky-400/10 text-sky-100',
  completed: 'border-line bg-white/5 text-muted2',
  cancelled: 'border-red-400/50 bg-red-500/10 text-red-200',
}

/** Bookings that are still ahead or running, as opposed to history. */
export function isCurrentBooking(status: BookingStatus): boolean {
  return status === 'new' || status === 'confirmed' || status === 'modified' || status === 'active'
}

export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}
