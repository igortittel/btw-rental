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
