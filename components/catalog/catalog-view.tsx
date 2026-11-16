import { getLocale, getTranslations } from 'next-intl/server'
import { VehicleCard } from '@/components/catalog/vehicle-card'
import { Link } from '@/i18n/navigation'
import { getAvailableVehicleIds, localize, type Catalog } from '@/lib/catalog'
import { catalogPath, filterQuery, filterWindow, hasActiveFilters, toggleCategory, type CatalogFilters } from '@/lib/catalog-filters'
import { formatDate } from '@/lib/time'

const selectClass =
  'h-11 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/50'
const SEAT_OPTIONS = [5, 7, 8]

/** Filter chips, filter form and the vehicle grid. Works without JavaScript: chips are links, the form is a GET. */
export async function CatalogView({ catalog, filters }: { catalog: Catalog; filters: CatalogFilters }) {
  const [t, locale] = await Promise.all([getTranslations('catalog'), getLocale()])
  const order = catalog.categories.map((c) => c.slug)
  const window = filterWindow(filters)

  let vehicles = catalog.vehicles.filter(
    (v) =>
      (filters.categories.length === 0 || filters.categories.includes(v.categorySlug)) &&
      (!filters.transmission || v.transmission === filters.transmission) &&
      (!filters.fuel || v.fuel === filters.fuel) &&
      (!filters.minSeats || v.seats >= filters.minSeats),
  )
  if (window) {
    const available = await getAvailableVehicleIds(vehicles.map((v) => v.id), window.from, window.to)
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
    `inline-flex h-11 items-center rounded-full px-6 text-sm font-medium transition-colors ${
      active ? 'bg-white text-black' : 'border border-[#666666] text-muted2 hover:border-gold hover:text-white'
    }`
  const formAction = catalogPath(filters.categories, { ...filters, transmission: null, fuel: null, minSeats: null, from: null, to: null })
  const [actionPath, actionQuery] = formAction.split('?')

  return (
    <div>
      <nav aria-label={t('navCategories')} className="flex flex-wrap justify-center gap-3">
        <Link href={catalogPath([], filters)} className={chip(filters.categories.length === 0)} aria-current={filters.categories.length === 0 ? 'page' : undefined}>
          {t('allCategories')}
        </Link>
        {catalog.categories.map((category) => {
          const active = filters.categories.includes(category.slug)
          return (
            <Link
              key={category.slug}
              href={catalogPath(toggleCategory(filters.categories, category.slug, order), filters)}
              className={chip(active)}
              aria-current={active ? "true" : undefined}
              // Only the single-category pages are meant to be indexed.
              rel={filters.categories.length === 0 || (active && filters.categories.length === 2) ? undefined : 'nofollow'}
            >
              {localize(category.name, locale)}
            </Link>
          )
        })}
      </nav>

      <form method="get" action={locale === 'en' ? `/en${actionPath === '/' ? '' : actionPath}` : actionPath} className="mx-auto mt-8 grid max-w-5xl gap-4 rounded-xl border border-line bg-surface p-5 sm:grid-cols-2 lg:grid-cols-6">
        {new URLSearchParams(actionQuery ?? '').get('kategoria') ? <input type="hidden" name="kategoria" value={filters.categories.join(',')} /> : null}
        <div className="space-y-2">
          <label htmlFor="f-transmission" className="block text-sm font-medium text-white">
            {t('transmission')}
          </label>
          <select id="f-transmission" name="prevodovka" defaultValue={filters.transmission ?? ''} className={selectClass}>
            <option value="">{t('any')}</option>
            {transmissions.map((value) => (
              <option key={value} value={value}>
                {t(`transmissionLabels.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="f-fuel" className="block text-sm font-medium text-white">
            {t('fuel')}
          </label>
          <select id="f-fuel" name="palivo" defaultValue={filters.fuel ?? ''} className={selectClass}>
            <option value="">{t('any')}</option>
            {fuels.map((value) => (
              <option key={value} value={value}>
                {t(`fuelLabels.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="f-seats" className="block text-sm font-medium text-white">
            {t('seats')}
          </label>
          <select id="f-seats" name="miesta" defaultValue={filters.minSeats ?? ''} className={selectClass}>
            <option value="">{t('any')}</option>
            {SEAT_OPTIONS.map((count) => (
              <option key={count} value={count}>
                {t('seatsMin', { count })}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="f-from" className="block text-sm font-medium text-white">
            {t('dateFrom')}
          </label>
          <input id="f-from" type="date" name="od" defaultValue={filters.from ?? ''} className={`${selectClass} [color-scheme:dark]`} />
        </div>
        <div className="space-y-2">
          <label htmlFor="f-to" className="block text-sm font-medium text-white">
            {t('dateTo')}
          </label>
          <input id="f-to" type="date" name="do" defaultValue={filters.to ?? ''} className={`${selectClass} [color-scheme:dark]`} />
        </div>
        <div className="flex items-end">
          <button type="submit" className="h-11 w-full rounded-lg bg-gold px-4 text-sm font-semibold text-white transition-colors hover:bg-gold-hover">
            {t('apply')}
          </button>
        </div>
      </form>

      <div className="mx-auto mt-6 flex max-w-5xl flex-wrap items-center justify-between gap-3 text-sm text-muted2" aria-live="polite">
        <p>
          {t('resultCount', { count: vehicles.length })}
          {window && filters.from && filters.to ? ` · ${t('availableInRange', { from: formatDate(window.from, locale), to: formatDate(window.to, locale) })}` : ''}
        </p>
        {hasActiveFilters(filters) ? (
          <Link href={catalogPath(filters.categories, { ...filters, transmission: null, fuel: null, minSeats: null, from: null, to: null })} className="text-gold underline-offset-4 hover:underline" rel="nofollow">
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
