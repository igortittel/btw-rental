export type CancellationTier = { min_hours: number; fee_percent: number }

export type CancellationQuote = {
  /** Whole hours left until pick-up (negative after it). */
  hoursBeforePickup: number
  feePercent: number
  feeCents: number
}

/**
 * Cancellation fee from the tiers in settings (default: more than 72 h → 0 %,
 * 72–24 h → 20 %, less than 24 h → 100 %). A tier applies when MORE than `min_hours`
 * remain; exactly 72 h therefore already falls into the 72–24 h band.
 * A booking without a price (individual price not set yet) is cancelled free of charge.
 */
export function cancellationQuote(pickupAt: Date, totalCents: number | null, tiers: CancellationTier[], now: Date = new Date()): CancellationQuote {
  const hours = (pickupAt.getTime() - now.getTime()) / 3600_000
  const sorted = [...tiers].sort((a, b) => b.min_hours - a.min_hours)
  const tier = sorted.find((t) => hours > t.min_hours) ?? sorted[sorted.length - 1]
  const feePercent = totalCents === null || !tier ? 0 : tier.fee_percent
  return {
    hoursBeforePickup: Math.floor(hours),
    feePercent,
    feeCents: totalCents === null ? 0 : Math.round((totalCents * feePercent) / 100),
  }
}
