import type { Metadata } from 'next'
import { Montserrat } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'By The Wave | Premium Car Rental',
    template: '%s | BTW Premium Car Rental',
  },
  description:
    'Experience luxury on every road. By The Wave offers premium vehicle rentals with white-glove concierge service.',
  keywords: ['premium car rental', 'luxury rental', 'BTW', 'By The Wave'],
  openGraph: {
    title: 'By The Wave | Premium Car Rental',
    description: 'Experience luxury on every road.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${montserrat.variable} dark`} suppressHydrationWarning>
      <body className="min-h-screen bg-[#111111] text-foreground font-montserrat antialiased">
        <Navbar />
        <main>{children}</main>
        <footer className="border-t border-zinc-800 bg-zinc-950 py-10 mt-20">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div>
                <span className="text-2xl font-black font-montserrat text-gold tracking-wider">BTW</span>
                <p className="text-xs text-zinc-500 mt-1">By The Wave · Premium Car Rental</p>
              </div>
              <p className="text-xs text-zinc-600">
                © {new Date().getFullYear()} By The Wave. All rights reserved.
              </p>
              <div className="flex gap-4 text-xs text-zinc-500">
                <a href="/terms" className="hover:text-gold transition-colors">Terms</a>
                <a href="/privacy" className="hover:text-gold transition-colors">Privacy</a>
                <a href="/#contact" className="hover:text-gold transition-colors">Contact</a>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
