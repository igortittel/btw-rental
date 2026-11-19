import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { VehicleCard } from '@/components/catalog/vehicle-card'
import { DateField, SELECT_CHEVRON_STYLE } from '@/components/ui/date-field'
import { Link } from '@/i18n/navigation'
import { getAvailableVehicleIds, localize, type Catalog } from '@/lib/catalog'
import { catalogPath, filterQuery, filterWindow, hasActiveFilters, type CatalogFilters } from '@/lib/catalog-filters'
import { formatDate } from '@/lib/time'

const inputClass = 'h-11 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/50'
const selectClass = `${inputClass} appearance-none pr-9`
const SEAT_OPTIONS = [5, 7, 8]

/** Category chips (one active at a time), a collapsible filter form and the vehicle grid. Works without JavaScript: chips are links, the form is a GET. */
export async function CatalogView({ catalog, filters }: { catalog: Catalog; filters: CatalogFilters }) {
  const [t, locale] = await Promise.all([getTranslations('catalog'), getLocale()])
  const window = filterWindow(filters)

  let vehicles = catalog.vehicles.filter(
    (v) =>
      (filters.categories.length === 0 || filters.categories.includes(v.categorySlug)) &&
      (!filters.transmission || v.transmission === filters.transmission) &&
      (!filters.fuel || v.fuel === filters.fuel) &&
      (!filters.minSeats || v.seats >= filters.minSeats),
  )
  if (window) {
    const available = await getAvailableVehicleIds(
      vehicles.map((v) => v.id),
      window.from,
      window.to,
    )
    vehicles = vehicles.filter((v) => available.has(v.id))
  }

  const fuels = [...new Set(catalog.vehicles.map((v) => v.fuel))]
  const transmissions = [...new Set(catalog.vehicles.map((v) => v.transmission))]
  const dates = new URLSearchParams()
  if (filters.from && filters.to) {
    dates.set('od', filters.from)
    dates.set('do', filters.to)
  }
  const chip = (active: boolean) =>
    `inline-flex h-11 items-center rounded-full px-6 text-sm font-medium transition-colors ${active ? 'bg-white text-black' : 'border border-[#666666] text-muted2 hover:border-gold hover:text-white'}`
  const formAction = catalogPath(filters.categories, { ...filters, transmission: null, fuel: null, minSeats: null, from: null, to: null })
  const [actionPath, actionQuery] = formAction.split('?')
  const activeCount = [filters.transmission, filters.fuel, filters.minSeats, filters.from && filters.to].filter(Boolean).length

  return (
    <div>
      <nav aria-label={t('navCategories')} className="flex flex-wrap justify-center gap-3">
        <Link href={catalogPath([], filters)} className={chip(filters.categories.length === 0)} aria-current={filters.categories.length === 0 ? 'page' : undefined}>
          {t('allCategories')}
        </Link>
        {catalog.categories.map((category) => {
          const active = filters.categories.length === 1 && filters.categories[0] === category.slug
          return (
            <Link key={category.slug} href={catalogPath([category.slug], filters)} className={chip(active)} aria-current={active ? 'page' : undefined}>
              {localize(category.name, locale)}
            </Link>
          )
        })}
      </nav>

      {/* Filters are optional: collapsed until the visitor opens them (or one is active). */}
      <details className="group mx-auto mt-6 max-w-5xl rounded-xl border border-line bg-surface" open={hasActiveFilters(filters)}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-5 text-sm font-semibold text-white [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2.5">
            <SlidersHorizontal className="h-4 w-4 text-gold" aria-hidden="true" />
            {t('filters')}
            {activeCount > 0 ? <span className="rounded-full bg-gold px-2 py-0.5 text-xs text-white">{activeCount}</span> : null}
          </span>
          <ChevronDown className="h-4 w-4 text-gold transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <form method="get" action={locale === 'en' ? `/en${actionPath === '/' ? '' : actionPath}` : actionPath} className="grid gap-4 border-t border-line p-5 sm:grid-cols-2 lg:grid-cols-6">
          {new URLSearchParams(actionQuery ?? '').get('kategoria') ? <input type="hidden" name="kategoria" value={filters.categories.join(',')} /> : null}
          <div className="min-w-0 space-y-2">
            <label htmlFor="f-transmission" className="block text-sm font-medium text-white">
              {t('transmission')}
            </label>
            <select id="f-transmission" name="prevodovka" defaultValue={filters.transmission ?? ''} className={selectClass} style={SELECT_CHEVRON_STYLE}>
              <option value="">{t('any')}</option>
              {transmissions.map((value) => (
                <option key={value} value={value}>
                  {t(`transmissionLabels.${value}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="f-fuel" className="block text-sm font-medium text-white">
              {t('fuel')}
            </label>
            <select id="f-fuel" name="palivo" defaultValue={filters.fuel ?? ''} className={selectClass} style={SELECT_CHEVRON_STYLE}>
              <option value="">{t('any')}</option>
              {fuels.map((value) => (
                <option key={value} value={value}>
                  {t(`fuelLabels.${value}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="f-seats" className="block text-sm font-medium text-white">
              {t('seats')}
            </label>
            <select id="f-seats" name="miesta" defaultValue={filters.minSeats ?? ''} className={selectClass} style={SELECT_CHEVRON_STYLE}>
              <option value="">{t('any')}</option>
              {SEAT_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {t('seatsMin', { count })}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="f-from" className="block text-sm font-medium text-white">
              {t('dateFrom')}
            </label>
            <DateField id="f-from" name="od" defaultValue={filters.from ?? ''} className={inputClass} />
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="f-to" className="block text-sm font-medium text-white">
              {t('dateTo')}
            </label>
            <DateField id="f-to" name="do" defaultValue={filters.to ?? ''} className={inputClass} />
          </div>
          <div className="flex items-end">
            <button type="submit" className="h-11 w-full rounded-lg bg-gold px-4 text-sm font-semibold text-white transition-colors hover:bg-gold-hover">
              {t('apply')}
            </button>
          </div>
        </form>
      </details>

      <div className="mx-auto mt-6 flex max-w-5xl flex-wrap items-center justify-between gap-3 text-sm text-muted2" aria-live="polite">
        <p>
          {t('resultCount', { count: vehicles.length })}
          {window && filters.from && filters.to ? ` · ${t('availableInRange', { from: formatDate(window.from, locale), to: formatDate(window.to, locale) })}` : ''}
        </p>
        {hasActiveFilters(filters) ? (
          <Link
            href={catalogPath(filters.categories, { ...filters, transmission: null, fuel: null, minSeats: null, from: null, to: null })}
            className="text-gold underline-offset-4 hover:underline"
            rel="nofollow"
          >
            {t('reset')}
          </Link>
        ) : null}
      </div>

      {vehicles.length === 0 ? (
        <p className="mt-10 text-center text-muted2">{t('emptyHint')}</p>
      ) : (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((vehicle, index) => (
            <li key={vehicle.id}>
              <VehicleCard vehicle={vehicle} priority={index < 3} dates={dates} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** True when the page is a filtered variant that should not be indexed. */
export function isFilteredVariant(filters: CatalogFilters): boolean {
  return hasActiveFilters(filters) || filters.categories.length > 1 || filterQuery(filters).size > 0
}
