'use client'

import { useLocale } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'

/** Switches language while staying on the same page. */
export function LocaleSwitch({ className }: { className?: string }) {
  const locale = useLocale()
  const pathname = usePathname()
  const other = locale === 'en' ? 'sk' : 'en'
  return (
    <Link href={pathname} locale={other} className={className} lang={other} hrefLang={other}>
      {other.toUpperCase()}
    </Link>
  )
}
