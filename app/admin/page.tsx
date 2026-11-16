import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime, utcToZonedLocal, zonedLocalToUtc } from '@/lib/time'

type Props = { searchParams: Promise<{ chyba?: string }> }
type Snapshot = { first_name?: string; last_name?: string }

// What needs attention today. KPIs and the timeline arrive in Phase 6.
export default async function AdminHomePage({ searchParams }: Props) {
  const { chyba } = await searchParams
  const supabase = await createClient()
  const today = utcToZonedLocal(new Date()).slice(0, 10)
  const dayStart = zonedLocalToUtc(`${today}T00:00`)!.toISOString()
  const dayEnd = zonedLocalToUtc(`${today}T23:59`)!.toISOString()
  const select = 'id, number, pickup_at, return_at, customer_snapshot, vehicles(name)'

  const [pending, active, pickups, returns] = await Promise.all([
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('bookings').select(select).in('status', ['confirmed', 'active']).gte('pickup_at', dayStart).lte('pickup_at', dayEnd).order('pickup_at'),
    supabase.from('bookings').select(select).in('status', ['confirmed', 'active']).gte('return_at', dayStart).lte('return_at', dayEnd).order('return_at'),
  ])

  const tiles = [
    { label: 'Čakajú na potvrdenie', value: pending.count ?? 0, href: '/admin/rezervacie?stav=new', highlight: (pending.count ?? 0) > 0 },
    { label: 'Vozidlá v prenájme', value: active.count ?? 0, href: '/admin/rezervacie?stav=active', highlight: false },
    { label: 'Dnešné vyzdvihnutia', value: pickups.data?.length ?? 0, href: `/admin/rezervacie?od=${today}&do=${today}`, highlight: false },
    { label: 'Dnešné odovzdania', value: returns.data?.length ?? 0, href: `/admin/rezervacie?od=${today}&do=${today}`, highlight: false },
  ]
  const lists = [
    { title: 'Dnešné vyzdvihnutia', rows: pickups.data ?? [], time: 'pickup_at' as const },
    { title: 'Dnešné odovzdania', rows: returns.data ?? [], time: 'return_at' as const },
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
      <div className="grid gap-4 lg:grid-cols-2">
        {lists.map((list) => (
          <section key={list.title} className="rounded-xl border border-gold/40 bg-surface p-4 sm:p-5">
            <h2 className="text-base font-bold text-white">{list.title}</h2>
            {list.rows.length === 0 ? (
              <p className="mt-3 text-sm text-muted2">Dnes žiadne.</p>
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
    </div>
  )
}
