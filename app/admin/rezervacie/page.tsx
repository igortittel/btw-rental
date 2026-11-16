import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/admin/section'
import { requireStaff } from '@/lib/auth/session'
import { BOOKING_STATUS_LABELS } from '@/lib/booking/status'
import { formatEuro } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/time'

export const metadata: Metadata = { title: 'Rezervácie' }

type Snapshot = { first_name?: string; last_name?: string; email?: string; company_name?: string | null }

// Read-only overview so that bookings from the public form can be checked.
// Filters, timeline, status changes and editing arrive in Phase 6.
export default async function BookingsPage() {
  await requireStaff('operator', '/admin/rezervacie')
  const supabase = await createClient()
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, number, status, pickup_at, return_at, days, total_cents, is_individual_price, customer_snapshot, created_at, vehicles(name)')
    .order('created_at', { ascending: false })
    .limit(200)
  const list = bookings ?? []

  return (
    <div>
      <PageHeader title="Rezervácie" />
      <p className="mb-6 text-sm text-muted2">Prehľad prijatých rezervácií. Potvrdzovanie, úpravy a kalendár pribudnú v ďalšej fáze.</p>
      {list.length === 0 ? (
        <p className="rounded-xl border border-gold/40 bg-surface p-6 text-sm text-muted2">Zatiaľ žiadna rezervácia.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gold/40 bg-surface">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wider text-muted2">
              <tr>
                {['Číslo', 'Zákazník', 'Vozidlo', 'Termín', 'Cena', 'Stav', 'Vytvorené'].map((heading) => (
                  <th key={heading} scope="col" className="px-4 py-3 font-semibold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((booking) => {
                const customer = (booking.customer_snapshot ?? {}) as Snapshot
                return (
                  <tr key={booking.id} className="align-top text-white">
                    <td className="px-4 py-3 font-semibold">
                      <Link href={`/admin/rezervacie/${booking.id}`} className="text-gold underline-offset-4 hover:underline">
                        {booking.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {customer.first_name} {customer.last_name}
                      {customer.company_name ? <span className="block text-muted2">{customer.company_name}</span> : null}
                    </td>
                    <td className="px-4 py-3">{booking.vehicles?.name}</td>
                    <td className="px-4 py-3">
                      {formatDateTime(booking.pickup_at)} –<br />
                      {formatDateTime(booking.return_at)}
                    </td>
                    <td className="px-4 py-3">{booking.total_cents !== null ? formatEuro(booking.total_cents) : 'individuálna'}</td>
                    <td className="px-4 py-3">{BOOKING_STATUS_LABELS[booking.status]}</td>
                    <td className="px-4 py-3 text-muted2">{formatDateTime(booking.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
