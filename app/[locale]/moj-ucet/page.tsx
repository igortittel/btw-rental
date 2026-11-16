import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { localizedPath } from '@/i18n/routing'
import { logoutAction } from '@/lib/auth/actions'
import { requireUser } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Môj účet', robots: { index: false, follow: false } }

// Minimal customer area for Phase 2 (sign-in works end to end). Bookings, countdown,
// edits and cancellation arrive in Phase 7.
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await requireUser(localizedPath(locale, '/moj-ucet'))
  const [t, site] = await Promise.all([getTranslations('account'), getTranslations('site')])
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ')

  return (
    <section className="mx-auto max-w-3xl px-6 pb-20 pt-32">
      <h1 className="text-3xl font-bold tracking-wide text-white">
        {name ? t('greeting', { name }) : t('greetingAnonymous')}
      </h1>
      <p className="mt-2 text-sm text-muted2">{t('signedInAs', { email: user.email })}</p>

      {user.role ? (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gold/60 bg-surface p-6">
          <p className="text-sm text-white">{t('staffNotice')}</p>
          <Button asChild variant="outline">
            <a href="/admin">{t('goToAdmin')}</a>
          </Button>
        </div>
      ) : null}

      <div className="mt-8 rounded-xl border border-gold/60 bg-surface p-6">
        <h2 className="text-lg font-bold text-white">{t('bookingsTitle')}</h2>
        <p className="mt-2 text-sm text-muted2">{t('bookingsEmpty')}</p>
      </div>

      <form action={logoutAction} className="mt-8">
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="outline">
          {site('logout')}
        </Button>
      </form>
    </section>
  )
}
