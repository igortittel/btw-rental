import type { Metadata, Viewport } from 'next'
import { getLocale } from 'next-intl/server'
import '@fontsource-variable/montserrat'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL?.startsWith('http') ? process.env.NEXT_PUBLIC_SITE_URL : 'https://rental.btw.sk'),
  title: { default: 'BY THE WAVE – prenájom vozidiel', template: '%s | BY THE WAVE' },
  icons: { icon: '/images/logo.svg' },
}

export const viewport: Viewport = { themeColor: '#111111' }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  )
}
