import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/**
 * Security headers for every response. The CSP deliberately does not restrict scripts
 * (that would need nonces and force every page to render dynamically); it blocks framing
 * by other sites (clickjacking), plugins, <base> hijacking and forms posting elsewhere.
 */
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Never send full URLs (password-link tokens, booking ids) to other sites.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Render metadata (title, description, canonical, hreflang) in <head> for every visitor instead of
  // streaming it into <body>: search engines ignore canonical/hreflang outside <head>.
  htmlLimitedBots: /.*/,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  // The administration moved to admin.btw.sk (repo btw-admin): old /admin links keep working.
  async redirects() {
    const admin = (process.env.NEXT_PUBLIC_ADMIN_URL?.startsWith('http') ? process.env.NEXT_PUBLIC_ADMIN_URL : 'https://admin.btw.sk').replace(/\/$/, '')
    return [
      { source: '/admin', destination: admin, statusCode: 301 },
      { source: '/admin/:path*', destination: `${admin}/:path*`, statusCode: 301 },
    ]
  },
  webpack(config) {
    // next-intl's plugin loads a message extractor through a dynamic import() that webpack's persistent
    // cache cannot analyse; it then warns on every build. The warning concerns only cache invalidation of
    // that dev-only file, so infrastructure logs are limited to errors.
    config.infrastructureLogging = { ...config.infrastructureLogging, level: 'error' }
    return config
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' }],
  },
}

export default withNextIntl(nextConfig)
