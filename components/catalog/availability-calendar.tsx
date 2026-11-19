'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { zonedLocalToUtc } from '@/lib/time'

type Range = { start: number; end: number }
type DayState = 'free' | 'booked' | 'partial' | 'past'
export type DateRange = { from: string; to: string }

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`
const shift = (year: number, month: number, delta: number) => {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}
const dayStart = (date: string) => zonedLocalToUtc(`${date}T00:00`)!.getTime()
const nextDate = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

function currentMonth() {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit' }).format(new Date()).split('-')
  return { year: +year, month: +month }
}

/** Milliseconds of [start, end) covered by the given ranges. */
function coveredMs(ranges: Range[], start: number, end: number): number {
  const parts = ranges
    .map((r) => [Math.max(r.start, start), Math.min(r.end, end)] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0])
  let total = 0
  let cursor = start
  for (const [a, b] of parts) {
    if (b <= cursor) continue
    total += b - Math.max(a, cursor)
    cursor = b
  }
  return total
}

const STATE_CLASS: Record<DayState, string> = {
  free: 'border border-line text-white',
  booked: 'bg-[#2a2a2a] text-[#8c8c8c] line-through',
  partial: 'border border-line bg-[linear-gradient(135deg,transparent_50%,#2a2a2a_50%)] text-white',
  past: 'text-[#666666]',
}

type Props = {
  vin: string
  /** Makes days clickable: first click = pick-up day, second = return day. */
  value?: DateRange | null
  onChange?: (range: DateRange | null) => void
  /** Earliest selectable day (YYYY-MM-DD), e.g. today + minimum lead time. */
  minDate?: string
}

/**
 * Two-month availability calendar; days are evaluated in Europe/Bratislava.
 * With `onChange` it doubles as a date-range picker: fully booked days cannot be
 * chosen and a range cannot span one.
 */
export function AvailabilityCalendar({ vin, value = null, onChange, minDate }: Props) {
  const t = useTranslations('vehicle')
  const locale = useLocale()
  const [today] = useState(currentMonth)
  const [view, setView] = useState(today)
  const [ranges, setRanges] = useState<Range[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [start, setStart] = useState<string | null>(null) // first click, waiting for the second
  const [hover, setHover] = useState<string | null>(null)
  const second = shift(view.year, view.month, 1)
  const after = shift(view.year, view.month, 2)
  const selectable = !!onChange

  useEffect(() => {
    const controller = new AbortController()
    const from = new Date(dayStart(iso(view.year, view.month, 1))).toISOString()
    const next = shift(view.year, view.month, 2)
    const to = new Date(dayStart(iso(next.year, next.month, 1))).toISOString()
    fetch(`/api/availability?vin=${encodeURIComponent(vin)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { ranges: { start: string; end: string }[] }) => {
        setRanges(data.ranges.map((r) => ({ start: Date.parse(r.start), end: Date.parse(r.end) })))
        setFailed(false)
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setFailed(true)
      })
    return () => controller.abort()
  }, [vin, view.year, view.month])

  // Days before now are shown as past; re-evaluated on every render on purpose.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const stateOf = (date: string): DayState => {
    const from = dayStart(date)
    const to = dayStart(nextDate(date))
    if (to <= now) return 'past'
    if (!ranges) return 'free'
    const booked = coveredMs(ranges, from, to)
    return booked >= to - from - 60_000 ? 'booked' : booked > 0 ? 'partial' : 'free'
  }
  const canPick = (date: string) => {
    const state = stateOf(date)
    return state !== 'past' && state !== 'booked' && (!minDate || date >= minDate)
  }
  /** A range is allowed when no fully booked day lies inside it. */
  const rangeFree = (from: string, to: string) => {
    for (let date = from; date <= to; date = nextDate(date)) if (stateOf(date) === 'booked') return false
    return true
  }

  const click = (date: string) => {
    if (!onChange || !canPick(date)) return
    if (start && date > start && rangeFree(start, date)) {
      onChange({ from: start, to: date })
      setStart(null)
    } else {
      setStart(date)
      onChange(null)
    }
    setHover(null)
  }

  // What to highlight: a finished selection, or the pending start with the hovered end.
  const shownFrom = start ?? value?.from ?? null
  const shownTo = start ? (hover && hover > start && rangeFree(start, hover) ? hover : null) : (value?.to ?? null)

  const canGoBack = view.year * 12 + view.month > today.year * 12 + today.month
  const monthName = (year: number, month: number) =>
    new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'sk-SK', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)))
  const weekdays = t.raw('weekdays') as string[]

  const renderMonth = ({ year, month }: { year: number; month: number }) => {
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
    return (
      <div key={`${year}-${month}`}>
        <p className="mb-3 text-center font-semibold capitalize text-white">{monthName(year, month)}</p>
        <div className="grid grid-cols-7 gap-1 text-center text-sm">
          {weekdays.map((d) => (
            <div key={d} className="py-1 text-xs text-muted2" aria-hidden="true">
              {d}
            </div>
          ))}
          {Array.from({ length: offset }, (_, i) => (
            <div key={`o${i}`} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const day = i + 1
            const date = iso(year, month, day)
            const state = stateOf(date)
            const label = state === 'past' ? '' : t(state === 'free' ? 'legendFree' : state === 'booked' ? 'legendBooked' : 'legendPartial')
            const isEdge = date === shownFrom || date === shownTo
            const inRange = !!shownFrom && !!shownTo && date > shownFrom && date < shownTo
            const base = `flex aspect-square w-full items-center justify-center rounded-md ${isEdge ? 'bg-gold font-bold text-white' : inRange ? 'border border-gold/60 bg-gold/20 text-white' : STATE_CLASS[state]}`
            if (!selectable) {
              return (
                <div key={day} className={base}>
                  <span aria-hidden="true">{day}</span>
                  <span className="sr-only">
                    {day}. {label}
                  </span>
                </div>
              )
            }
            const enabled = canPick(date)
            return (
              <button
                key={day}
                type="button"
                disabled={!enabled}
                aria-pressed={isEdge || inRange}
                aria-label={`${day}. ${monthName(year, month)}${label ? ` – ${label}` : ''}`}
                onClick={() => click(date)}
                onMouseEnter={() => start && setHover(date)}
                onFocus={() => start && setHover(date)}
                className={`${base} ${enabled ? 'cursor-pointer transition-colors hover:border-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold' : 'cursor-not-allowed'} ${enabled || state !== 'free' ? '' : 'opacity-40'}`}
              >
                {day}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const navButton = 'flex h-11 w-11 items-center justify-center rounded-lg border border-line text-white transition-colors hover:border-gold disabled:opacity-30 disabled:hover:border-line'

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <button type="button" className={navButton} onClick={() => setView(shift(view.year, view.month, -1))} disabled={!canGoBack} aria-label={t('prevMonth')}>
          ←
        </button>
        {selectable ? (
          <p className="text-center text-sm text-muted2" aria-live="polite">
            {start ? t('pickReturn') : value ? '' : t('pickPickup')}
          </p>
        ) : null}
        <button type="button" className={navButton} onClick={() => setView(shift(view.year, view.month, 1))} disabled={after.year * 12 + after.month > today.year * 12 + today.month + 18} aria-label={t('nextMonth')}>
          →
        </button>
      </div>
      <div className={`grid gap-8 md:grid-cols-2 ${ranges ? '' : 'opacity-60'}`} aria-busy={!ranges}>
        {renderMonth(view)}
        {renderMonth(second)}
      </div>
      {failed ? (
        <p role="alert" className="mt-4 text-sm text-red-300">
          {t('calendarError')}
        </p>
      ) : null}
      <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted2">
        <li className="flex items-center gap-2">
          <span className="h-5 w-5 rounded border border-line" /> {t('legendFree')}
        </li>
        <li className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-[#2a2a2a] text-xs text-[#8c8c8c] line-through">1</span> {t('legendBooked')}
        </li>
        <li className="flex items-center gap-2">
          <span className="h-5 w-5 rounded border border-line bg-[linear-gradient(135deg,transparent_50%,#2a2a2a_50%)]" /> {t('legendPartial')}
        </li>
        {selectable ? (
          <li className="flex items-center gap-2">
            <span className="h-5 w-5 rounded bg-gold" /> {t('legendSelected')}
          </li>
        ) : null}
      </ul>
    </div>
  )
}
