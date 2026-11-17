import Link from 'next/link'
import { formatEuro } from '@/lib/format'
import { computeKpi } from '@/lib/kpi'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime, utcToZonedLocal, zonedLocalToUtc } from '@/lib/time'

type Props = { searchParams: Promise<{ chyba?: string; obdobie?: string }> }
type Snapshot = { first_name?: string; last_name?: string }

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const PERIODS = { mesiac: 'Tento mesiac', minuly: 'Minulý mesiac', '30': 'Posledných 30 dní', rok: 'Tento rok' } as const
type Period = keyof typeof PERIODS

/** First and one-past-last day (YYYY-MM-DD) of the chosen period in Europe/Bratislava. */
function periodRange(period: Period, today: string): [string, string] {
  const [year, month] = today.split('-').map(Number)
  const first = (y: number, m: number) => `${y + Math.floor((m - 1) / 12)}-${String(((m - 1 + 12) % 12) + 1).padStart(2, '0')}-01`
  if (period === 'minuly') return [month === 1 ? `${year - 1}-12-01` : first(year, month - 1), first(year, month)]
  if (period === '30') return [addDays(today, -29), addDays(today, 1)]
  if (period === 'rok') return [`${year}-01-01`, `${year + 1}-01-01`]
  return [first(year, month), first(year, month + 1)]
}

