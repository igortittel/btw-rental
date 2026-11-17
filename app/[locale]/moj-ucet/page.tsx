import type { Metadata } from 'next'
import Image from 'next/image'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { localizedPath } from '@/i18n/routing'
import { CUSTOMER_STATUS_CLASS, isCurrentBooking } from '@/lib/account/view'
import { logoutAction } from '@/lib/auth/actions'
import { requireUser } from '@/lib/auth/session'
import { getCatalog } from '@/lib/catalog'
import { formatEuro } from '@/lib/format'
import { vehicleImageUrl } from '@/lib/storage'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/time'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'account' })
  return { title: t('title'), robots: { index: false, follow: false } }
}

/** Customer area: current and past bookings of the signed-in customer (RLS returns only their own). */
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await requireUser(localizedPath(locale, '/moj-ucet'))
  const [t, site, catalog] = await Promise.all([getTranslations('account'), getTranslations('site'), getCatalog()])
  const supabase = await createClient()
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, number, status, pickup_at, return_at, days, total_cents, vehicle_id, price_snapshot')
    .eq('customer_id', user.id)
    .order('pickup_at', { ascending: false })
  const all = bookings ?? []
  const groups = [
    { title: t('upcoming'), items: all.filter((b) => isCurrentBooking(b.status)).reverse() },
    { title: t('past'), items: all.filter((b) => !isCurrentBooking(b.status)) },
  ].filter((group) => group.items.length > 0)
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ')
  const outline = 'inline-flex h-11 items-center justify-center rounded-lg border border-gold px-5 text-sm font-semibold text-white transition-colors hover:bg-gold/15'

  return (
    <section className="mx-auto max-w-3xl px-4 pb-20 pt-28 sm:px-6">
      <h1 className="text-3xl font-bold tracking-wide text-white">{name ? t('greeting', { name }) : t('greetingAnonymous')}</h1>
      <p className="mt-2 text-sm text-muted2">{t('signedInAs', { email: user.email })}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/" className="inline-flex h-11 items-center justify-center rounded-lg bg-gold px-5 text-sm font-semibold text-white transition-colors hover:bg-gold-hover">
          {t('newBooking')}
        </Link>
        <Link href="/moj-ucet/profil" className={outline}>
          {t('profileLink')}
        </Link>
        {user.role ? (
          <a href="/admin" className={outline}>
            {t('goToAdmin')}
          </a>
        ) : null}
      </div>

      <h2 className="mt-10 text-xl font-bold text-white">{t('bookingsTitle')}</h2>
      {all.length === 0 ? <p className="mt-3 rounded-xl border border-gold/40 bg-surface p-6 text-sm text-muted2">{t('bookingsEmpty')}</p> : null}
      {groups.map((group) => (
        <div key={group.title} className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gold">{group.title}</h3>
          <ul className="mt-3 space-y-3">
            {group.items.map((booking) => {
              const vehicle = catalog.vehicles.find((v) => v.id === booking.vehicle_id)
              const vehicleName = vehicle?.name ?? ((booking.price_snapshot ?? {}) as { vehicle?: { name?: string } }).vehicle?.name ?? ''
              const image = vehicle?.images[0]
              return (
                <li key={booking.id}>
                  <Link href={`/moj-ucet/rezervacie/${booking.id}`} className="flex items-center gap-4 rounded-xl border border-gold/40 bg-surface p-4 transition-colors hover:border-gold">
                    {image ? (
                      <div className="relative hidden h-16 w-24 shrink-0 sm:block">
                        <Image src={vehicleImageUrl(image.path)} alt="" fill sizes="96px" className="object-contain" />
                      </div>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-bold text-white">{vehicleName}</span>
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${CUSTOMER_STATUS_CLASS[booking.status]}`}>{t(`status.${booking.status}`)}</span>
                      </div>
                      <p className="mt-1 text-sm text-white">
                        {formatDateTime(booking.pickup_at, locale)} – {formatDateTime(booking.return_at, locale)}
                      </p>
                      <p className="mt-0.5 text-sm text-muted2">
                        {booking.number} · {t('days', { count: booking.days })}
                        {booking.total_cents !== null ? ` · ${formatEuro(booking.total_cents, locale)}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-gold" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      <form action={logoutAction} className="mt-10 border-t border-line pt-6">
        <input type="hidden" name="locale" value={locale} />
        <button type="submit" className="text-sm text-muted2 underline-offset-4 hover:text-white hover:underline">
          {site('logout')}
        </button>
      </form>
    </section>
  )
}
