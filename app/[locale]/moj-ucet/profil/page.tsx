import { formatIban } from '@/lib/iban'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { DeleteAccountForm, PasswordForm, ProfileForm } from '@/components/account/profile-forms'
import { Link } from '@/i18n/navigation'
import { localizedPath } from '@/i18n/routing'
import type { ProfileValues } from '@/lib/account/actions'
import { requireUser } from '@/lib/auth/session'
import { COUNTRY_CODES, PHONE_PREFIXES } from '@/lib/booking/countries'
import { splitPhone } from '@/lib/booking/phone'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/time'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'account.profile' })
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await requireUser(localizedPath(locale, '/moj-ucet/profil'))
  const [t, a] = await Promise.all([getTranslations('account.profile'), getTranslations('account')])
  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('first_name, last_name, phone, is_company, company_name, ico, dic, ic_dph, billing_address, refund_iban, deletion_requested_at').eq('id', user.id).maybeSingle()
  const address = (profile?.billing_address ?? {}) as { street?: string; city?: string; zip?: string; country?: string }
  const initial: ProfileValues = {
    firstName: profile?.first_name ?? '',
    lastName: profile?.last_name ?? '',
    phonePrefix: PHONE_PREFIXES[0].dial,
    phoneNumber: '',
    ...(splitPhone(profile?.phone) ?? {}),
    isCompany: !!profile?.is_company,
    companyName: profile?.company_name ?? '',
    ico: profile?.ico ?? '',
    dic: profile?.dic ?? '',
    icDph: profile?.ic_dph ?? '',
    street: address.street ?? '',
    city: address.city ?? '',
    zip: address.zip ?? '',
    country: (COUNTRY_CODES as readonly string[]).includes(address.country ?? '') ? (address.country as ProfileValues['country']) : 'SK',
    refundIban: profile?.refund_iban ? formatIban(profile.refund_iban) : '',
  }
  const card = 'rounded-xl border border-gold/40 bg-surface p-5 sm:p-6'

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-4 pb-20 pt-28 sm:px-6">
      <Link href="/moj-ucet" className="inline-flex min-h-11 items-center text-sm text-muted2 hover:text-white">
        ← {a('back')}
      </Link>
      <h1 className="text-2xl font-bold tracking-wide text-white sm:text-3xl">{t('title')}</h1>
      <ProfileForm email={user.email} initial={initial} />
      <div className={card}>
        <h2 className="mb-4 text-lg font-bold text-white">{t('password')}</h2>
        <PasswordForm />
      </div>
      <div className={card}>
        <h2 className="text-lg font-bold text-white">{t('delete')}</h2>
        <p className="mb-4 mt-2 text-sm leading-6 text-muted2">{t('deleteLead')}</p>
        {profile?.deletion_requested_at ? (
          <p role="status" className="rounded-lg border border-gold/60 bg-gold/10 px-4 py-3 text-sm text-white">
            {t('deleteRequested', { date: formatDate(profile.deletion_requested_at, locale) })}
          </p>
        ) : (
          <DeleteAccountForm />
        )}
      </div>
    </section>
  )
}
