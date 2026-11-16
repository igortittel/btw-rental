'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { zonedLocalToUtc } from '@/lib/time'

type Range = { start: number; end: number; kind: 'booked' | 'pending' }
type DayState = 'free' | 'booked' | 'partial' | 'pending' | 'past'

const pad = (n: number) => String(n).padStart(2, '0')
const shift = (year: number, month: number, delta: number) => {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}
const monthStart = (year: number, month: number) => zonedLocalToUtc(`${year}-${pad(month)}-01T00:00`)!.getTime()

function currentMonth() {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit' }).format(new Date()).split('-')
  return { year: +year, month: +month }
}

/** Minutes of [start, end) covered by the given ranges. */
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
  pending: 'border border-dashed border-gold text-white',
  past: 'text-[#666666]',
}

/** Two-month availability calendar. Days are evaluated in Europe/Bratislava. */
export function AvailabilityCalendar({ vin }: { vin: string }) {
  const t = useTranslations('vehicle')
  const locale = useLocale()
  const today = useMemo(currentMonth, [])
  const [view, setView] = useState(today)
  const [ranges, setRanges] = useState<Range[] | null>(null)
  const [failed, setFailed] = useState(false)
  const second = shift(view.year, view.month, 1)
  const after = shift(view.year, view.month, 2)

  useEffect(() => {
    const controller = new AbortController()
    const from = new Date(monthStart(view.year, view.month)).toISOString()
    const next = shift(view.year, view.month, 2)
    const to = new Date(monthStart(next.year, next.month)).toISOString()
    fetch(`/api/availability?vin=${encodeURIComponent(vin)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { ranges: { start: string; end: string; kind: Range['kind'] }[] }) => {
        setRanges(data.ranges.map((r) => ({ start: Date.parse(r.start), end: Date.parse(r.end), kind: r.kind })))
        setFailed(false)
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setFailed(true)
      })
    return () => controller.abort()
  }, [vin, view.year, view.month])

  const now = Date.now()
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
            const start = zonedLocalToUtc(`${year}-${pad(month)}-${pad(day)}T00:00`)!.getTime()
            const nextDay = day === days ? shift(year, month, 1) : { year, month }
            const end = zonedLocalToUtc(`${nextDay.year}-${pad(nextDay.month)}-${pad(day === days ? 1 : day + 1)}T00:00`)!.getTime()
            let state: DayState = 'free'
            if (end <= now) state = 'past'
            else if (ranges) {
              const booked = coveredMs(ranges.filter((r) => r.kind === 'booked'), start, end)
              if (booked >= end - start - 60_000) state = 'booked'
              else if (booked > 0) state = 'partial'
              else if (ranges.some((r) => r.kind === 'pending' && r.start < end && r.end > start)) state = 'pending'
            }
            const label = state === 'past' ? '' : t(state === 'free' ? 'legendFree' : state === 'booked' ? 'legendBooked' : state === 'partial' ? 'legendPartial' : 'legendPending')
            return (
              <div key={day} className={`flex aspect-square items-center justify-center rounded-md ${STATE_CLASS[state]}`}>
                <span aria-hidden="true">{day}</span>
                <span className="sr-only">
                  {day}. {label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const navButton = 'flex h-11 w-11 items-center justify-center rounded-lg border border-line text-white transition-colors hover:border-gold disabled:opacity-30 disabled:hover:border-line'

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button type="button" className={navButton} onClick={() => setView(shift(view.year, view.month, -1))} disabled={!canGoBack} aria-label={t('prevMonth')}>
          ←
        </button>
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
        <li className="flex items-center gap-2">
          <span className="h-5 w-5 rounded border border-dashed border-gold" /> {t('legendPending')}
        </li>
      </ul>
    </div>
  )
}
