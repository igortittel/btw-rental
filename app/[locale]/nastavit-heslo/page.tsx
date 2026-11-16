import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { AuthCard } from '@/components/auth/auth-card'
import { RequestLinkForm, SetPasswordForm } from '@/components/auth/auth-forms'
import { Link } from '@/i18n/navigation'
import { safeNextPath } from '@/lib/auth/roles'
import { peekAuthToken } from '@/lib/auth/tokens'

export const metadata: Metadata = {
  title: 'Nastavenie hesla',
  robots: { index: false, follow: false },
  // The token is in the URL: never send it on to other sites.
  referrer: 'no-referrer',
}

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ token?: string; next?: string }> }

export default async function SetPasswordPage({ params, searchParams }: Props) {
  const [{ locale }, { token, next }] = await Promise.all([params, searchParams])
  setRequestLocale(locale)
  const t = await getTranslations('auth')

  const valid = token ? await peekAuthToken(token) : null
  const backLink = (
    <Link href="/prihlasenie" className="text-gold underline-offset-4 hover:underline">
      {t('backToLogin')}
    </Link>
  )

  if (!token || !valid) {
    return (
      <AuthCard title={t('expiredTitle')} lead={t('expiredLead')} footer={backLink}>
        <RequestLinkForm submitLabel={t('submitResend')} />
      </AuthCard>
    )
  }

  return (
    <AuthCard title={t('setTitle')} lead={t('setLead')} footer={backLink}>
      <SetPasswordForm token={token} next={next ? safeNextPath(next, '') || undefined : undefined} />
    </AuthCard>
  )
}
