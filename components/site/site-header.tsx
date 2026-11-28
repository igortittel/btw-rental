import { ADMIN_URL } from '@/lib/admin-url'
import Image from 'next/image'
import { getLocale, getTranslations } from 'next-intl/server'
import { LocaleSwitch } from '@/components/site/locale-switch'
import { LoginDialog } from '@/components/site/login-dialog'
import { Link } from '@/i18n/navigation'
import { logoutAction } from '@/lib/auth/actions'
import { getSessionUser } from '@/lib/auth/session'

/**
 * Header: logo -> rental home. Desktop: language switch, admin link (staff), sign in / my account.
 * Phones: only the logo and the menu button; everything else is inside the menu.
 * Categories are not in the menu – the chips above the catalogue filter are enough.
 */
export async function SiteHeader() {
  const [t, c, locale, user] = await Promise.all([getTranslations('site'), getTranslations('catalog'), getLocale(), getSessionUser()])
  const linkClass = 'text-muted2 transition-colors hover:text-white'
  const accountClass = 'inline-flex h-10 items-center rounded-lg border border-gold px-4 text-sm font-medium text-white transition-colors hover:bg-gold/15'
  const menuItem = 'flex min-h-12 w-full items-center border-b border-line text-base text-white transition-colors hover:text-gold'

  // The admin lives outside the locale routing and needs a full page load.
  const adminLink = (className: string) =>
    user?.role ? (
      <a href={ADMIN_URL} className={className}>
        {t('admin')}
      </a>
    ) : null

  return (
    <header className="fixed top-0 z-50 w-full border-b border-gold/30 bg-[#111111]">
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <Link href="/" aria-label={`${t('name')} – ${t('tagline')}`} className="flex shrink-0 items-center">
          <Image src="/images/logo.svg" alt={t('name')} width={44} height={40} className="h-10 w-auto" preload />
        </Link>

        <div className="hidden items-center gap-6 lg:flex">
          <LocaleSwitch />
          {adminLink(linkClass)}
          {user ? (
            <Link href="/moj-ucet" className={accountClass}>
              {t('account')}
            </Link>
          ) : (
            <LoginDialog className={accountClass} />
          )}
        </div>

        <details className="group lg:hidden">
          <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-white [&::-webkit-details-marker]:hidden" aria-label={c('menu')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="group-open:hidden">
              <line x1="4" x2="20" y1="6" y2="6" />
              <line x1="4" x2="20" y1="12" y2="12" />
              <line x1="4" x2="20" y1="18" y2="18" />
            </svg>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="hidden group-open:block">
              <line x1="6" x2="18" y1="6" y2="18" />
              <line x1="18" x2="6" y1="6" y2="18" />
            </svg>
          </summary>
          <nav aria-label={c('menu')} className="absolute inset-x-0 top-full flex flex-col border-b border-gold/30 bg-[#111111] px-6 pb-5">
            {user ? (
              <Link href="/moj-ucet" className={menuItem}>
                {t('account')}
              </Link>
            ) : (
              <LoginDialog className={menuItem} />
            )}
            {adminLink(menuItem)}
            {user ? (
              <form action={logoutAction} className="contents">
                <input type="hidden" name="locale" value={locale} />
                <button type="submit" className={`${menuItem} text-left text-muted2`}>
                  {t('logout')}
                </button>
              </form>
            ) : null}
            <div className="pt-4">
              <LocaleSwitch />
            </div>
          </nav>
        </details>
      </div>
    </header>
  )
}
