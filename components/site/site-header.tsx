import Image from 'next/image'
import { getLocale, getTranslations } from 'next-intl/server'
import { LocaleSwitch } from '@/components/site/locale-switch'
import { LoginDialog } from '@/components/site/login-dialog'
import { Link } from '@/i18n/navigation'
import { getSessionUser } from '@/lib/auth/session'
import { getCatalog, localize } from '@/lib/catalog'

/** Header in the style of btw.sk: logo -> rental home, category navigation, link back to btw.sk. */
export async function SiteHeader() {
  const [t, c, locale, user, catalog] = await Promise.all([getTranslations('site'), getTranslations('catalog'), getLocale(), getSessionUser(), getCatalog()])
  const categories = catalog.categories.filter((category) => category.vehicleCount > 0)
  const linkClass = 'text-muted2 transition-colors hover:text-white'
  const accountClass = 'inline-flex h-10 items-center rounded-lg border border-gold px-4 text-sm font-medium text-white transition-colors hover:bg-gold/15'

  const secondary = (
    <>
      <a href="https://www.btw.sk" className={linkClass}>
        {t('backToBtw')}
      </a>
      <LocaleSwitch className={linkClass} />
      {user?.role ? (
        <a href="/admin" className={linkClass}>
          {t('admin')}
        </a>
      ) : null}
    </>
  )

  return (
    <header className="fixed top-0 z-50 w-full border-b border-gold/30 bg-[#111111]">
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <Link href="/" aria-label={`${t('name')} – ${t('tagline')}`} className="flex shrink-0 items-center">
          <Image src="/images/logo.svg" alt={t('name')} width={120} height={40} className="h-10 w-auto" priority />
        </Link>

        <nav aria-label={c('navCategories')} className="hidden items-center gap-8 lg:flex">
          {categories.map((category) => (
            <Link key={category.slug} href={`/${category.slug}`} className={linkClass}>
              {localize(category.name, locale)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-5">
          <div className="hidden items-center gap-6 lg:flex">{secondary}</div>
          {user ? (
            <Link href="/moj-ucet" className={accountClass}>
              {t('account')}
            </Link>
          ) : (
            <LoginDialog className={accountClass} />
          )}
          <details className="group lg:hidden">
            <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-white [&::-webkit-details-marker]:hidden" aria-label={c('menu')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <line x1="4" x2="20" y1="6" y2="6" />
                <line x1="4" x2="20" y1="12" y2="12" />
                <line x1="4" x2="20" y1="18" y2="18" />
              </svg>
            </summary>
            <nav aria-label={c('menu')} className="absolute inset-x-0 top-full flex flex-col border-b border-gold/30 bg-[#111111] px-6 pb-4">
              {categories.map((category) => (
                <Link key={category.slug} href={`/${category.slug}`} className={`${linkClass} flex min-h-11 items-center border-b border-line`}>
                  {localize(category.name, locale)}
                </Link>
              ))}
              <div className="flex min-h-11 items-center gap-8 pt-2">{secondary}</div>
            </nav>
          </details>
        </div>
      </div>
    </header>
  )
}
