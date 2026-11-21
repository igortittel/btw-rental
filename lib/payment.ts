import type { Database } from '@/types/database'
import { zonedLocalToUtc } from '@/lib/time'

/** Payment reference (variabilný symbol): the booking number itself ("20260001"); only digits, at most 10. */
export function variableSymbol(bookingNumber: string): string {
  return bookingNumber.replace(/\D/g, '').slice(0, 10)
}

/** IBAN in groups of four for reading aloud / retyping. */
export function formatIban(iban: string): string {
  return iban
    .replace(/\s/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim()
}

/**
 * Due date of a bank transfer: `dueDays` after confirmation, but never later than the
 * day before pick-up (and never in the past).
 */
export function paymentDueDate(confirmedAt: Date, pickupAt: Date, dueDays: number): Date {
  const byTerm = confirmedAt.getTime() + dueDays * 86_400_000
  const beforePickup = pickupAt.getTime() - 86_400_000
  return new Date(Math.max(confirmedAt.getTime(), Math.min(byTerm, beforePickup)))
}

export type PaymentKind = 'rental' | 'deposit'
export type UndoKind = PaymentKind | 'deposit_return' | 'rental_refund'
export const PAYMENT_KINDS: PaymentKind[] = ['rental', 'deposit']

type Enums = Database['public']['Enums']
export type RentalPaymentStatus = Enums['rental_payment_status']
export type DepositStatus = Enums['deposit_status']

export const RENTAL_PAYMENT_LABELS: Record<RentalPaymentStatus, string> = {
  unpaid: 'Neuhradené',
  paid: 'Uhradené',
  refunded: 'Vrátené',
  partially_refunded: 'Čiastočne vrátené',
}

export const DEPOSIT_STATUS_LABELS: Record<DepositStatus, string> = {
  pending: 'Neprijatý',
  received: 'Prijatý',
  returned: 'Vrátený',
  partially_returned: 'Čiastočne vrátený',
}

/** "YYYY-MM-DD" from a date input -> ISO instant at noon in Bratislava (a payment has a day, not a time). */
export function paymentDateToUtc(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return zonedLocalToUtc(`${date}T12:00`)?.toISOString() ?? null
}

export type PaymentState = {
  total_cents: number | null
  deposit_cents: number
  rental_payment_status: RentalPaymentStatus
  deposit_status: DepositStatus
  /** Amounts actually paid / received (the price can change after a payment). */
  rental_paid_cents?: number | null
  rental_refunded_cents?: number | null
  deposit_received_cents?: number | null
}

/** Paid minus refunded. An older record without an amount counts as the price it was paid at. */
function netRentalPaid(b: PaymentState): number {
  if (b.rental_payment_status === 'unpaid') return 0
  return (b.rental_paid_cents ?? b.total_cents ?? 0) - (b.rental_refunded_cents ?? 0)
}

/**
 * Still owed for the rental: the price minus what was paid. A booking whose price went up
 * after it was paid (approved customer change, staff edit) owes the difference – the same
 * rule as private.rental_outstanding_cents in the database.
 */
export function rentalOutstandingCents(b: PaymentState): number {
  return Math.max(0, (b.total_cents ?? 0) - netRentalPaid(b))
}

/** Paid more than the current price (the price went down): to be refunded. */
export function rentalOverpaidCents(b: PaymentState): number {
  if (b.total_cents === null) return 0
  return Math.max(0, netRentalPaid(b) - b.total_cents)
}

/** Deposit still to be received (also when the deposit was raised after it was received). */
export function depositOutstandingCents(b: PaymentState): number {
  if (b.deposit_status === 'returned' || b.deposit_status === 'partially_returned') return 0
  const received = b.deposit_status === 'pending' ? 0 : (b.deposit_received_cents ?? b.deposit_cents)
  return Math.max(0, b.deposit_cents - received)
}

/** Deposit received above the current deposit (it was lowered): part of the return. */
export function depositOverpaidCents(b: PaymentState): number {
  if (b.deposit_status !== 'received') return 0
  return Math.max(0, (b.deposit_received_cents ?? b.deposit_cents) - b.deposit_cents)
}

/**
 * What still has to be paid before the car is handed over (the same rule as
 * `sign_protocol` in the database): any amount outstanding on the rental or the deposit.
 */
export function missingPayments(b: PaymentState): PaymentKind[] {
  const missing: PaymentKind[] = []
  if (rentalOutstandingCents(b) > 0) missing.push('rental')
  if (depositOutstandingCents(b) > 0) missing.push('deposit')
  return missing
}

/** Amount still unpaid in cents (for the dashboard sum). */
export function unpaidCents(b: PaymentState): number {
  return rentalOutstandingCents(b) + depositOutstandingCents(b)
}

/**
 * Proposed deposit return: the deposit minus the approved settlement, never negative.
 * `dueCents` is what the customer owes beyond the deposit.
 */
export function depositReturnProposal(depositCents: number, settlementCents: number | null): { refundCents: number; dueCents: number } {
  const charged = settlementCents ?? 0
  return { refundCents: Math.max(0, depositCents - charged), dueCents: Math.max(0, charged - depositCents) }
}
