import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getCatalog } from '@/lib/catalog'

export const metadata: Metadata = { title: 'Rezervácia', robots: { index: false, follow: false } }

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ vozidlo?: string }> }

// Placeholder: the 3-step booking form arrives in Phase 5.
export default async function BookingPage({ params, searchParams }: Props) {
  const [{ locale }, { vozidlo }] = await Promise.all([params, searchParams])
  setRequestLocale(locale)
  const t = await getTranslations('booking')
  const vehicle = vozidlo ? (await getCatalog()).vehicles.find((v) => v.vin === vozidlo.toUpperCase()) : null

  return (
    <section className="mx-auto max-w-2xl px-6 pb-20 pt-32 text-center">
      <h1 className="text-3xl font-bold tracking-wide text-white">{t('title')}</h1>
      {vehicle ? <p className="mt-4 text-white">{t('selected', { name: vehicle.name })}</p> : null}
      <p className="mt-4 text-muted2">{t('comingSoon')}</p>
    </section>
  )
}
