import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/admin/section'
import { requireStaff } from '@/lib/auth/session'
import { BOOKING_STATUS_LABELS, type BookingStatus } from '@/lib/booking/status'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime, utcToZonedLocal, zonedLocalToUtc } from '@/lib/time'

export const metadata: Metadata = { title: 'Kalendár rezervácií' }

type Props = { searchParams: Promise<{ od?: string }> }
type Snapshot = { last_name?: string }

const DAYS = 28
const DAY_PX = 48
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

const BAR_CLASS: Record<BookingStatus, string> = {
  new: 'border border-dashed border-gold bg-gold/10 text-white',
  confirmed: 'bg-emerald-600/80 text-white',
  modified: 'bg-amber-500/80 text-black',
  active: 'bg-sky-600/80 text-white',
  completed: 'bg-white/15 text-muted2',
  cancelled: 'hidden',
}
const BLOCK_LABELS: Record<string, string> = { service: 'Servis', stk: 'STK', private: 'Súkromné', other: 'Blokácia' }

/** Timeline: one row per vehicle, one column per day, bars coloured by status. Scrolls sideways on a phone. */
export default async function BookingCalendarPage({ searchParams }: Props) {
  await requireStaff('operator', '/admin/rezervacie/kalendar')
  const { od } = await searchParams
  const today = utcToZonedLocal(new Date()).slice(0, 10)
  const start = /^\d{4}-\d{2}-\d{2}$/.test(od ?? '') ? od! : addDays(today, -2)
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(start, i))
  const windowStart = zonedLocalToUtc(`${start}T00:00`)!.getTime()
  const windowEnd = zonedLocalToUtc(`${addDays(start, DAYS)}T00:00`)!.getTime()
  const span = windowEnd - windowStart

  const supabase = await createClient()
  const fromIso = new Date(windowStart).toISOString()
  const toIso = new Date(windowEnd).toISOString()
  const [{ data: vehicles }, { data: bookings }, { data: blocks }] = await Promise.all([
    supabase.from('vehicles').select('id, name, license_plate, is_active, for_rental').eq('for_rental', true).order('sort_order'),
    supabase.from('bookings').select('id, number, status, vehicle_id, pickup_at, return_at, customer_snapshot').neq('status', 'cancelled').lt('pickup_at', toIso).gt('return_at', fromIso),
    supabase.from('availability_blocks').select('id, vehicle_id, starts_at, ends_at, reason').lt('starts_at', toIso).gt('ends_at', fromIso),
  ])

  const position = (from: string, to: string) => {
    const a = Math.max(Date.parse(from), windowStart)
    const b = Math.min(Date.parse(to), windowEnd)
    return { left: `${((a - windowStart) / span) * 100}%`, width: `${Math.max(((b - a) / span) * 100, 0.6)}%` }
  }
  const weekday = (date: string) => new Intl.DateTimeFormat('sk-SK', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
  const nav = 'inline-flex h-10 items-center rounded-lg border border-line px-3 text-sm text-white hover:border-gold'
  const width = DAYS * DAY_PX

  return (
    <div>
      <PageHeader
        title="Kalendár rezervácií"
        back={{ href: '/admin/rezervacie', label: 'Rezervácie' }}
        action={
          <div className="flex gap-2">
            <Link href={`/admin/rezervacie/kalendar?od=${addDays(start, -14)}`} className={nav} aria-label="Predchádzajúce dva týždne">
              ←
            </Link>
            <Link href="/admin/rezervacie/kalendar" className={nav}>
              Dnes
            </Link>
            <Link href={`/admin/rezervacie/kalendar?od=${addDays(start, 14)}`} className={nav} aria-label="Nasledujúce dva týždne">
              →
            </Link>
          </div>
        }
      />

      <div className="overflow-x-auto rounded-xl border border-gold/40 bg-surface">
        <div style={{ minWidth: width + 150 }}>
          {/* Day header */}
          <div className="flex border-b border-line">
            <div className="sticky left-0 z-10 w-[150px] shrink-0 border-r border-line bg-surface" />
            <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${DAYS}, minmax(0, 1fr))` }}>
              {dates.map((date) => {
                const day = Number(date.slice(8))
                const weekend = [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())
                return (
                  <div key={date} className={`border-r border-line py-1.5 text-center text-xs ${date === today ? 'bg-gold/25 font-bold text-white' : weekend ? 'text-gold' : 'text-muted2'}`}>
                    <div>{weekday(date)}</div>
                    <div className="text-sm text-white">
                      {day}.{day === 1 || date === start ? `${Number(date.slice(5, 7))}.` : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {(vehicles ?? []).map((vehicle) => (
            <div key={vehicle.id} className="flex border-b border-line last:border-0">
              <div className="sticky left-0 z-10 w-[150px] shrink-0 border-r border-line bg-surface px-3 py-2">
                <Link href={`/admin/rezervacie?vozidlo=${vehicle.id}`} className={`block truncate text-sm font-semibold hover:underline ${vehicle.is_active ? 'text-white' : 'text-muted2'}`}>
                  {vehicle.name}
                </Link>
                <span className="text-xs text-muted2">{vehicle.license_plate}</span>
              </div>
              <div className="relative h-14 flex-1" style={{ backgroundImage: 'linear-gradient(to right, #333333 1px, transparent 1px)', backgroundSize: `${100 / DAYS}% 100%` }}>
                {(blocks ?? [])
                  .filter((block) => block.vehicle_id === vehicle.id)
                  .map((block) => (
                    <div
                      key={block.id}
                      className="absolute inset-y-2 overflow-hidden rounded-md border border-line bg-[repeating-linear-gradient(45deg,#2a2a2a,#2a2a2a_6px,#1a1a1a_6px,#1a1a1a_12px)] px-2 text-xs leading-10 text-muted2"
                      style={position(block.starts_at, block.ends_at)}
                      title={`${BLOCK_LABELS[block.reason] ?? 'Blokácia'}: ${formatDateTime(block.starts_at)} – ${formatDateTime(block.ends_at)}`}
                    >
                      {BLOCK_LABELS[block.reason] ?? 'Blokácia'}
                    </div>
                  ))}
                {(bookings ?? [])
                  .filter((booking) => booking.vehicle_id === vehicle.id)
                  .map((booking) => {
                    const customer = (booking.customer_snapshot ?? {}) as Snapshot
                    return (
                      <Link
                        key={booking.id}
                        href={`/admin/rezervacie/${booking.id}`}
                        className={`absolute inset-y-2 overflow-hidden whitespace-nowrap rounded-md px-2 text-xs font-semibold leading-10 hover:ring-2 hover:ring-white ${BAR_CLASS[booking.status]}`}
                        style={position(booking.pickup_at, booking.return_at)}
                        title={`${booking.number} · ${customer.last_name ?? ''} · ${BOOKING_STATUS_LABELS[booking.status]} · ${formatDateTime(booking.pickup_at)} – ${formatDateTime(booking.return_at)}`}
                      >
                        {customer.last_name || booking.number}
                      </Link>
                    )
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted2">
        {(['new', 'confirmed', 'modified', 'active', 'completed'] as const).map((status) => (
          <li key={status} className="flex items-center gap-2">
            <span className={`h-4 w-6 rounded ${BAR_CLASS[status]}`} /> {BOOKING_STATUS_LABELS[status]}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className="h-4 w-6 rounded border border-line bg-[repeating-linear-gradient(45deg,#2a2a2a,#2a2a2a_4px,#1a1a1a_4px,#1a1a1a_8px)]" /> Blokácia
        </li>
      </ul>
    </div>
  )
}
