export const TIME_ZONE = 'Europe/Bratislava'

// Creating an Intl.DateTimeFormat is expensive (tens of µs to ms on a phone); the availability
// calendar converts hundreds of dates per render, so one formatter per time zone is reused.
const offsetFormatters = new Map<string, Intl.DateTimeFormat>()

function offsetFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = offsetFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    offsetFormatters.set(timeZone, formatter)
  }
  return formatter
}

function offsetMinutes(utc: Date, timeZone: string): number {
  const parts = offsetFormatter(timeZone).formatToParts(utc)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - utc.getTime()) / 60000)
}

/**
 * Interprets "YYYY-MM-DDTHH:mm" (the value of <input type="datetime-local">) as wall
 * time in Europe/Bratislava and returns the instant. Returns null for malformed input.
 * In the autumn DST overlap the earlier (summer-time) instant is used; a wall time
 * skipped in spring resolves to the instant one hour later.
 */
export function zonedLocalToUtc(local: string, timeZone: string = TIME_ZONE): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local)
  if (!m) return null
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))
  if (Number.isNaN(guess)) return null
  // Offsets in force a day before and after cover both sides of any DST change.
  // A candidate is valid when its own offset maps it back to the requested wall time.
  const day = 24 * 3600_000
  const candidates = [guess - day, guess, guess + day].map((t) => guess - offsetMinutes(new Date(t), timeZone) * 60000)
  const valid = candidates.filter((c) => c + offsetMinutes(new Date(c), timeZone) * 60000 === guess)
  return new Date(valid.length > 0 ? Math.min(...valid) : Math.max(...candidates))
}

/** Local date (YYYY-MM-DD, Europe/Bratislava) `hours` from now – earliest pickup day for a lead time. */
export function localDateInHours(hours: number): string {
  return utcToZonedLocal(new Date(Date.now() + hours * 3600_000)).slice(0, 10)
}

/** Instant -> "YYYY-MM-DDTHH:mm" wall time in Europe/Bratislava (for datetime-local inputs). */
export function utcToZonedLocal(value: string | Date, timeZone: string = TIME_ZONE): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const shifted = new Date(date.getTime() + offsetMinutes(date, timeZone) * 60000)
  return shifted.toISOString().slice(0, 16)
}

const displayFormatters = new Map<string, Intl.DateTimeFormat>()

/** Reused formatter for displaying dates in Europe/Bratislava (lists format hundreds of dates). */
function displayFormatter(locale: string, withTime: boolean): Intl.DateTimeFormat {
  const key = `${locale === 'en' ? 'en' : 'sk'}:${withTime ? 'dt' : 'd'}`
  let formatter = displayFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'sk-SK', {
      timeZone: TIME_ZONE,
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    })
    displayFormatters.set(key, formatter)
  }
  return formatter
}

export function formatDateTime(value: string | Date, locale = 'sk'): string {
  return displayFormatter(locale, true).format(typeof value === 'string' ? new Date(value) : value)
}

export function formatDate(value: string | Date, locale = 'sk'): string {
  return displayFormatter(locale, false).format(typeof value === 'string' ? new Date(value) : value)
}
