import Image from 'next/image'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { getSessionUser } from '@/lib/auth/session'

/** Header in the style of btw.sk. Category navigation is added with the catalogue (Phase 4). */
export async function SiteHeader() {
  const [t, locale, user] = await Promise.all([getTranslations('site'), getLocale(), getSessionUser()])

  return (
    <header className="fixed top-0 z-50 flex w-full items-center justify-between border-b border-gold/30 bg-[#111111] px-6 py-4">
      <Link href="/" aria-label={`${t('name')} – ${t('tagline')}`} className="flex items-center">
        <Image src="/images/logo.svg" alt={t('name')} width={120} height={40} className="h-10 w-auto" priority />
      </Link>
      <nav aria-label="Main" className="flex items-center gap-5 text-sm sm:gap-8 sm:text-base">
        <a href="https://www.btw.sk" className="text-muted2 transition-colors hover:text-white">
          {t('backToBtw')}
        </a>
        <Link href="/" locale={locale === 'en' ? 'sk' : 'en'} className="text-muted2 transition-colors hover:text-white" lang={locale === 'en' ? 'sk' : 'en'}>
          {locale === 'en' ? 'SK' : 'EN'}
        </Link>
        {user?.role ? (
          <a href="/admin" className="text-muted2 transition-colors hover:text-white">
            {t('admin')}
          </a>
        ) : null}
        <Link
          href={user ? '/moj-ucet' : '/prihlasenie'}
          className="inline-flex h-10 items-center rounded-lg border border-gold px-4 font-medium text-white transition-colors hover:bg-gold/15"
        >
          {user ? t('account') : t('login')}
        </Link>
      </nav>
    </header>
  )
}
