import { ADMIN_URL } from '@/lib/admin-url'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { AuthCard } from '@/components/auth/auth-card'
import { LoginForm } from '@/components/auth/auth-forms'
import { localizedPath } from '@/i18n/routing'
import { safeNextPath } from '@/lib/auth/roles'
import { getSessionUser } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Prihlásenie', robots: { index: false, follow: false } }

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string }> }

export default async function LoginPage({ params, searchParams }: Props) {
  const [{ locale }, { next }] = await Promise.all([params, searchParams])
  setRequestLocale(locale)

  const user = await getSessionUser()
  if (user) redirect(user.role ? ADMIN_URL : localizedPath(locale, '/moj-ucet'))

  const t = await getTranslations('auth')
  const safeNext = next ? safeNextPath(next, '') : ''

  return (
    <AuthCard title={t('loginTitle')} lead={t('loginLead')}>
      <LoginForm next={safeNext || undefined} />
    </AuthCard>
  )
}
