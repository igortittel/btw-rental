import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

// Placeholder until the public catalogue lands (Phase 4).
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('site')

  return (
    <section className="mx-auto max-w-6xl px-6 pb-20 pt-40 text-center">
      <h1 className="text-4xl font-bold tracking-wide text-white md:text-5xl">
        BY THE WAVE
        <span className="block text-gold">{t('comingSoonTitle')}</span>
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-muted2">{t('comingSoonText')}</p>
    </section>
  )
}
