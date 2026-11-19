import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/admin/section'
import { requireStaff } from '@/lib/auth/session'
import { CUSTOMER_FILTERS, customerListQuery, customerQueryParams, parseCustomerQuery, type CustomerFilter } from '@/lib/customers/list'
import { formatEuro } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/time'

export const metadata: Metadata = { title: 'Zákazníci' }

type Props = { searchParams: Promise<Record<string, string | undefined>> }

const LIMIT = 300

/** Customers with bookings count, revenue and last booking; search, filters, CSV export. */
export default async function CustomersPage({ searchParams }: Props) {
  await requireStaff('operator', '/admin/zakaznici')
  const query = parseCustomerQuery(await searchParams)
  const supabase = await createClient()
  const { data, error } = await customerListQuery(supabase, query, LIMIT)
  const customers = data ?? []
  const href = (override: { filter?: CustomerFilter }) => {
    const qs = customerQueryParams(query, override).toString()
    return qs ? `/admin/zakaznici?${qs}` : '/admin/zakaznici'
  }
  const exportQs = customerQueryParams(query).toString()
  const chip = (active: boolean) =>
    `inline-flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-medium transition-colors ${active ? 'bg-white text-black' : 'border border-line text-muted2 hover:border-gold hover:text-white'}`
  const badge = 'rounded-full border px-2 py-0.5 text-xs font-semibold'

  return (
    <div>
      <PageHeader
        title="Zákazníci"
        action={
          <a
            href={`/admin/zakaznici/export${exportQs ? `?${exportQs}` : ''}`}
            className="inline-flex h-10 items-center rounded-lg border border-gold px-4 text-sm font-semibold text-white transition-colors hover:bg-gold/15"
          >
            Export CSV
          </a>
        }
      />
      <div className="space-y-4 rounded-xl border border-gold/40 bg-surface p-4">
        <form method="get" action="/admin/zakaznici" className="flex flex-wrap gap-2">
          {query.filter !== 'vsetci' ? <input type="hidden" name="filter" value={query.filter} /> : null}
          <label htmlFor="customer-q" className="sr-only">
            Hľadať
          </label>
          <input
            id="customer-q"
            name="q"
            type="search"
            defaultValue={query.q ?? ''}
            placeholder="Meno, e-mail, telefón, firma, IČO"
            className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-base text-white placeholder:text-zinc-500 focus:border-gold/50 focus:outline-none sm:text-sm"
          />
          <button type="submit" className="h-10 rounded-lg bg-gold px-4 text-sm font-semibold text-white hover:bg-gold-hover">
            Hľadať
          </button>
        </form>
        <nav aria-label="Filter" className="flex gap-2 overflow-x-auto pb-1">
          {(Object.keys(CUSTOMER_FILTERS) as CustomerFilter[]).map((key) => (
            <Link key={key} href={href({ filter: key })} aria-current={query.filter === key ? 'page' : undefined} className={chip(query.filter === key)}>
              {CUSTOMER_FILTERS[key]}
            </Link>
          ))}
        </nav>
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          Zoznam sa nepodarilo načítať.
        </p>
      ) : null}
      <p className="mt-4 text-sm text-muted2" aria-live="polite">
        {customers.length === 0 ? 'Žiadny zákazník nevyhovuje výberu.' : `Počet: ${customers.length}${customers.length === LIMIT ? ' (zobrazených prvých 300 – spresnite hľadanie)' : ''}`}
      </p>

      {/* Phones: cards; wider screens: a table. */}
      <ul className="mt-3 space-y-3 md:hidden">
        {customers.map((c) => (
          <li key={c.id}>
            <Link href={`/admin/zakaznici/${c.id}`} className="block rounded-xl border border-gold/40 bg-surface p-4 hover:border-gold">
              <p className="flex flex-wrap items-center gap-2 font-semibold text-white">
                {`${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || '—'}
                {c.is_blacklisted ? <span className={`${badge} border-red-400/60 bg-red-500/10 text-red-200`}>Blacklist</span> : null}
                {c.deletion_requested_at && !c.anonymized_at ? <span className={`${badge} border-amber-400/60 bg-amber-400/10 text-amber-100`}>Žiada vymazanie</span> : null}
              </p>
              <p className="mt-1 text-sm text-muted2">{[c.company_name, c.email, c.phone].filter(Boolean).join(' · ')}</p>
              <p className="mt-2 text-sm text-white">
                {c.bookings_count} rez. · {formatEuro(c.revenue_cents ?? 0)}
                {c.last_pickup_at ? <span className="text-muted2"> · posledná {formatDate(c.last_pickup_at)}</span> : null}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-3 hidden overflow-x-auto rounded-xl border border-gold/40 bg-surface px-4 md:block">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted2">
            <tr>
              <th scope="col" className="py-3 pr-3 font-semibold">
                Zákazník
              </th>
              <th scope="col" className="py-3 pr-3 font-semibold">
                Telefón
              </th>
              <th scope="col" className="py-3 pr-3 font-semibold">
                Firma
              </th>
              <th scope="col" className="py-3 pr-3 text-right font-semibold">
                Rezervácie
              </th>
              <th scope="col" className="py-3 pr-3 text-right font-semibold">
                Obrat s DPH
              </th>
              <th scope="col" className="py-3 pr-3 font-semibold">
                Posledná
              </th>
              <th scope="col" className="py-3 font-semibold">
                Príznaky
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {customers.map((c) => (
              <tr key={c.id} className="align-middle hover:bg-white/[0.02]">
                <td className="py-3 pr-3">
                  <Link href={`/admin/zakaznici/${c.id}`} className="block text-white hover:text-gold">
                    <strong>{`${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || '—'}</strong>
                    <span className="block text-muted2">{c.email ?? '—'}</span>
                  </Link>
                </td>
                <td className="py-3 pr-3 text-muted2">{c.phone ?? '—'}</td>
                <td className="py-3 pr-3 text-white">{c.company_name ?? '—'}</td>
                <td className="py-3 pr-3 text-right text-white">{c.bookings_count}</td>
                <td className="py-3 pr-3 text-right text-white">{formatEuro(c.revenue_cents ?? 0)}</td>
                <td className="py-3 pr-3 text-muted2">{c.last_pickup_at ? formatDate(c.last_pickup_at) : '—'}</td>
                <td className="py-3">
                  <span className="inline-flex flex-wrap gap-1.5">
                    {c.is_blacklisted ? <span className={`${badge} border-red-400/60 bg-red-500/10 text-red-200`}>Blacklist</span> : null}
                    {c.deletion_requested_at && !c.anonymized_at ? <span className={`${badge} border-amber-400/60 bg-amber-400/10 text-amber-100`}>Žiada vymazanie</span> : null}
                    {c.anonymized_at ? <span className={`${badge} border-line bg-white/5 text-muted2`}>Anonymizovaný</span> : null}
                    {!c.password_set && !c.anonymized_at ? <span className={`${badge} border-line bg-white/5 text-muted2`}>Bez hesla</span> : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted2">Obrat = potvrdené, prebiehajúce a ukončené rezervácie (bez storien), s DPH.</p>
    </div>
  )
}
