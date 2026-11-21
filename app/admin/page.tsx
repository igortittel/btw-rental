import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowDownLeft, ArrowUpRight, CalendarDays, Car, CircleCheck, CreditCard, Inbox, List, Mail, PencilLine, Plus, Receipt, TriangleAlert, UserX, Wallet, type LucideIcon } from 'lucide-react'
import { formatEuro } from '@/lib/format'
import { depositOutstandingCents, missingPayments, rentalOutstandingCents, unpaidCents } from '@/lib/payment'
import { requireStaff } from '@/lib/auth/session'
import { hasRole } from '@/lib/auth/roles'
import { computeKpi } from '@/lib/kpi'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatDateTime, utcToZonedLocal, zonedLocalToUtc } from '@/lib/time'

type Props = { searchParams: Promise<{ chyba?: string; obdobie?: string; den?: string }> }
type Snapshot = { first_name?: string; last_name?: string }

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const TODAY_LABEL = new Intl.DateTimeFormat('sk-SK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Bratislava' })
const PERIODS = { mesiac: 'Tento mesiac', minuly: 'Minulý mesiac', '30': 'Posledných 30 dní', rok: 'Tento rok' } as const
type Period = keyof typeof PERIODS
// Explicit order: an object puts the integer-like key '30' first.
const PERIOD_ORDER: Period[] = ['mesiac', 'minuly', '30', 'rok']

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
  const { chyba, obdobie, den } = await searchParams
  const agendaDay: 'dnes' | 'zajtra' = den === 'zajtra' ? 'zajtra' : 'dnes'
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
    supabase
      .from('bookings')
      .select('pickup_at, return_at, total_cents')
      .in('status', ['confirmed', 'active', 'completed'])
      .lt('pickup_at', iso(periodTo, '00:00'))
      .gt('return_at', iso(periodFrom, '00:00')),
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

  // ── Phase 9: payments, deposits, GDPR requests, missed handovers, cron ──
  const user = await requireStaff('operator')
  const now = new Date()
  const horizon = new Date(now.getTime() + 14 * 86_400_000).toISOString()
  const paySelect =
    'id, number, status, pickup_at, return_at, total_cents, deposit_cents, rental_payment_status, deposit_status, rental_paid_cents, rental_refunded_cents, deposit_received_cents, rental_payment_method, deposit_payment_method, customer_snapshot, vehicles(name)'
  const [{ data: upcoming }, { data: finished }, { data: deletionRequests }, { data: lastRun }] = await Promise.all([
    supabase.from('bookings').select(paySelect).in('status', ['confirmed', 'modified']).lte('pickup_at', horizon).order('pickup_at').limit(200),
    supabase.from('bookings').select(`${paySelect}, settlements(total_cents, approved_at)`).in('status', ['completed', 'cancelled']).eq('deposit_status', 'received').order('return_at').limit(100),
    hasRole(user.role, 'manager')
      ? supabase.from('profiles').select('id, first_name, last_name, email, deletion_requested_at').not('deletion_requested_at', 'is', null).is('anonymized_at', null).order('deletion_requested_at')
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string; email: string | null; deletion_requested_at: string | null }[] }),
    supabase.from('cron_runs').select('started_at, finished_at, ok, result, error').eq('job', 'daily').order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  const unpaid = (upcoming ?? []).filter((b) => missingPayments(b).length > 0)
  const unpaidSum = unpaid.reduce((sum, b) => sum + unpaidCents(b), 0)
  const missedPickups = (upcoming ?? []).filter((b) => new Date(b.pickup_at).getTime() < now.getTime() - 60 * 60_000)
  const deposits = (finished ?? []).map((b) => {
    const settlement = Array.isArray(b.settlements) ? b.settlements[0] : b.settlements
    const ready = b.status === 'cancelled' || !!settlement?.approved_at
    return { ...b, ready, refundCents: ready ? Math.max(0, b.deposit_cents - (settlement?.total_cents ?? 0)) : null }
  })
  const depositsReadySum = deposits.reduce((sum, d) => sum + (d.refundCents ?? 0), 0)
  const cronResult = (lastRun?.result ?? null) as { pickup?: { sent: number; failed: number }; return?: { sent: number; failed: number }; review?: { sent: number; failed: number } } | null

  const kpi = computeKpi(kpiBookings.data ?? [], new Date(iso(periodFrom, '00:00')), new Date(iso(periodTo, '00:00')), vehicles.count ?? 0)

  const methodShort = (m: string) => (m === 'transfer' ? 'prevod' : m === 'terminal' ? 'terminál' : 'na mieste')
  const customerName = (snapshot: unknown) => {
    const c = (snapshot ?? {}) as Snapshot & { company_name?: string | null }
    return c.company_name || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()
  }
  const deletionList = deletionRequests ?? []
  const soonUnpaid = unpaid.filter((b) => new Date(b.pickup_at).getTime() - now.getTime() < 36 * 3600_000).length
  const readyDeposits = deposits.filter((d) => d.ready)

  // ── What needs attention: open items first, the rest collapsed into one "done" line ──
  type Task = { key: string; label: string; count: number; sub: string; href: string; icon: LucideIcon; tone: 'danger' | 'gold' }
  const tasks: Task[] = [
    { key: 'missed', label: 'Zmeškané vyzdvihnutia', count: missedPickups.length, sub: 'termín uplynul, protokol nie je podpísaný', href: '#zmeskane', icon: TriangleAlert, tone: 'danger' },
    { key: 'new', label: 'Čakajú na potvrdenie', count: pending.count ?? 0, sub: 'nové rezervácie a dopyty', href: '/admin/rezervacie?stav=new', icon: Inbox, tone: 'gold' },
    { key: 'modified', label: 'Úpravy na schválenie', count: modified.count ?? 0, sub: 'zmeny navrhnuté zákazníkom', href: '/admin/rezervacie?stav=modified', icon: PencilLine, tone: 'gold' },
    {
      key: 'unpaid',
      label: 'Neuhradené pred vyzdvihnutím',
      count: unpaid.length,
      sub: `${formatEuro(unpaidSum)} · do 14 dní${soonUnpaid > 0 ? ` · ${soonUnpaid} čoskoro` : ''}`,
      href: '#neuhradene',
      icon: CreditCard,
      tone: soonUnpaid > 0 ? 'danger' : 'gold',
    },
    { key: 'settle', label: 'Vyúčtovania na potvrdenie', count: toSettle.length, sub: 'vrátené vozidlá', href: '#vyuctovania', icon: Receipt, tone: 'gold' },
    {
      key: 'deposits',
      label: 'Depozity na vrátenie',
      count: deposits.length,
      sub: readyDeposits.length > 0 ? `${formatEuro(depositsReadySum)} pripravené na vrátenie` : 'čakajú na vyúčtovanie',
      href: '#depozity',
      icon: Wallet,
      tone: 'gold',
    },
    ...(hasRole(user.role, 'manager')
      ? [
          {
            key: 'deletion',
            label: 'Žiadosti o vymazanie účtu',
            count: deletionList.length,
            sub: deletionList.length > 0 ? `najstaršia ${formatDateTime(deletionList[0].deletion_requested_at!).split(' ')[0]} · lehota 30 dní` : '',
            href: '#vymazanie',
            icon: UserX,
            tone: 'gold' as const,
          },
        ]
      : []),
  ]
  const openTasks = tasks.filter((task) => task.count > 0)
  const doneTasks = tasks.filter((task) => task.count === 0)

  // ── Agenda: pick-ups and returns of one day on a single time line ──
  const agendaRows = [
    ...(agendaDay === 'dnes' ? (pickupsToday.data ?? []) : (pickupsTomorrow.data ?? [])).map((row) => ({ row, kind: 'pickup' as const, at: row.pickup_at })),
    ...(agendaDay === 'dnes' ? (returnsToday.data ?? []) : (returnsTomorrow.data ?? [])).map((row) => ({ row, kind: 'return' as const, at: row.return_at })),
  ].sort((a, b) => a.at.localeCompare(b.at))
  const dayCounts = {
    dnes: { pickups: pickupsToday.data?.length ?? 0, returns: returnsToday.data?.length ?? 0 },
    zajtra: { pickups: pickupsTomorrow.data?.length ?? 0, returns: returnsTomorrow.data?.length ?? 0 },
  }
  const dayHref = (day: 'dnes' | 'zajtra') => {
    const query = new URLSearchParams()
    if (period !== 'mesiac') query.set('obdobie', period)
    if (day === 'zajtra') query.set('den', 'zajtra')
    const qs = query.toString()
    return qs ? `/admin?${qs}` : '/admin'
  }
  const periodHref = (key: Period) => {
    const query = new URLSearchParams()
    if (key !== 'mesiac') query.set('obdobie', key)
    if (agendaDay === 'zajtra') query.set('den', 'zajtra')
    const qs = query.toString()
    return qs ? `/admin?${qs}` : '/admin'
  }

  const activeCount = active.count ?? 0
  const fleetCount = vehicles.count ?? 0
  const utilization = Math.round(kpi.utilization * 100)
  const rowLink = 'flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm text-white hover:text-gold'

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gold">{TODAY_LABEL.format(now)}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-wide text-white sm:text-3xl">Prehľad</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/rezervacie/nova" className="inline-flex h-10 items-center gap-2 rounded-lg bg-gold px-4 text-sm font-semibold text-white transition-colors hover:bg-gold-hover">
            <Plus className="h-4 w-4" aria-hidden="true" /> Nová rezervácia
          </Link>
          <Link
            href="/admin/rezervacie/kalendar"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-gold/60 px-4 text-sm font-medium text-white transition-colors hover:bg-gold/15"
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" /> Kalendár
          </Link>
          <Link
            href="/admin/rezervacie"
            className="hidden h-10 items-center gap-2 sm:inline-flex rounded-lg border border-gold/60 px-4 text-sm font-medium text-white transition-colors hover:bg-gold/15"
          >
            <List className="h-4 w-4" aria-hidden="true" /> Rezervácie
          </Link>
        </div>
      </div>

      {chyba === 'opravnenie' ? (
        <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          Na požadovanú stránku nemáte oprávnenie.
        </p>
      ) : null}

      {/* ── Needs attention ── */}
      <section aria-labelledby="pozornost">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="pozornost" className="text-sm font-semibold uppercase tracking-widest text-muted2">
            Vyžaduje pozornosť
          </h2>
          {openTasks.length > 0 ? <span className="text-sm text-muted2">{itemCount(openTasks.reduce((sum, task) => sum + task.count, 0))}</span> : null}
        </div>
        {openTasks.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {openTasks.map((task) => {
              const Icon = task.icon
              const danger = task.tone === 'danger'
              const card = `group flex items-center gap-4 rounded-xl border p-4 transition-colors ${danger ? 'border-red-400/60 bg-red-500/[0.07] hover:border-red-300' : 'border-gold/60 bg-gold/[0.07] hover:border-gold'}`
              const inner = (
                <>
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${danger ? 'bg-red-500/15 text-red-200' : 'bg-gold/15 text-gold'}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white">{task.label}</span>
                    {task.sub ? <span className="mt-0.5 block truncate text-xs text-muted2">{task.sub}</span> : null}
                  </span>
                  <span className={`text-3xl font-bold tabular-nums ${danger ? 'text-red-200' : 'text-gold'}`}>{task.count}</span>
                </>
              )
              return task.href.startsWith('#') ? (
                <a key={task.key} href={task.href} className={card}>
                  {inner}
                </a>
              ) : (
                <Link key={task.key} href={task.href} className={card}>
                  {inner}
                </Link>
              )
            })}
          </div>
        ) : (
          <p className="flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/[0.07] p-4 text-sm text-white">
            <CircleCheck className="h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" /> Všetko je vybavené – nič nečaká na potvrdenie, úhradu ani vyúčtovanie.
          </p>
        )}
        {openTasks.length > 0 && doneTasks.length > 0 ? (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted2">
            <CircleCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            <span>Bez úloh:</span>
            {doneTasks.map((task, index) => (
              <span key={task.key}>
                {task.label}
                {index < doneTasks.length - 1 ? ' ·' : ''}
              </span>
            ))}
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── Left: agenda and the lists behind the tiles ── */}
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="agenda" className="rounded-xl border border-gold/40 bg-surface p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="agenda" className="text-lg font-bold text-white">
                Vyzdvihnutia a odovzdania
              </h2>
              <nav aria-label="Deň" className="inline-flex rounded-lg border border-line p-0.5">
                {(['dnes', 'zajtra'] as const).map((day) => (
                  <Link
                    key={day}
                    href={dayHref(day)}
                    aria-current={agendaDay === day ? 'page' : undefined}
                    className={`flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${agendaDay === day ? 'bg-white text-black' : 'text-muted2 hover:text-white'}`}
                  >
                    {day === 'dnes' ? 'Dnes' : 'Zajtra'}
                    <span className={`rounded-full px-1.5 text-xs tabular-nums ${agendaDay === day ? 'bg-black/10' : 'bg-white/10'}`}>{dayCounts[day].pickups + dayCounts[day].returns}</span>
                  </Link>
                ))}
              </nav>
            </div>
            <p className="mt-1 text-sm text-muted2">
              {formatDate(iso(agendaDay === 'dnes' ? today : tomorrow, '12:00'))} · {dayCounts[agendaDay].pickups} vyzdvihnutí · {dayCounts[agendaDay].returns} odovzdaní
            </p>
            {agendaRows.length === 0 ? (
              <p className="mt-5 rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted2">
                {agendaDay === 'dnes' ? 'Dnes' : 'Zajtra'} nie je naplánované žiadne vyzdvihnutie ani odovzdanie.
              </p>
            ) : (
              <ol className="mt-5 space-y-1 border-l border-line pl-0">
                {agendaRows.map(({ row, kind, at }) => {
                  const pickup = kind === 'pickup'
                  const Icon = pickup ? ArrowUpRight : ArrowDownLeft
                  return (
                    <li key={`${kind}-${row.id}`} className="relative">
                      <span
                        className={`absolute -left-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border ${pickup ? 'border-gold bg-[#1a1612] text-gold' : 'border-emerald-400/70 bg-[#121a16] text-emerald-300'}`}
                        aria-hidden="true"
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <Link href={`/admin/rezervacie/${row.id}`} className="ml-6 flex min-h-14 items-center gap-4 rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.04]">
                        <span className="w-12 shrink-0 text-base font-bold tabular-nums text-white">{formatDateTime(at).split(' ').pop()}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-white">{row.vehicles?.name}</span>
                          <span className="block truncate text-xs text-muted2">
                            {customerName(row.customer_snapshot)} · {row.number}
                          </span>
                        </span>
                        <span
                          className={`hidden shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold sm:inline ${pickup ? 'border-gold/60 text-gold' : 'border-emerald-400/50 text-emerald-200'}`}
                        >
                          {pickup ? 'Vyzdvihnutie' : 'Odovzdanie'}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          {missedPickups.length > 0 ? (
            <Panel id="zmeskane" title="Zmeškané vyzdvihnutia" count={missedPickups.length} tone="danger" lead="Stav mení podpis odovzdávacieho protokolu. Ak zákazník neprišiel, rezerváciu zrušte.">
              {missedPickups.map((b) => (
                <li key={b.id}>
                  <Link href={`/admin/rezervacie/${b.id}`} className={rowLink}>
                    <span>
                      <strong>{b.number}</strong> · {b.vehicles?.name}
                    </span>
                    <span className="text-muted2">
                      {customerName(b.customer_snapshot)} · vyzdvihnutie {formatDateTime(b.pickup_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </Panel>
          ) : null}

          {unpaid.length > 0 ? (
            <Panel
              id="neuhradene"
              title="Neuhradené platby pred vyzdvihnutím"
              count={unpaid.length}
              lead="Potvrdené rezervácie s vyzdvihnutím do 14 dní bez zaznamenanej úhrady prenájmu alebo prijatia depozitu."
            >
              {unpaid.map((b) => {
                const missing = missingPayments(b)
                const soon = new Date(b.pickup_at).getTime() - now.getTime() < 36 * 3600_000
                return (
                  <li key={b.id}>
                    <a href={`/admin/rezervacie/${b.id}#platby`} className={rowLink}>
                      <span>
                        <strong>{b.number}</strong> · {b.vehicles?.name}
                        <span className="block text-muted2">
                          {customerName(b.customer_snapshot)} · vyzdvihnutie {formatDateTime(b.pickup_at)}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span>
                          {missing
                            .map((k) =>
                              k === 'rental'
                                ? `${b.rental_payment_status === 'unpaid' ? 'prenájom' : 'doplatok prenájmu'} ${formatEuro(rentalOutstandingCents(b))} (${methodShort(b.rental_payment_method)})`
                                : `${b.deposit_status === 'pending' ? 'depozit' : 'doplatok depozitu'} ${formatEuro(depositOutstandingCents(b))} (${methodShort(b.deposit_payment_method)})`,
                            )
                            .join(' + ')}
                        </span>
                        {soon ? <span className="rounded-full border border-red-400/60 bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-200">čoskoro</span> : null}
                      </span>
                    </a>
                  </li>
                )
              })}
            </Panel>
          ) : null}

          {toSettle.length > 0 ? (
            <Panel id="vyuctovania" title="Vyúčtovania na potvrdenie" count={toSettle.length}>
              {toSettle.map((row) => {
                const customer = (row.bookings?.customer_snapshot ?? {}) as Snapshot
                return (
                  <li key={row.booking_id}>
                    <Link href={`/admin/rezervacie/${row.booking_id}/vyuctovanie`} prefetch={false} className={rowLink}>
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
            </Panel>
          ) : null}

          {deposits.length > 0 ? (
            <Panel id="depozity" title="Depozity na vrátenie" count={deposits.length}>
              {deposits.map((d) => (
                <li key={d.id}>
                  <a href={d.ready ? `/admin/rezervacie/${d.id}#platby` : `/admin/rezervacie/${d.id}/vyuctovanie`} className={rowLink}>
                    <span>
                      <strong>{d.number}</strong> · {d.vehicles?.name}
                      <span className="block text-muted2">
                        {customerName(d.customer_snapshot)} · {d.status === 'cancelled' ? 'zrušená' : `vrátené ${formatDateTime(d.return_at).split(' ')[0]}`}
                      </span>
                    </span>
                    {d.ready ? <strong className="text-gold">vrátiť {formatEuro(d.refundCents)}</strong> : <span className="text-muted2">najprv potvrďte vyúčtovanie</span>}
                  </a>
                </li>
              ))}
            </Panel>
          ) : null}

          {deletionList.length > 0 ? (
            <Panel id="vymazanie" title="Žiadosti o vymazanie účtu" count={deletionList.length} lead="Žiadosť treba vybaviť do 30 dní.">
              {deletionList.map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/zakaznici/${p.id}`} className={rowLink}>
                    <span>
                      <strong>{`${p.first_name} ${p.last_name}`.trim()}</strong> · {p.email}
                    </span>
                    <span className="text-muted2">žiadosť {formatDateTime(p.deletion_requested_at!)}</span>
                  </Link>
                </li>
              ))}
            </Panel>
          ) : null}
        </div>

        {/* ── Right: fleet, results, automatic e-mails ── */}
        <aside className="space-y-6" aria-label="Stav">
          <Link href="/admin/rezervacie?stav=active" className="block rounded-xl border border-gold/40 bg-surface p-5 transition-colors hover:border-gold">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-muted2">Vozidlá v prenájme</h2>
              <Car className="h-5 w-5 text-gold" aria-hidden="true" />
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-white">
              {activeCount}
              <span className="text-lg font-semibold text-muted2"> / {fleetCount}</span>
            </p>
            <Meter value={fleetCount > 0 ? activeCount / fleetCount : 0} label={`${activeCount} z ${fleetCount} vozidiel je práve v prenájme`} />
          </Link>

          <section aria-labelledby="vysledky" className="rounded-xl border border-gold/40 bg-surface p-5">
            <h2 id="vysledky" className="text-sm font-semibold text-muted2">
              Výsledky
            </h2>
            <nav aria-label="Obdobie" className="mt-3 flex flex-wrap gap-1.5">
              {PERIOD_ORDER.map((key) => (
                <Link
                  key={key}
                  href={periodHref(key)}
                  aria-current={period === key ? 'page' : undefined}
                  className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-medium ${period === key ? 'bg-white text-black' : 'border border-line text-muted2 hover:border-gold hover:text-white'}`}
                >
                  {PERIODS[key]}
                </Link>
              ))}
            </nav>
            <dl className="mt-5 space-y-4">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-muted2">Obrat s DPH</dt>
                <dd className="text-2xl font-bold tabular-nums text-white">{formatEuro(kpi.revenueCents)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-muted2">Rezervácie</dt>
                <dd className="text-xl font-bold tabular-nums text-white">{kpi.count}</dd>
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-sm text-muted2">Vyťaženosť</dt>
                  <dd className="text-xl font-bold tabular-nums text-white">{utilization} %</dd>
                </div>
                <Meter value={kpi.utilization} label={`Vyťaženosť ${utilization} %`} />
              </div>
            </dl>
            <p className="mt-4 text-xs leading-5 text-muted2">Potvrdené, prebiehajúce a ukončené rezervácie so začiatkom v období; vyťaženosť = prenajatý čas zo všetkých aktívnych vozidiel.</p>
          </section>

          <section aria-labelledby="emaily" className="rounded-xl border border-gold/40 bg-surface p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 id="emaily" className="flex items-center gap-2 text-sm font-semibold text-muted2">
                <Mail className="h-4 w-4 text-gold" aria-hidden="true" /> Automatické e-maily
              </h2>
              {lastRun ? (
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${lastRun.ok ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200' : 'border-red-400/60 bg-red-500/10 text-red-200'}`}
                >
                  {lastRun.ok ? 'v poriadku' : lastRun.finished_at ? 's chybami' : 'nedokončený'}
                </span>
              ) : null}
            </div>
            {lastRun ? (
              <>
                <p className="mt-1 text-xs text-muted2">Posledný beh {formatDateTime(lastRun.started_at)} · každé ráno</p>
                <dl className="mt-3 space-y-1.5 text-sm">
                  {(
                    [
                      ['Pripomienka vyzdvihnutia', cronResult?.pickup],
                      ['Pripomienka vrátenia', cronResult?.return],
                      ['Poďakovanie a recenzia', cronResult?.review],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4">
                      <dt className="text-muted2">{label}</dt>
                      <dd className="tabular-nums text-white">
                        {value?.sent ?? 0}
                        {value?.failed ? <span className="text-red-200"> · {value.failed} zlyhalo</span> : null}
                      </dd>
                    </div>
                  ))}
                </dl>
                {lastRun.error ? <p className="mt-2 text-xs text-red-200">{lastRun.error}</p> : null}
              </>
            ) : (
              <p className="mt-3 text-sm text-muted2">Zatiaľ neprebehol žiadny automatický beh.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}

/** "1 položka", "3 položky", "5 položiek". */
function itemCount(n: number): string {
  return `${n} ${n === 1 ? 'položka' : n >= 2 && n <= 4 ? 'položky' : 'položiek'}`
}

/** A list behind one of the attention tiles (the tile links to its anchor). */
function Panel({ id, title, count, lead, tone = 'gold', children }: { id: string; title: string; count: number; lead?: string; tone?: 'gold' | 'danger'; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`scroll-mt-24 rounded-xl border bg-surface p-4 sm:p-6 ${tone === 'danger' ? 'border-red-400/60' : 'border-gold/40'}`}>
      <h2 id={`${id}-title`} className="flex items-center gap-2 text-base font-bold text-white">
        {title}
        <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${tone === 'danger' ? 'bg-red-500/15 text-red-200' : 'bg-gold/15 text-gold'}`}>{count}</span>
      </h2>
      {lead ? <p className="mt-1 text-xs text-muted2">{lead}</p> : null}
      <ul className="mt-2 divide-y divide-line">{children}</ul>
    </section>
  )
}

/** Thin progress bar (decorative; the number next to it carries the value). */
function Meter({ value, label }: { value: number; label: string }) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10" role="img" aria-label={label}>
      <div className="h-full rounded-full bg-gold" style={{ width: `${percent}%` }} />
    </div>
  )
}
