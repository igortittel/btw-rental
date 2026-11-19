import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { CatalogView, isFilteredVariant } from '@/components/catalog/catalog-view'
import { getCatalog, localize } from '@/lib/catalog'
import { parseCatalogFilters } from '@/lib/catalog-filters'
import { formatEuro } from '@/lib/format'
import { alternates } from '@/lib/seo'

type Props = { params: Promise<{ locale: string; kategoria: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

async function load(slug: string) {
  const catalog = await getCatalog()
  const category = catalog.categories.find((c) => c.slug === slug)
  return { catalog, category }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ locale, kategoria }, query] = await Promise.all([params, searchParams])
  const { catalog, category } = await load(kategoria)
  if (!category) return {}
  const t = await getTranslations({ locale, namespace: 'catalog' })
  const name = localize(category.name, locale)
  const vehicles = catalog.vehicles.filter((v) => v.categorySlug === category.slug)
  const prices = vehicles.map((v) => v.priceFromCents).filter((p): p is number => p !== null)
  const filters = parseCatalogFilters(
    query,
    catalog.categories.map((c) => c.slug),
    category.slug,
  )
  const description = t('categoryMetaDescription', { category: name, count: vehicles.length, price: prices.length ? formatEuro(Math.min(...prices), locale) : '—' })
  return {
    title: t('categoryMetaTitle', { category: name }),
    description,
    alternates: alternates(`/${category.slug}`, locale),
    robots: isFilteredVariant(filters) || vehicles.length === 0 ? { index: false, follow: true } : undefined,
    openGraph: { title: t('categoryMetaTitle', { category: name }), description, type: 'website', locale: locale === 'en' ? 'en_GB' : 'sk_SK' },
  }
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ locale, kategoria }, query] = await Promise.all([params, searchParams])
  setRequestLocale(locale)
  const { catalog, category } = await load(kategoria)
  if (!category) notFound()

  const t = await getTranslations('catalog')
  const filters = parseCatalogFilters(
    query,
    catalog.categories.map((c) => c.slug),
    category.slug,
  )

  return (
    <section className="mx-auto max-w-6xl px-6 pb-20 pt-32">
      <h1 className="text-center text-4xl font-bold tracking-wide text-white md:text-5xl">{t('categoryTitle', { category: localize(category.name, locale) })}</h1>
      <p className="mx-auto mb-10 mt-6 max-w-2xl text-center text-muted2">{t('lead')}</p>
      <CatalogView catalog={catalog} filters={filters} />
    </section>
  )
}
