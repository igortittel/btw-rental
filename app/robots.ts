import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo'

const PRIVATE = ['/admin', '/api/', '/moj-ucet', '/rezervacia', '/prihlasenie', '/zabudnute-heslo', '/nastavit-heslo']

export default function robots(): MetadataRoute.Robots {
  // Only the production domain is meant to be indexed; previews stay out of search.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
    return { rules: { userAgent: '*', disallow: '/' } }
  }
  return {
    rules: { userAgent: '*', allow: '/', disallow: [...PRIVATE, ...PRIVATE.filter((p) => !p.startsWith('/admin') && !p.startsWith('/api')).map((p) => `/en${p}`)] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
