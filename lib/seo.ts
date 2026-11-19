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

/** Share image for pages without their own photo (1200 × 630, public/images/og.jpg). */
export const DEFAULT_OG_IMAGE = { url: `${SITE_URL}/images/og.jpg`, width: 1200, height: 630, alt: 'BY THE WAVE – rental' }

export function ogLocale(locale: string) {
  return locale === 'en' ? 'en_GB' : 'sk_SK'
}

type Company = { name: string; address: string; phone: string | null; email: string | null; web: string | null }

/** schema.org description of the rental business (shown on the catalogue home page). */
export function organizationJsonLd(company: Company, locale: string, description: string) {
  // "Trenčianska 56/A, 821 09 Bratislava" -> street, postal code, city
  const [street, rest = ''] = company.address.split(',').map((part) => part.trim())
  const postal = rest.match(/^(\d{3}\s?\d{2})\s+(.+)$/)
  return {
    '@context': 'https://schema.org',
    '@type': 'AutoRental',
    '@id': `${SITE_URL}/#organization`,
    name: company.name,
    description,
    url: absoluteUrl('/', locale),
    logo: `${SITE_URL}/images/logo.svg`,
    image: DEFAULT_OG_IMAGE.url,
    email: company.email ?? undefined,
    telephone: company.phone ?? undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: street,
      postalCode: postal?.[1],
      addressLocality: postal?.[2] ?? rest,
      addressCountry: 'SK',
    },
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '00:00',
      closes: '23:59',
    },
    priceRange: '€€€',
    sameAs: company.web ? [company.web] : undefined,
  }
}

/** JSON for a <script type="application/ld+json">, safe against closing the script tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
