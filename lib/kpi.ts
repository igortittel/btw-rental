export type KpiBooking = { pickup_at: string; return_at: string; total_cents: number | null }

/**
 * Key figures for a period [from, to): bookings that start in it, their revenue, and
 * the share of vehicle-time that is rented out (bookings overlapping the period are
 * counted only for the part inside it).
 */
export function computeKpi(bookings: KpiBooking[], from: Date, to: Date, vehicleCount: number) {
  const start = from.getTime()
  const end = to.getTime()
  let count = 0
  let revenueCents = 0
  let rentedMs = 0
  for (const booking of bookings) {
    const a = Date.parse(booking.pickup_at)
    const b = Date.parse(booking.return_at)
    if (a >= start && a < end) {
      count += 1
      revenueCents += booking.total_cents ?? 0
    }
    rentedMs += Math.max(0, Math.min(b, end) - Math.max(a, start))
  }
  const capacityMs = vehicleCount * (end - start)
  return { count, revenueCents, utilization: capacityMs > 0 ? Math.min(1, rentedMs / capacityMs) : 0 }
}
