'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

const LOCALES = ['sk', 'en'] as const

/** SK | EN segmented switch: the active language is highlighted, the other one keeps the visitor on the same page. */
export function LocaleSwitch({ className }: { className?: string }) {
  const locale = useLocale()
  const pathname = usePathname()
  const t = useTranslations('site')
  const item = 'flex h-9 min-w-11 items-center justify-center rounded-md px-3 text-sm font-semibold transition-colors'
  return (
    <nav aria-label={t('language')} className={cn('inline-flex items-center rounded-lg border border-line p-0.5', className)}>
      {LOCALES.map((code) =>
        code === locale ? (
          <span key={code} aria-current="true" className={cn(item, 'bg-gold text-white')}>
            {code.toUpperCase()}
          </span>
        ) : (
          <Link key={code} href={pathname} locale={code} lang={code} hrefLang={code} className={cn(item, 'text-muted2 hover:text-white')}>
            {code.toUpperCase()}
          </Link>
        ),
      )}
    </nav>
  )
}
