import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['sk', 'en'],
  defaultLocale: 'sk',
  // SK without a prefix (rental.btw.sk/sedan/…), EN under /en.
  localePrefix: 'as-needed',
  localeDetection: false,
})

export type AppLocale = (typeof routing.locales)[number]

/** Prefixes a path with /en when needed. Admin paths are never localised. */
export function localizedPath(locale: string, path: string): string {
  if (locale !== 'en' || path.startsWith('/admin')) return path
  return path === '/' ? '/en' : `/en${path}`
}
