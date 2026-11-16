import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { AuthCard } from '@/components/auth/auth-card'
import { RequestLinkForm } from '@/components/auth/auth-forms'
import { Link } from '@/i18n/navigation'

export const metadata: Metadata = { title: 'Zabudnuté heslo', robots: { index: false, follow: false } }

export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('auth')

  return (
    <AuthCard
      title={t('forgotTitle')}
      lead={t('forgotLead')}
      footer={
        <Link href="/prihlasenie" className="text-gold underline-offset-4 hover:underline">
          {t('backToLogin')}
        </Link>
      }
    >
      <RequestLinkForm submitLabel={t('submitForgot')} />
    </AuthCard>
  )
}
