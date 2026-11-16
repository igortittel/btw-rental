import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { logoutAction } from '@/lib/auth/actions'
import { hasRole, STAFF_ROLE_LABELS } from '@/lib/auth/roles'
import { requireStaff } from '@/lib/auth/session'

export const metadata: Metadata = {
  title: { default: 'Administrácia', template: '%s | BTW Rental admin' },
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff('operator')
  const links = [
    { href: '/admin', label: 'Prehľad', show: true },
    { href: '/admin/zamestnanci', label: 'Zamestnanci', show: hasRole(user.role, 'owner') },
    { href: '/admin/profil', label: 'Môj profil', show: true },
  ]

  return (
    <div className="min-h-screen bg-[#111111]">
      <header className="border-b border-gold/40 bg-black">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <Link href="/admin" className="flex items-center gap-3">
            <Image src="/images/logo.svg" alt="BY THE WAVE" width={96} height={32} className="h-8 w-auto" />
            <span className="text-sm font-semibold uppercase tracking-widest text-gold">Admin</span>
          </Link>
          <nav aria-label="Administrácia" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {links
              .filter((l) => l.show)
              .map((l) => (
                <Link key={l.href} href={l.href} className="py-2 text-muted2 transition-colors hover:text-white">
                  {l.label}
                </Link>
              ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted2">
              {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email} · {STAFF_ROLE_LABELS[user.role]}
            </span>
            <form action={logoutAction}>
              <Button type="submit" variant="outline" size="sm">
                Odhlásiť sa
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  )
}
