import { loadBlacklist, matchBlacklist } from '@/lib/customers/blacklist'
import { missingPayments } from '@/lib/payment'
import type { Metadata } from 'next'
import Link from 'next/link'
import { BookingQuickActions } from '@/components/admin/booking-actions'
import { PageHeader } from '@/components/admin/section'
import { DateField, SELECT_CHEVRON_STYLE } from '@/components/ui/date-field'
import { requireStaff } from '@/lib/auth/session'
import { hasRole } from '@/lib/auth/roles'
import { BOOKING_STATUSES as STATUSES, bookingFilterParams, bookingListQuery, parseBookingFilters } from '@/lib/booking/list-query'
import { BOOKING_STATUS_LABELS, STATUS_BADGE_CLASS } from '@/lib/booking/status'
import { formatEuro } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/time'

export const metadata: Metadata = { title: 'Rezervácie' }

type Snapshot = { first_name?: string; last_name?: string; email?: string; phone?: string; company_name?: string | null }
type Props = { searchParams: Promise<Record<string, string | undefined>> }

const control = 'h-11 w-full rounded-lg border border-line bg-[#141414] px-3 text-sm text-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40'

// Built for a phone: status tabs, search, filters by vehicle and date, one-tap status changes.
export default async function BookingsPage({ searchParams }: Props) {
  const user = await requireStaff('operator', '/admin/rezervacie')
  const filters = parseBookingFilters(await searchParams)
  const { status, vehicleId, from, to, q } = filters

  const supabase = await createClient()
  const [{ data: bookings }, { data: vehicles }, { data: allStatuses }, blacklist] = await Promise.all([
    bookingListQuery(supabase, filters, 200),
    supabase.from('vehicles').select('id, name, license_plate').order('sort_order'),
    supabase.from('bookings').select('status'),
    loadBlacklist(supabase),
  ])
  const list = bookings ?? []
  const counts = (allStatuses ?? []).reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {})

  const href = (next: { stav?: string | null }) => {
    const qs = bookingFilterParams(filters, next).toString()
    return qs ? `/admin/rezervacie?${qs}` : '/admin/rezervacie'
  }
  const exportQuery = bookingFilterParams(filters).toString()
  const headerLink = 'inline-flex h-10 items-center rounded-lg border border-gold px-4 text-sm font-semibold text-white transition-colors hover:bg-gold/15'
  const tab = (active: boolean) => `inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors ${active ? 'bg-white text-black' : 'border border-line text-muted2 hover:border-gold hover:text-white'}`
  const filtered = !!(vehicleId || from || to || q)

  return (
    <div>
      <PageHeader
        title="Rezervácie"
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/rezervacie/kalendar" className={headerLink}>
              Kalendár
            </Link>
            <a href={`/admin/rezervacie/export${exportQuery ? `?${exportQuery}` : ''}`} className={headerLink}>
              Export CSV
            </a>
            {hasRole(user.role, 'manager') ? (
              <Link href="/admin/rezervacie/nova" className="inline-flex h-10 items-center rounded-lg bg-gold px-4 text-sm font-semibold text-white transition-colors hover:bg-gold-hover">
                + Nová rezervácia
              </Link>
            ) : null}
          </div>
        }
      />

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
          <span>Hľadať a filtrovať{filtered ? ' · aktívne' : ''}</span>
          <span className="text-gold transition-transform group-open:rotate-180" aria-hidden="true">
            ▾
          </span>
        </summary>
        <form method="get" action="/admin/rezervacie" className="grid grid-cols-2 gap-3 border-t border-line p-4 md:grid-cols-[2fr_1fr_1fr_auto]">
          {status ? <input type="hidden" name="stav" value={status} /> : null}
          <div className="col-span-2 min-w-0 md:col-span-4">
            <label htmlFor="f-q" className="mb-1.5 block text-xs font-medium text-muted2">
              Hľadať (číslo, meno, e-mail, telefón, firma)
            </label>
            <input id="f-q" name="q" type="search" defaultValue={q ?? ''} maxLength={80} className={control} />
          </div>
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
          const flagged = matchBlacklist(blacklist, { customerId: booking.customer_id, email: customer.email, phone: customer.phone }).length > 0
          const unpaid = ['confirmed', 'modified'].includes(booking.status) ? missingPayments(booking) : []
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
              {flagged || unpaid.length > 0 ? (
                <p className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                  {flagged ? <span className="rounded-full border border-red-400/60 bg-red-500/10 px-2.5 py-0.5 text-red-200">Blacklist</span> : null}
                  {unpaid.length > 0 ? <span className="rounded-full border border-amber-400/60 bg-amber-400/10 px-2.5 py-0.5 text-amber-100">Neuhradené: {unpaid.map((k) => (k === 'rental' ? 'prenájom' : 'depozit')).join(', ')}</span> : null}
                </p>
              ) : null}
              <div className="mt-auto pt-4">
                <BookingQuickActions id={booking.id} number={booking.number} status={booking.status} cancelHref={`/admin/rezervacie/${booking.id}#storno`} detailHref={`/admin/rezervacie/${booking.id}`} />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
