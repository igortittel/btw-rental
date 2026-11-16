import type { Metadata } from 'next'
import { AdminNav } from '@/components/admin/admin-nav'
import { hasRole, STAFF_ROLE_LABELS } from '@/lib/auth/roles'
import { requireStaff } from '@/lib/auth/session'

export const metadata: Metadata = {
  title: { default: 'Administrácia', template: '%s | BTW Rental admin' },
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff('operator')
  const primary = [
    { href: '/admin', label: 'Prehľad' },
    { href: '/admin/rezervacie', label: 'Rezervácie' },
    { href: '/admin/vozidla', label: 'Vozidlá' },
  ]
  const secondary = [
    { href: '/admin/kategorie', label: 'Kategórie' },
    { href: '/admin/priplatky', label: 'Príplatky' },
    { href: '/admin/miesta', label: 'Miesta' },
    { href: '/admin/emaily', label: 'E-maily' },
    ...(hasRole(user.role, 'owner')
      ? [
          { href: '/admin/nastavenia', label: 'Nastavenia' },
          { href: '/admin/zamestnanci', label: 'Zamestnanci' },
        ]
      : []),
  ]

  return (
    <div className="min-h-screen bg-[#111111]">
      <AdminNav primary={primary} secondary={secondary} userName={[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email} roleLabel={STAFF_ROLE_LABELS[user.role]} />
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 md:pb-12 md:pt-8">{children}</main>
    </div>
  )
}
