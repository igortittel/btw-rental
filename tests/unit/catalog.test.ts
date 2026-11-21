import { describe, expect, it } from 'vitest'
import { catalogPath, filterWindow, parseCatalogFilters, toggleCategory } from '@/lib/catalog-filters'

const KNOWN = ['sedan', 'suv', 'limousine', 'van']
const none = parseCatalogFilters({}, KNOWN)

describe('catalogue filters', () => {
  it('ignores unknown and malformed values', () => {
    const f = parseCatalogFilters({ kategoria: 'sedan,admin,van', prevodovka: 'x', palivo: 'coal', miesta: '99', od: '2027-13-99', do: 'x' }, KNOWN)
    expect(f).toEqual({ categories: ['sedan', 'van'], transmission: null, fuel: null, seats: null, from: null, to: null })
  })
  it('reads valid values', () => {
    const f = parseCatalogFilters({ prevodovka: 'automatic', palivo: 'diesel', miesta: '7', od: '2027-03-01', do: '2027-03-05' }, KNOWN)
    expect(f).toMatchObject({ transmission: 'automatic', fuel: 'diesel', seats: 7, from: '2027-03-01', to: '2027-03-05' })
  })
  it('drops a date range that ends before it starts', () => {
    expect(parseCatalogFilters({ od: '2027-03-05', do: '2027-03-01' }, KNOWN).from).toBeNull()
  })
  it('a category page fixes the category regardless of the query', () => {
    expect(parseCatalogFilters({ kategoria: 'suv' }, KNOWN, 'sedan').categories).toEqual(['sedan'])
  })
})

describe('category chips', () => {
  it('link one category to its own indexable page', () => {
    expect(catalogPath(['sedan'], none)).toBe('/sedan')
    expect(catalogPath([], none)).toBe('/')
  })
  it('link several categories to a query on the catalogue', () => {
    expect(catalogPath(['sedan', 'suv'], none)).toBe('/?kategoria=sedan,suv')
  })
  it('carry the other filters along', () => {
    const f = parseCatalogFilters({ prevodovka: 'automatic', miesta: '7' }, KNOWN)
    expect(catalogPath(['van'], f)).toBe('/van?prevodovka=automatic&miesta=7')
  })
  it('toggle in catalogue order', () => {
    expect(toggleCategory(['van'], 'sedan', KNOWN)).toEqual(['sedan', 'van'])
    expect(toggleCategory(['sedan', 'van'], 'sedan', KNOWN)).toEqual(['van'])
  })
})

describe('date filter window', () => {
  it('covers whole days in Europe/Bratislava', () => {
    const w = filterWindow(parseCatalogFilters({ od: '2027-07-01', do: '2027-07-03' }, KNOWN))!
    expect(w.from.toISOString()).toBe('2027-06-30T22:00:00.000Z')
    expect(w.to.toISOString()).toBe('2027-07-03T21:59:00.000Z')
  })
})
