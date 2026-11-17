const createNextIntlPlugin = require('next-intl/plugin')

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
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
