const createNextIntlPlugin = require('next-intl/plugin')

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/**
 * Security headers for every response. The CSP deliberately does not restrict scripts
 * (that would need nonces and force every page to render dynamically); it blocks framing
 * by other sites (clickjacking of the admin), plugins, <base> hijacking and forms posting
 * elsewhere. Same-origin framing stays allowed for the email preview in /admin/emaily.
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
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Internal pages never belong in search results.
      { source: '/admin', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/admin/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ]
  },
  // pdfkit (protocol PDFs) loads its standard fonts and data through package "imports"
  // (#standard-fonts/…) that file tracing does not follow; ship them with the functions.
  outputFileTracingIncludes: {
    '/admin/**': ['./node_modules/pdfkit/js/standard-fonts/**', './node_modules/pdfkit/js/data/**'],
    '/api/protocols/**': ['./node_modules/pdfkit/js/standard-fonts/**', './node_modules/pdfkit/js/data/**'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },
}

module.exports = withNextIntl(nextConfig)
