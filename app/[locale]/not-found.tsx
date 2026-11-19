import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

// Shown for unknown categories, vehicles and other missing pages inside the public site.
export default function NotFound() {
  const t = useTranslations('site')
  return (
    <section className="mx-auto max-w-xl px-6 pb-24 pt-36 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-gold">404</p>
      <h1 className="mt-3 text-3xl font-bold tracking-wide text-white md:text-4xl">{t('notFoundTitle')}</h1>
      <p className="mt-4 leading-7 text-muted2">{t('notFoundText')}</p>
      <Link href="/" className="mt-8 inline-flex h-12 items-center justify-center rounded-lg bg-gold px-8 text-base font-semibold text-white transition-colors hover:bg-gold-hover">
        {t('notFoundCta')}
      </Link>
    </section>
  )
}
