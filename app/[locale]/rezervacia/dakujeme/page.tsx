import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { ClearBookingDraft } from '@/components/booking/clear-draft'
import { Link } from '@/i18n/navigation'
import { getCatalog } from '@/lib/catalog'
import { isEmailConfigured } from '@/lib/email/send'

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ cislo?: string; typ?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'booking.thanks' })
  return { title: t('metaTitle'), robots: { index: false, follow: false } }
}

// The page shows only what is in the URL (the booking number) – it never looks a
// booking up, so guessing numbers reveals nothing.
export default async function BookingThanksPage({ params, searchParams }: Props) {
  const [{ locale }, { cislo, typ }] = await Promise.all([params, searchParams])
  setRequestLocale(locale)
  // Digits only (20260043); the older BTW-2026-0001 form is still accepted.
  if (!cislo || !/^(\d{8,10}|BTW-\d{4}-\d{4,6})$/.test(cislo)) notFound()

  const [t, catalog] = await Promise.all([getTranslations('booking.thanks'), getCatalog()])
  const individual = typ === 'dopyt'
  // Until transactional email is configured nothing is sent – do not promise an email.
  const emailed = isEmailConfigured()
  const steps = (t.raw(individual ? 'stepsIndividual' : 'steps') as string[]).filter((_, index) => emailed || index !== 2)
  const email = catalog.settings.company.email

  return (
    <section className="mx-auto max-w-2xl px-6 pb-20 pt-32">
      <ClearBookingDraft />
      <h1 className="text-3xl font-bold tracking-wide text-white">{t(individual ? 'titleIndividual' : 'title')}</h1>
      <div className="mt-8 rounded-xl border border-gold bg-surface p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-gold">{t('numberLabel')}</p>
        <p className="mt-2 text-3xl font-bold tracking-wider text-white">{cislo}</p>
      </div>
      <p className="mt-6 text-base leading-7 text-white">{t(emailed ? 'lead' : 'leadNoEmail')}</p>

      <h2 className="mt-10 text-lg font-bold text-white">{t('next')}</h2>
      <ol className="mt-4 space-y-4">
        {steps.map((step, index) => (
          <li key={index} className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold text-sm font-bold text-white">{index + 1}</span>
            <span className="pt-1 text-[15px] leading-6 text-muted2">{step}</span>
          </li>
        ))}
      </ol>

      {email && emailed ? <p className="mt-8 border-t border-line pt-6 text-sm leading-6 text-muted2">{t('noEmail', { email })}</p> : null}

      <div className="mt-8 flex flex-wrap gap-4">
        <Link href="/moj-ucet" className="inline-flex h-12 items-center justify-center rounded-lg bg-gold px-6 text-base font-semibold text-white transition-colors hover:bg-gold-hover">
          {t('account')}
        </Link>
        <Link href="/" className="inline-flex h-12 items-center justify-center rounded-lg border border-gold px-6 text-base font-semibold text-white transition-colors hover:bg-gold/15">
          {t('backToCatalog')}
        </Link>
      </div>
    </section>
  )
}
