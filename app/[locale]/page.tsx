import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { CatalogView, isFilteredVariant } from '@/components/catalog/catalog-view'
import { getCatalog } from '@/lib/catalog'
import { parseCatalogFilters } from '@/lib/catalog-filters'
import { alternates } from '@/lib/seo'

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ locale }, query, catalog] = await Promise.all([params, searchParams, getCatalog()])
  const t = await getTranslations({ locale, namespace: 'catalog' })
  const filters = parseCatalogFilters(
    query,
    catalog.categories.map((c) => c.slug),
  )
  return {
    title: { absolute: `${t('metaTitle')} | BY THE WAVE` },
    description: t('metaDescription'),
    alternates: alternates('/', locale),
    robots: isFilteredVariant(filters) ? { index: false, follow: true } : undefined,
    openGraph: { title: t('metaTitle'), description: t('metaDescription'), type: 'website', locale: locale === 'en' ? 'en_GB' : 'sk_SK' },
  }
}

export default async function CatalogPage({ params, searchParams }: Props) {
  const [{ locale }, query, catalog] = await Promise.all([params, searchParams, getCatalog()])
  setRequestLocale(locale)
  const t = await getTranslations('catalog')
  const filters = parseCatalogFilters(
    query,
    catalog.categories.map((c) => c.slug),
  )

  return (
    <section className="mx-auto max-w-6xl px-6 pb-20 pt-32">
      <h1 className="text-center text-4xl font-bold tracking-wide text-white md:text-5xl">
        {t('title')}
        <span className="block text-gold">{t('titleAccent')}</span>
      </h1>
      <p className="mx-auto mb-10 mt-6 max-w-2xl text-center text-muted2">{t('lead')}</p>
      <CatalogView catalog={catalog} filters={filters} />
    </section>
  )
}