// What needs attention today and tomorrow, and the key figures for a period.
export default async function AdminHomePage({ searchParams }: Props) {
  const { chyba, obdobie } = await searchParams
  const period: Period = obdobie && obdobie in PERIODS ? (obdobie as Period) : 'mesiac'
  const supabase = await createClient()
  const today = utcToZonedLocal(new Date()).slice(0, 10)
  const tomorrow = addDays(today, 1)
  const iso = (date: string, time: string) => zonedLocalToUtc(`${date}T${time}`)!.toISOString()
  const [periodFrom, periodTo] = periodRange(period, today)
  const select = 'id, number, pickup_at, return_at, customer_snapshot, vehicles(name)'
  const day = (column: 'pickup_at' | 'return_at', date: string) =>
    supabase.from('bookings').select(select).in('status', ['confirmed', 'active']).gte(column, iso(date, '00:00')).lte(column, iso(date, '23:59')).order(column)

  const [pending, modified, active, pickupsToday, returnsToday, pickupsTomorrow, returnsTomorrow, kpiBookings, vehicles] = await Promise.all([
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'modified'),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    day('pickup_at', today),
    day('return_at', today),
    day('pickup_at', tomorrow),
    day('return_at', tomorrow),
    supabase.from('bookings').select('pickup_at, return_at, total_cents').in('status', ['confirmed', 'active', 'completed']).lt('pickup_at', iso(periodTo, '00:00')).gt('return_at', iso(periodFrom, '00:00')),
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('for_rental', true),
  ])
  // Returned vehicles whose settlement has not been approved yet.
  const { data: returned } = await supabase
    .from('handover_protocols')
    .select('booking_id, signed_at, bookings(number, customer_snapshot, vehicles(name))')
    .eq('type', 'return')
    .not('signed_at', 'is', null)
    .order('signed_at', { ascending: false })
    .limit(60)
  const returnedIds = [...new Set((returned ?? []).map((row) => row.booking_id))]
  const { data: approved } = returnedIds.length > 0 ? await supabase.from('settlements').select('booking_id').not('approved_at', 'is', null).in('booking_id', returnedIds) : { data: [] }
  const settled = new Set((approved ?? []).map((row) => row.booking_id))
  const toSettle = (returned ?? []).filter((row, index, all) => !settled.has(row.booking_id) && all.findIndex((other) => other.booking_id === row.booking_id) === index)

  const kpi = computeKpi(kpiBookings.data ?? [], new Date(iso(periodFrom, '00:00')), new Date(iso(periodTo, '00:00')), vehicles.count ?? 0)

  const tiles = [
    { label: 'Čakajú na potvrdenie', value: pending.count ?? 0, href: '/admin/rezervacie?stav=new', highlight: (pending.count ?? 0) > 0 },
    { label: 'Úpravy na schválenie', value: modified.count ?? 0, href: '/admin/rezervacie?stav=modified', highlight: (modified.count ?? 0) > 0 },
    { label: 'Vozidlá v prenájme', value: active.count ?? 0, href: '/admin/rezervacie?stav=active', highlight: false },
    { label: 'Dnes vyzdvihnutia / odovzdania', value: `${pickupsToday.data?.length ?? 0} / ${returnsToday.data?.length ?? 0}`, href: `/admin/rezervacie?od=${today}&do=${today}`, highlight: false },
  ]
  const lists = [
    { title: 'Dnešné vyzdvihnutia', rows: pickupsToday.data ?? [], time: 'pickup_at' as const },
    { title: 'Dnešné odovzdania', rows: returnsToday.data ?? [], time: 'return_at' as const },
    { title: 'Zajtrajšie vyzdvihnutia', rows: pickupsTomorrow.data ?? [], time: 'pickup_at' as const },
    { title: 'Zajtrajšie odovzdania', rows: returnsTomorrow.data ?? [], time: 'return_at' as const },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-wide text-white">Prehľad</h1>
      {chyba === 'opravnenie' ? (
        <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          Na požadovanú stránku nemáte oprávnenie.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href} className={`rounded-xl border bg-surface p-4 transition-colors hover:border-gold sm:p-5 ${tile.highlight ? 'border-gold' : 'border-gold/40'}`}>
            <p className="text-xs text-muted2 sm:text-sm">{tile.label}</p>
            <p className={`mt-1 text-3xl font-bold ${tile.highlight ? 'text-gold' : 'text-white'}`}>{tile.value}</p>
          </Link>
        ))}
      </div>

      {toSettle.length > 0 ? (
        <section className="rounded-xl border border-gold bg-surface p-4 sm:p-5">
          <h2 className="text-base font-bold text-white">Vyúčtovania na potvrdenie ({toSettle.length})</h2>
          <ul className="mt-2 divide-y divide-line">
            {toSettle.map((row) => {
              const customer = (row.bookings?.customer_snapshot ?? {}) as Snapshot
              return (
                <li key={row.booking_id}>
                  <Link href={`/admin/rezervacie/${row.booking_id}/vyuctovanie`} prefetch={false} className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 py-2 text-sm text-white hover:text-gold">
                    <span>
                      <strong>{row.bookings?.number}</strong> · {row.bookings?.vehicles?.name}
                    </span>
                    <span className="text-muted2">
                      {customer.first_name} {customer.last_name} · vrátené {formatDateTime(row.signed_at!)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {lists.map((list) => (
          <section key={list.title} className="rounded-xl border border-gold/40 bg-surface p-4 sm:p-5">
            <h2 className="text-base font-bold text-white">{list.title}</h2>
            {list.rows.length === 0 ? (
              <p className="mt-3 text-sm text-muted2">Žiadne.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {list.rows.map((row) => {
                  const customer = (row.customer_snapshot ?? {}) as Snapshot
                  return (
                    <li key={row.id}>
                      <Link href={`/admin/rezervacie/${row.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 py-2 text-sm text-white hover:text-gold">
                        <span>
                          <strong>{formatDateTime(row[list.time]).split(' ').pop()}</strong> · {row.vehicles?.name}
                        </span>
                        <span className="text-muted2">
                          {customer.first_name} {customer.last_name} · {row.number}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        ))}
      </div>

      <section className="rounded-xl border border-gold/40 bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-white">Výsledky</h2>
          <nav aria-label="Obdobie" className="flex flex-wrap gap-2">
            {(Object.keys(PERIODS) as Period[]).map((key) => (
              <Link key={key} href={key === 'mesiac' ? '/admin' : `/admin?obdobie=${key}`} aria-current={period === key ? 'page' : undefined} className={`inline-flex h-9 items-center rounded-full px-3 text-xs font-medium ${period === key ? 'bg-white text-black' : 'border border-line text-muted2 hover:border-gold hover:text-white'}`}>
                {PERIODS[key]}
              </Link>
            ))}
          </nav>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3">
          {[
            ['Rezervácie', String(kpi.count)],
            ['Obrat s DPH', formatEuro(kpi.revenueCents)],
            ['Vyťaženosť', `${Math.round(kpi.utilization * 100)} %`],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted2 sm:text-sm">{label}</dt>
              <dd className="mt-1 text-xl font-bold text-white sm:text-2xl">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted2">Potvrdené, prebiehajúce a ukončené rezervácie so začiatkom v období; vyťaženosť = prenajatý čas zo všetkých aktívnych vozidiel.</p>
      </section>
    </div>
  )
}
