import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/admin/section'
import { AUDIT_AREAS, ENTITY_LABELS, actionLabel, auditChanges, type AuditArea } from '@/lib/audit/format'
import { requireStaff } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime, zonedLocalToUtc } from '@/lib/time'

export const metadata: Metadata = { title: 'Audit log' }

type Props = { searchParams: Promise<Record<string, string | undefined>> }
const PAGE = 50
const UUID = /^[0-9a-f-]{36}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TONE: Record<string, string> = {
  insert: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200',
  update: 'border-sky-400/60 bg-sky-400/10 text-sky-100',
  delete: 'border-red-400/50 bg-red-500/10 text-red-200',
  gdpr: 'border-amber-400/60 bg-amber-400/10 text-amber-100',
}

/** Read-only audit log for the owner: who changed what and when, newest first. */
export default async function AuditPage({ searchParams }: Props) {
  await requireStaff('owner', '/admin/audit')
  const sp = await searchParams
  const from = sp.od && DATE.test(sp.od) ? sp.od : ''
  const to = sp.do && DATE.test(sp.do) ? sp.do : ''
  const actor = sp.kto === 'system' || (sp.kto && UUID.test(sp.kto)) ? sp.kto : ''
  const area = sp.oblast && sp.oblast in AUDIT_AREAS ? (sp.oblast as AuditArea) : ''
  const bookingNumber =
    sp.rez
      ?.trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '')
      .slice(0, 20) ?? ''
  const before = sp.pred && /^\d+$/.test(sp.pred) ? Number(sp.pred) : null

  const supabase = await createClient()
  const { data: staff } = await supabase.from('staff_roles').select('user_id, profiles!staff_roles_user_id_fkey(first_name, last_name)')

  let bookingFilterId: string | null = null
  let bookingNotFound = false
  if (bookingNumber) {
    const { data } = await supabase.from('bookings').select('id').eq('number', bookingNumber).maybeSingle()
    bookingFilterId = data?.id ?? null
    bookingNotFound = !data
  }

  let query = supabase
    .from('audit_log')
    .select('id, actor_id, entity, entity_id, action, diff, created_at')
    .order('id', { ascending: false })
    .limit(PAGE + 1)
  if (from) query = query.gte('created_at', zonedLocalToUtc(`${from}T00:00`)!.toISOString())
  if (to) query = query.lte('created_at', zonedLocalToUtc(`${to}T23:59`)!.toISOString())
  if (actor === 'system') query = query.is('actor_id', null)
  else if (actor) query = query.eq('actor_id', actor)
  if (area) query = query.in('entity', [...AUDIT_AREAS[area].entities])
  if (bookingFilterId) query = query.or(`entity_id.eq.${bookingFilterId},diff->new->>booking_id.eq.${bookingFilterId},diff->old->>booking_id.eq.${bookingFilterId}`)
  if (before) query = query.lt('id', before)
  const { data: rows, error } = bookingNotFound ? { data: [], error: null } : await query
  const entries = (rows ?? []).slice(0, PAGE)
  const nextCursor = (rows ?? []).length > PAGE ? entries[entries.length - 1]?.id : null

  // Names for the people and the records in this page.
  const ids = (entity: string) => [...new Set(entries.filter((e) => e.entity === entity && e.entity_id).map((e) => e.entity_id!))]
  const bookingIdsInDiffs = entries.map((e) => {
    const d = (e.diff ?? {}) as { new?: { booking_id?: string }; old?: { booking_id?: string } }
    return d.new?.booking_id ?? d.old?.booking_id ?? null
  })
  const bookingIds = [...new Set([...ids('bookings'), ...bookingIdsInDiffs.filter((v): v is string => !!v)])]
  const profileIds = [...new Set([...ids('profiles'), ...ids('customer_internal'), ...ids('staff_roles'), ...entries.map((e) => e.actor_id).filter((v): v is string => !!v)])]
  const [{ data: bookings }, { data: profiles }, { data: vehicles }] = await Promise.all([
    bookingIds.length > 0 ? supabase.from('bookings').select('id, number').in('id', bookingIds) : Promise.resolve({ data: [] as { id: string; number: string }[] }),
    profileIds.length > 0
      ? supabase.from('profiles').select('id, first_name, last_name').in('id', profileIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
    ids('vehicles').length > 0 ? supabase.from('vehicles').select('id, name').in('id', ids('vehicles')) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ])
  const bookingNo = new Map((bookings ?? []).map((b) => [b.id, b.number]))
  const personName = new Map((profiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim() || 'bez mena']))
  const vehicleName = new Map((vehicles ?? []).map((v) => [v.id, v.name]))
  const describe = (entity: string, entityId: string | null, diffBooking: string | null) => {
    const label = ENTITY_LABELS[entity] ?? entity
    if (!entityId) return label
    if (entity === 'bookings') return `${label} ${bookingNo.get(entityId) ?? ''}`.trim()
    if (entity === 'profiles' || entity === 'customer_internal' || entity === 'staff_roles') return `${label} ${personName.get(entityId) ?? '(vymazaný)'}`
    if (entity === 'vehicles') return `${label} ${vehicleName.get(entityId) ?? ''}`.trim()
    if (entity === 'settings') return `${label} ${entityId}`
    if (diffBooking && bookingNo.get(diffBooking)) return `${label} · ${bookingNo.get(diffBooking)}`
    return label
  }

  const params = (extra: Record<string, string>) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ od: from, do: to, kto: actor, oblast: area, rez: bookingNumber, ...extra })) if (v) p.set(k, v)
    return p.toString()
  }
  const input = 'h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-base text-white focus:border-gold/50 focus:outline-none sm:text-sm [color-scheme:dark]'

  return (
    <div>
      <PageHeader title="Audit log" />
      <p className="-mt-6 mb-6 text-sm text-muted2">
        Všetky zápisy v administrácii: kto, kedy, čo a ktoré polia zmenil. Záznamy sa nedajú zmeniť ani zmazať. Úpravy profilu zákazníka sú zapísané bez hodnôt (osobné údaje).
      </p>

      <form method="get" action="/admin/audit" className="grid gap-3 rounded-xl border border-gold/40 bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
        <label className="space-y-1 text-xs text-muted2">
          Od
          <input type="date" name="od" defaultValue={from} className={input} />
        </label>
        <label className="space-y-1 text-xs text-muted2">
          Do
          <input type="date" name="do" defaultValue={to} className={input} />
        </label>
        <label className="space-y-1 text-xs text-muted2">
          Kto
          <select name="kto" defaultValue={actor} className={input}>
            <option value="">Všetci</option>
            {(staff ?? []).map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {`${s.profiles?.first_name ?? ''} ${s.profiles?.last_name ?? ''}`.trim() || s.user_id.slice(0, 8)}
              </option>
            ))}
            <option value="system">Systém (bez prihlásenia)</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted2">
          Oblasť
          <select name="oblast" defaultValue={area} className={input}>
            <option value="">Všetko</option>
            {(Object.keys(AUDIT_AREAS) as AuditArea[]).map((key) => (
              <option key={key} value={key}>
                {AUDIT_AREAS[key].label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted2">
          Číslo rezervácie
          <input name="rez" defaultValue={bookingNumber} placeholder="20260001" className={input} />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="h-10 flex-1 rounded-lg bg-gold px-4 text-sm font-semibold text-white hover:bg-gold-hover">
            Filtrovať
          </button>
          <Link href="/admin/audit" className="flex h-10 items-center rounded-lg border border-line px-3 text-sm text-muted2 hover:text-white">
            Zrušiť
          </Link>
        </div>
      </form>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          Záznamy sa nepodarilo načítať.
        </p>
      ) : null}
      {bookingNotFound ? <p className="mt-4 text-sm text-muted2">Rezervácia {bookingNumber} neexistuje.</p> : null}

      <ul className="mt-4 divide-y divide-line rounded-xl border border-gold/40 bg-surface">
        {entries.length === 0 ? <li className="p-4 text-sm text-muted2">Žiadne záznamy.</li> : null}
        {entries.map((entry, index) => {
          const action = actionLabel(entry.action)
          const changes = auditChanges(entry.action, entry.diff)
          const summary =
            changes
              .slice(0, 4)
              .map((c) => c.field)
              .join(', ') + (changes.length > 4 ? ` a ďalšie (${changes.length - 4})` : '')
          return (
            <li key={entry.id}>
              <details className="group">
                <summary className="grid cursor-pointer list-none gap-x-4 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[9.5rem_10rem_minmax(0,1fr)_auto] sm:items-center [&::-webkit-details-marker]:hidden">
                  <span className="text-muted2">{formatDateTime(entry.created_at)}</span>
                  <span className="text-white">{entry.actor_id ? (personName.get(entry.actor_id) ?? 'zamestnanec') : 'Systém'}</span>
                  <span className="min-w-0">
                    <strong className="font-semibold text-white">{describe(entry.entity, entry.entity_id, bookingIdsInDiffs[index])}</strong>
                    {summary ? <span className="block truncate text-muted2">{summary}</span> : null}
                  </span>
                  <span className={`justify-self-start rounded-full border px-2.5 py-0.5 text-xs font-semibold sm:justify-self-end ${TONE[action.tone]}`}>{action.label}</span>
                </summary>
                {changes.length > 0 ? (
                  <div className="overflow-x-auto px-4 pb-4">
                    <table className="w-full min-w-[480px] text-left text-sm">
                      <thead className="text-xs uppercase tracking-wider text-muted2">
                        <tr>
                          <th scope="col" className="py-1.5 pr-3 font-semibold">
                            Pole
                          </th>
                          <th scope="col" className="py-1.5 pr-3 font-semibold">
                            Pôvodne
                          </th>
                          <th scope="col" className="py-1.5 font-semibold">
                            Nové
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {changes.map((c, i) => (
                          <tr key={i} className="align-top">
                            <td className="py-1.5 pr-3 text-muted2">{c.field}</td>
                            <td className="break-all py-1.5 pr-3 text-muted2">{c.before}</td>
                            <td className="break-all py-1.5 text-white">{c.after}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 text-xs text-muted2">
                      {entry.entity} · {entry.entity_id ?? '—'} · #{entry.id}
                    </p>
                  </div>
                ) : null}
              </details>
            </li>
          )
        })}
      </ul>
      {nextCursor ? (
        <div className="mt-4">
          <Link
            href={`/admin/audit?${params({ pred: String(nextCursor) })}`}
            className="inline-flex h-10 items-center rounded-lg border border-gold px-4 text-sm font-semibold text-white hover:bg-gold/15"
          >
            Staršie záznamy
          </Link>
        </div>
      ) : null}
    </div>
  )
}
