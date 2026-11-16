import type { Metadata } from 'next'
import Link from 'next/link'
import { BookingQuickActions } from '@/components/admin/booking-actions'
import { PageHeader } from '@/components/admin/section'
import { DateField, SELECT_CHEVRON_STYLE } from '@/components/ui/date-field'
import { requireStaff } from '@/lib/auth/session'
import { BOOKING_STATUS_LABELS, STATUS_BADGE_CLASS, type BookingStatus } from '@/lib/booking/status'
import { formatEuro } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime, zonedLocalToUtc } from '@/lib/time'

export const metadata: Metadata = { title: 'Rezervácie' }

type Snapshot = { first_name?: string; last_name?: string; phone?: string; company_name?: string | null }
type Props = { searchParams: Promise<{ stav?: string; vozidlo?: string; od?: string; do?: string }> }

const STATUSES: BookingStatus[] = ['new', 'confirmed', 'modified', 'active', 'completed', 'cancelled']
const DATE = /^\d{4}-\d{2}-\d{2}$/
const control = 'h-11 w-full rounded-lg border border-line bg-[#141414] px-3 text-sm text-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40'

// Built for a phone: status tabs, filters by vehicle and date, one-tap status changes.
// Editing, timeline and manual bookings arrive in Phase 6.
export default async function BookingsPage({ searchParams }: Props) {
  await requireStaff('operator', '/admin/rezervacie')
  const query = await searchParams
  const status = STATUSES.includes(query.stav as BookingStatus) ? (query.stav as BookingStatus) : null
  const vehicleId = /^[0-9a-f-]{36}$/i.test(query.vozidlo ?? '') ? query.vozidlo! : null
  const from = DATE.test(query.od ?? '') ? query.od! : null
  const to = DATE.test(query.do ?? '') ? query.do! : null

  const supabase = await createClient()
  let request = supabase
    .from('bookings')
    .select('id, number, status, pickup_at, return_at, days, total_cents, pickup_custom_address, return_custom_address, outside:price_snapshot->delivery_outside_city, customer_snapshot, created_at, vehicles(name, license_plate)')
    .order('pickup_at', { ascending: true })
    .limit(200)
  if (status) request = request.eq('status', status)
  if (vehicleId) request = request.eq('vehicle_id', vehicleId)
  // The date filter matches bookings that overlap the chosen days.
  if (from) request = request.gte('return_at', zonedLocalToUtc(`${from}T00:00`)!.toISOString())
  if (to) request = request.lte('pickup_at', zonedLocalToUtc(`${to}T23:59`)!.toISOString())

  const [{ data: bookings }, { data: vehicles }, { data: allStatuses }] = await Promise.all([
    request,
    supabase.from('vehicles').select('id, name, license_plate').order('sort_order'),
    supabase.from('bookings').select('status'),
  ])
  const list = bookings ?? []
  const counts = (allStatuses ?? []).reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {})

  const href = (next: { stav?: string | null }) => {
    const params = new URLSearchParams()
    const stav = next.stav === undefined ? status : next.stav
    if (stav) params.set('stav', stav)
    if (vehicleId) params.set('vozidlo', vehicleId)
    if (from) params.set('od', from)
    if (to) params.set('do', to)
    const qs = params.toString()
    return qs ? `/admin/rezervacie?${qs}` : '/admin/rezervacie'
  }
  const tab = (active: boolean) => `inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors ${active ? 'bg-white text-black' : 'border border-line text-muted2 hover:border-gold hover:text-white'}`
  const filtered = !!(vehicleId || from || to)

  return (
    <div>
      <PageHeader title="Rezervácie" />

      <nav aria-label="Stav rezervácie" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
        <Link href={href({ stav: null })} className={tab(!status)} aria-current={!status ? 'page' : undefined}>
          Všetky
        </Link>
        {STATUSES.map((value) => (
          <Link key={value} href={href({ stav: value })} className={tab(status === value)} aria-current={status === value ? 'page' : undefined}>
            {BOOKING_STATUS_LABELS[value]}
            {counts[value] ? <span className={`rounded-full px-1.5 text-xs ${status === value ? 'bg-black/10' : value === 'new' ? 'bg-gold text-white' : 'bg-white/10'}`}>{counts[value]}</span> : null}
          </Link>
        ))}
      </nav>

      <details className="group mt-3 rounded-xl border border-line bg-surface" open={filtered}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold text-white [&::-webkit-details-marker]:hidden">
          <span>Filter: vozidlo a dátum{filtered ? ' · aktívny' : ''}</span>
          <span className="text-gold transition-transform group-open:rotate-180" aria-hidden="true">
            ▾
          </span>
        </summary>
        <form method="get" action="/admin/rezervacie" className="grid grid-cols-2 gap-3 border-t border-line p-4 md:grid-cols-[2fr_1fr_1fr_auto]">
          {status ? <input type="hidden" name="stav" value={status} /> : null}
          <div className="col-span-2 min-w-0 md:col-span-1">
            <label htmlFor="f-vehicle" className="mb-1.5 block text-xs font-medium text-muted2">
              Vozidlo
            </label>
            <select id="f-vehicle" name="vozidlo" defaultValue={vehicleId ?? ''} className={`${control} appearance-none pr-9`} style={SELECT_CHEVRON_STYLE}>
              <option value="">Všetky vozidlá</option>
              {(vehicles ?? []).map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.name}
                  {vehicle.license_plate ? ` · ${vehicle.license_plate}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor="f-from" className="mb-1.5 block text-xs font-medium text-muted2">
              Od
            </label>
            <DateField id="f-from" name="od" defaultValue={from ?? ''} className={control} />
          </div>
          <div className="min-w-0">
            <label htmlFor="f-to" className="mb-1.5 block text-xs font-medium text-muted2">
              Do
            </label>
            <DateField id="f-to" name="do" defaultValue={to ?? ''} className={control} />
          </div>
          <div className="col-span-2 flex items-end gap-2 md:col-span-1">
            <button type="submit" className="h-11 flex-1 rounded-lg bg-gold px-5 text-sm font-semibold text-white hover:bg-gold-hover">
              Filtrovať
            </button>
            {filtered ? (
              <Link href={status ? `/admin/rezervacie?stav=${status}` : '/admin/rezervacie'} className="inline-flex h-11 items-center rounded-lg border border-line px-4 text-sm text-white hover:border-gold">
                Zrušiť
              </Link>
            ) : null}
          </div>
        </form>
      </details>

      <p className="mt-4 text-sm text-muted2" aria-live="polite">
        {list.length === 0 ? 'Žiadna rezervácia nevyhovuje výberu.' : `Počet: ${list.length}`}
      </p>

      <ul className="mt-3 grid gap-4 lg:grid-cols-2">
        {list.map((booking) => {
          const customer = (booking.customer_snapshot ?? {}) as Snapshot
          const delivery = booking.pickup_custom_address || booking.return_custom_address
          return (
            <li key={booking.id} className="flex flex-col rounded-xl border border-gold/40 bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/admin/rezervacie/${booking.id}`} className="text-base font-bold text-white underline-offset-4 hover:underline">
                  {booking.number}
                </Link>
                <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[booking.status]}`}>{BOOKING_STATUS_LABELS[booking.status]}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-white">
                {booking.vehicles?.name}
                {booking.vehicles?.license_plate ? <span className="font-normal text-muted2"> · {booking.vehicles.license_plate}</span> : null}
              </p>
              <p className="mt-1 text-sm text-white">
                {formatDateTime(booking.pickup_at)} → {formatDateTime(booking.return_at)}
                <span className="text-muted2"> · {booking.days} d</span>
              </p>
              <p className="mt-2 text-sm text-white">
                {customer.first_name} {customer.last_name}
                {customer.company_name ? <span className="text-muted2"> · {customer.company_name}</span> : null}
                {customer.phone ? (
                  <>
                    {' · '}
                    <a href={`tel:${customer.phone}`} className="text-gold underline-offset-4 hover:underline">
                      {customer.phone}
                    </a>
                  </>
                ) : null}
              </p>
              <p className="mt-1 text-sm text-white">
                <strong>{booking.total_cents !== null ? formatEuro(booking.total_cents) : 'Individuálna cena – doplniť'}</strong>
                {delivery ? booking.outside === true ? <span className="text-amber-200"> · pristavenie mimo BA – kontaktovať</span> : <span className="text-muted2"> · pristavenie v BA</span> : null}
              </p>
              <div className="mt-auto pt-4">
                <BookingQuickActions id={booking.id} number={booking.number} status={booking.status} />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
