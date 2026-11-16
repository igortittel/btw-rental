export const SITE_URL = 'https://rental.btw.sk'

/** Absolute URL of a path in the given locale (SK without a prefix, EN under /en). */
export function absoluteUrl(path: string, locale: string): string {
  const prefix = locale === 'en' ? '/en' : ''
  return `${SITE_URL}${prefix}${path === '/' ? '' : path}` || SITE_URL
}

/** canonical + hreflang alternates for a path that exists in both languages. */
export function alternates(path: string, locale: string) {
  return {
    canonical: absoluteUrl(path, locale),
    languages: { sk: absoluteUrl(path, 'sk'), en: absoluteUrl(path, 'en'), 'x-default': absoluteUrl(path, 'sk') },
  }
}
