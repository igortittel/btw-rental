import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: '404', robots: { index: false, follow: false } }

// Fallback for addresses outside the localised routes (e.g. /a/b/c); bilingual because the language is unknown.
export default function RootNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#111111] px-6 text-center">
      <div className="max-w-xl">
        <p className="text-sm font-semibold uppercase tracking-widest text-gold">404</p>
        <h1 className="mt-3 text-3xl font-bold tracking-wide text-white">Stránka sa nenašla · Page not found</h1>
        <p className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className="inline-flex h-12 items-center rounded-lg bg-gold px-6 font-semibold text-white hover:bg-gold-hover">
            Ponuka vozidiel
          </Link>
          <Link href="/en" className="inline-flex h-12 items-center rounded-lg border border-gold px-6 font-semibold text-white hover:bg-gold/15">
            Our vehicles
          </Link>
        </p>
      </div>
    </main>
  )
}
