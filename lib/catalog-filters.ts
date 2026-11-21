import { zonedLocalToUtc } from '@/lib/time'

export type CatalogFilters = {
  categories: string[]
  transmission: 'automatic' | 'manual' | null
  fuel: string | null
  /** Exact number of seats (5, 7, 8 …). */
  seats: number | null
  from: string | null // YYYY-MM-DD
  to: string | null
}

type Params = Record<string, string | string[] | undefined>
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ''
const DATE = /^\d{4}-\d{2}-\d{2}$/
const FUELS = ['petrol', 'diesel', 'hybrid', 'plug_in_hybrid', 'electric']

/** Reads and sanitises the catalogue filters from the query string. */
export function parseCatalogFilters(params: Params, knownCategories: string[], fixedCategory?: string): CatalogFilters {
  const requested = fixedCategory ? [fixedCategory] : first(params.kategoria).split(',')
  const transmission = first(params.prevodovka)
  const fuel = first(params.palivo)
  const seatCount = Number(first(params.miesta))
  const from = first(params.od)
  const to = first(params.do)
  const datesOk = DATE.test(from) && DATE.test(to) && from <= to
  return {
    categories: knownCategories.filter((slug) => requested.includes(slug)),
    transmission: transmission === 'automatic' || transmission === 'manual' ? transmission : null,
    fuel: FUELS.includes(fuel) ? fuel : null,
    seats: Number.isInteger(seatCount) && seatCount >= 2 && seatCount <= 9 ? seatCount : null,
    from: datesOk ? from : null,
    to: datesOk ? to : null,
  }
}

/** The non-category part of the filters as a query string (without "?"). */
export function filterQuery(filters: CatalogFilters): URLSearchParams {
  const query = new URLSearchParams()
  if (filters.transmission) query.set('prevodovka', filters.transmission)
  if (filters.fuel) query.set('palivo', filters.fuel)
  if (filters.seats) query.set('miesta', String(filters.seats))
  if (filters.from && filters.to) {
    query.set('od', filters.from)
    query.set('do', filters.to)
  }
  return query
}

/**
 * Path for a category selection: none -> "/", exactly one -> its own indexable page
 * "/sedan", several -> "/?kategoria=sedan,suv". Other filters are carried along.
 */
export function catalogPath(categories: string[], filters: CatalogFilters): string {
  const query = filterQuery(filters)
  let path = '/'
  if (categories.length === 1) path = `/${categories[0]}`
  else if (categories.length > 1) query.set('kategoria', categories.join(','))
  const qs = query.toString().replace(/%2C/g, ',')
  return qs ? `${path}?${qs}` : path
}

/** Selection after clicking a chip: adds the category or removes it if already selected. */
export function toggleCategory(selected: string[], slug: string, order: string[]): string[] {
  const next = selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]
  return order.filter((s) => next.includes(s))
}

/** Whole-day window in Europe/Bratislava for the date filter. */
export function filterWindow(filters: CatalogFilters): { from: Date; to: Date } | null {
  if (!filters.from || !filters.to) return null
  const from = zonedLocalToUtc(`${filters.from}T00:00`)
  const to = zonedLocalToUtc(`${filters.to}T23:59`)
  return from && to ? { from, to } : null
}

export function hasActiveFilters(filters: CatalogFilters): boolean {
  return !!(filters.transmission || filters.fuel || filters.seats || (filters.from && filters.to))
}
