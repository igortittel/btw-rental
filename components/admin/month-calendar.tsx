import { zonedLocalToUtc } from '@/lib/time'

export type CalendarRange = { start: string; end: string; kind: 'block' | 'booked' | 'pending' }

const KIND_CLASS: Record<CalendarRange['kind'], string> = {
  booked: 'bg-gold text-white',
  block: 'bg-zinc-600 text-white',
  pending: 'border border-dashed border-gold text-white',
}
const WEEKDAYS = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne']
const MONTHS = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december']

const pad = (n: number) => String(n).padStart(2, '0')

export function parseMonth(value: string | undefined, now = new Date()): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? '')
  if (m && +m[2] >= 1 && +m[2] <= 12) return { year: +m[1], month: +m[2] }
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit' }).format(now).split('-')
  return { year: +year, month: +month }
}

export function shiftMonth(year: number, month: number, delta: number): string {
  const index = year * 12 + (month - 1) + delta
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`
}

/** Read-only month view (days in Europe/Bratislava). A day is marked when any part of it is taken. */
export function MonthCalendar({ year, month, ranges, hrefFor }: { year: number; month: number; ranges: CalendarRange[]; hrefFor: (month: string) => string }) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7 // Monday = 0
  const parsed = ranges.map((r) => ({ kind: r.kind, start: new Date(r.start).getTime(), end: new Date(r.end).getTime() }))

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    const start = zonedLocalToUtc(`${year}-${pad(month)}-${pad(day)}T00:00`)!.getTime()
    const next = day === daysInMonth ? shiftMonth(year, month, 1) + '-01' : `${year}-${pad(month)}-${pad(day + 1)}`
    const end = zonedLocalToUtc(`${next}T00:00`)!.getTime()
    const hits = parsed.filter((r) => r.start < end && r.end > start)
    const kind = hits.find((r) => r.kind === 'booked')?.kind ?? hits.find((r) => r.kind === 'block')?.kind ?? hits[0]?.kind ?? null
    return { day, kind }
  })

  return (
    <div className="max-w-md">
      <div className="mb-3 flex items-center justify-between">
        <a href={hrefFor(shiftMonth(year, month, -1))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-white hover:border-gold" aria-label="Predchádzajúci mesiac">
          ←
        </a>
        <p className="font-semibold text-white">
          {MONTHS[month - 1]} {year}
        </p>
        <a href={hrefFor(shiftMonth(year, month, 1))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-white hover:border-gold" aria-label="Nasledujúci mesiac">
          →
        </a>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1 text-xs text-muted2">
            {d}
          </div>
        ))}
        {Array.from({ length: firstWeekday }, (_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {days.map(({ day, kind }) => (
          <div key={day} className={`flex aspect-square items-center justify-center rounded-md ${kind ? KIND_CLASS[kind] : 'bg-black text-muted2'}`}>
            {day}
          </div>
        ))}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted2">
        <li className="flex items-center gap-2">
          <span className="h-4 w-4 rounded bg-gold" /> rezervácia (vrátane prípravy)
        </li>
        <li className="flex items-center gap-2">
          <span className="h-4 w-4 rounded bg-zinc-600" /> blokácia
        </li>
        <li className="flex items-center gap-2">
          <span className="h-4 w-4 rounded border border-dashed border-gold" /> čaká na potvrdenie
        </li>
      </ul>
    </div>
  )
}
