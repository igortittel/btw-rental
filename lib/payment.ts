import type { Database } from '@/types/database'
import { zonedLocalToUtc } from '@/lib/time'

/** Payment reference (variabilný symbol): the numeric part of the booking number, "BTW-2026-0001" -> "20260001". */
export function variableSymbol(bookingNumber: string): string {
  return bookingNumber.replace(/\D/g, '').slice(0, 10)
}

/** IBAN in groups of four for reading aloud / retyping. */
export function formatIban(iban: string): string {
  return iban.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim()
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
}

/**
 * What still has to be paid before the car is handed over (the same rule as
 * `sign_protocol` in the database): the rental unless it has no price yet or is free,
 * and the deposit unless it is zero.
 */
export function missingPayments(b: PaymentState): PaymentKind[] {
  const missing: PaymentKind[] = []
  if (b.total_cents !== null && b.total_cents > 0 && b.rental_payment_status === 'unpaid') missing.push('rental')
  if (b.deposit_cents > 0 && b.deposit_status === 'pending') missing.push('deposit')
  return missing
}

/** Amount still unpaid in cents (for the dashboard sum). */
export function unpaidCents(b: PaymentState): number {
  return missingPayments(b).reduce((sum, kind) => sum + (kind === 'rental' ? (b.total_cents ?? 0) : b.deposit_cents), 0)
}

/**
 * Proposed deposit return: the deposit minus the approved settlement, never negative.
 * `dueCents` is what the customer owes beyond the deposit.
 */
export function depositReturnProposal(depositCents: number, settlementCents: number | null): { refundCents: number; dueCents: number } {
  const charged = settlementCents ?? 0
  return { refundCents: Math.max(0, depositCents - charged), dueCents: Math.max(0, charged - depositCents) }
}
