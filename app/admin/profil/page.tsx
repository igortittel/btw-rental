import type { Metadata } from 'next'
import { ChangePasswordForm } from '@/components/admin/change-password-form'
import { STAFF_ROLE_LABELS } from '@/lib/auth/roles'
import { requireStaff } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Môj profil' }

export default async function AdminProfilePage() {
  const user = await requireStaff('operator', '/admin/profil')

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold tracking-wide text-white">Môj profil</h1>
      <dl className="grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted2">Meno</dt>
        <dd className="text-white">{[user.firstName, user.lastName].filter(Boolean).join(' ') || '—'}</dd>
        <dt className="text-muted2">E-mail</dt>
        <dd className="break-all text-white">{user.email}</dd>
        <dt className="text-muted2">Rola</dt>
        <dd className="text-white">{STAFF_ROLE_LABELS[user.role]}</dd>
      </dl>
      <section className="rounded-xl border border-gold/50 bg-surface p-6">
        <h2 className="mb-6 text-lg font-bold text-white">Zmena hesla</h2>
        <ChangePasswordForm />
      </section>
    </div>
  )
}
