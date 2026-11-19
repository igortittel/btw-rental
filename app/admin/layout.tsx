import type { Metadata } from 'next'
import { AdminNav } from '@/components/admin/admin-nav'
import { TwoFactorGate } from '@/components/admin/two-factor-gate'
import { SkipLink } from '@/components/site/skip-link'
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
    { href: '/admin/zakaznici', label: 'Zákazníci' },
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
          { href: '/admin/audit', label: 'Audit log' },
        ]
      : []),
  ]

  // Second factor: until the session is verified with TOTP (aal2), the admin shows only
  // the 2FA step. Server actions and API routes refuse aal1 sessions on their own (getStaff).
  if (user.aal !== 'aal2') {
    return (
      <div className="min-h-screen bg-[#111111] px-4 py-10 sm:py-16">
        <TwoFactorGate userName={user.firstName} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#111111]">
      <SkipLink label="Preskočiť na obsah" />
      <AdminNav primary={primary} secondary={secondary} userName={[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email} roleLabel={STAFF_ROLE_LABELS[user.role]} />
      <main id="obsah" tabIndex={-1} className="mx-auto max-w-6xl px-4 pb-28 pt-6 focus:outline-none sm:px-6 md:pb-12 md:pt-8">
        {children}
      </main>
    </div>
  )
}
