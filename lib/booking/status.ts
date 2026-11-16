import type { Database } from '@/types/database'

export type { BookingStatus } from '@/lib/booking-status'
import type { BookingStatus } from '@/lib/booking-status'

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  new: 'Nová',
  confirmed: 'Potvrdená',
  modified: 'Upravená',
  active: 'Prebiehajúca',
  completed: 'Ukončená',
  cancelled: 'Zrušená',
}

export const PAYMENT_METHOD_LABELS: Record<Database['public']['Enums']['payment_method'], string> = {
  transfer: 'Bankový prevod',
  terminal: 'Platobný terminál',
  cash: 'Hotovosť',
}

/**
 * One-tap actions offered to staff for each status (a subset of the transitions the
 * database allows). Cancelling is separate: it needs a decision about the fee.
 */
export const NEXT_STATUSES: Record<BookingStatus, BookingStatus[]> = {
  new: ['confirmed'],
  confirmed: ['active'],
  modified: [], // approving / rejecting a customer's change has its own screen
  active: ['completed'],
  completed: [],
  cancelled: [],
}

export const STATUS_ACTION_LABELS: Partial<Record<BookingStatus, string>> = {
  confirmed: 'Potvrdiť',
  active: 'Vydať vozidlo',
  completed: 'Ukončiť',
  cancelled: 'Zrušiť',
}

export const STATUS_BADGE_CLASS: Record<BookingStatus, string> = {
  new: 'border-gold bg-gold/15 text-white',
  confirmed: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200',
  modified: 'border-amber-400/60 bg-amber-400/10 text-amber-100',
  active: 'border-sky-400/60 bg-sky-400/10 text-sky-100',
  completed: 'border-line bg-white/5 text-muted2',
  cancelled: 'border-red-400/50 bg-red-500/10 text-red-200',
}
