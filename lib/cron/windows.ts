import { utcToZonedLocal, zonedLocalToUtc } from '@/lib/time'

/** Local date (YYYY-MM-DD, Europe/Bratislava) `offset` days from `now`. */
export function localDate(now: Date, offset = 0): string {
  const today = utcToZonedLocal(now).slice(0, 10)
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

/** Start of a local day (midnight in Bratislava) as an instant. */
export function startOfLocalDay(date: string): Date {
  return zonedLocalToUtc(`${date}T00:00`)!
}

/**
 * Time windows of one daily run (the cron runs early in the morning):
 * - reminders (emails 7 and 9) for anything from now until the end of tomorrow – the day
 *   before, plus same-day bookings that were made after yesterday's run;
 * - the review request (email 12) for rentals whose return day is at least `reviewDays`
 *   days ago, at most 30 days back (so the first run does not write to old customers).
 */
export function dailyWindows(now: Date, reviewDays: number) {
  return {
    remindFrom: now,
    remindUntil: startOfLocalDay(localDate(now, 2)),
    /** A return reminder is sent only when the car was already picked up before tomorrow. */
    pickedUpBefore: startOfLocalDay(localDate(now, 1)),
    reviewReturnedBefore: startOfLocalDay(localDate(now, 1 - reviewDays)),
    reviewReturnedAfter: startOfLocalDay(localDate(now, -30)),
  }
}
