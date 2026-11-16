import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { CancelBookingForm } from '@/components/account/cancel-form'
import { Countdown } from '@/components/account/countdown'
import { Link } from '@/i18n/navigation'
import { localizedPath } from '@/i18n/routing'
import { CUSTOMER_STATUS_CLASS, mapsUrl } from '@/lib/account/view'
import { requireUser } from '@/lib/auth/session'
import { canTransition } from '@/lib/booking-status'
import { customerEditBlock, describeBookingChange, type ChangeableBooking } from '@/lib/booking/change'
import { cancellationQuote } from '@/lib/cancellation'
import { getCatalog, localize } from '@/lib/catalog'
import { formatEuro } from '@/lib/format'
import { variableSymbol } from '@/lib/payment'
import type { PriceBreakdown } from '@/lib/pricing'
import { vehicleImageUrl } from '@/lib/storage'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/time'

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ zmena?: string }> }
type Localized = { sk?: string; en?: string }
type Snapshot = Partial<PriceBreakdown> & { vehicle?: { name?: string }; pickup_location?: { name: Localized; address: string }; return_location?: { name: Localized; address: string }; delivery_outside_city?: boolean }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'account' })
  return { title: t('bookingsTitle'), robots: { index: false, follow: false } }
}

/** One booking of the signed-in customer: countdown, vehicle, term, price, payment, contacts, change and cancellation. */
export default async function MyBookingPage({ params, searchParams }: Props) {
  const [{ locale, id }, { zmena }] = await Promise.all([params, searchParams])
  setRequestLocale(locale)
  const user = await requireUser(localizedPath(locale, `/moj-ucet/rezervacie/${id}`))
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const supabase = await createClient()
  const [{ data: booking }, { data: extras }, catalog, t, c] = await Promise.all([
    // RLS already limits this to the customer's own bookings; the filter makes it explicit (staff would otherwise see any booking here).
    supabase.from('bookings').select('*').eq('id', id).eq('customer_id', user.id).maybeSingle(),
    supabase.from('booking_extras').select('id, name_snapshot, quantity, total_cents').eq('booking_id', id),
    getCatalog(),
    getTranslations('account'),
    getTranslations('catalog'),
  ])
  if (!booking) notFound()

  const { settings } = catalog
  const snapshot = (booking.price_snapshot ?? {}) as Snapshot
  const vehicle = catalog.vehicles.find((v) => v.id === booking.vehicle_id)
  const vehicleName = vehicle?.name ?? snapshot.vehicle?.name ?? ''
  const image = vehicle?.images[0]
  const euro = (cents: number) => formatEuro(cents, locale)
  const status = booking.status
  const showPlate = status === 'confirmed' || status === 'modified' || status === 'active'
  const { data: plate } = showPlate ? await supabase.rpc('my_booking_plate', { p_booking_id: id }) : { data: null }

  const place = (kind: 'pickup' | 'return') => {
    const custom = kind === 'pickup' ? booking.pickup_custom_address : booking.return_custom_address
    const location = kind === 'pickup' ? snapshot.pickup_location : snapshot.return_location
    const address = custom ?? location?.address ?? ''
    return { name: custom ? t('ownAddress') : localize(location?.name ?? {}, locale), address }
  }
  const pickup = place('pickup')
  const ret = place('return')
  const hasDelivery = !!(booking.pickup_custom_address || booking.return_custom_address)

  const editBlock = customerEditBlock(booking, settings.modification_deadline_hours)
  const cancellable = canTransition(status, 'cancelled')
  const quote = cancellationQuote(new Date(booking.pickup_at), booking.total_cents, settings.cancellation_tiers)
  const tiers = [...settings.cancellation_tiers].sort((a, b) => b.min_hours - a.min_hours)
  const pending = status === 'modified' ? (booking.pending_change as { booking?: ChangeableBooking; extras?: { name_snapshot: unknown; quantity: number }[] } | null) : null
  const changes = pending?.booking ? describeBookingChange(booking, extras ?? [], pending.booking, pending.extras ?? [], locale === 'en' ? 'en' : 'sk') : []
  const assistance = vehicle ? ((await supabase.from('public_vehicles').select('assistance_phone').eq('id', vehicle.id).maybeSingle()).data?.assistance_phone ?? null) : null

  const card = 'rounded-xl border border-gold/40 bg-surface p-5 sm:p-6'
  const h2 = 'text-lg font-bold text-white'
  const row = 'flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-2.5 text-[15px] last:border-0'
  const outline = 'inline-flex h-12 w-full items-center justify-center rounded-lg border border-gold px-6 text-base font-semibold text-white transition-colors hover:bg-gold/15 sm:w-auto'

  return (
    <section className="mx-auto max-w-3xl space-y-5 px-4 pb-20 pt-28 sm:px-6">
      <Link href="/moj-ucet" className="inline-flex min-h-11 items-center text-sm text-muted2 hover:text-white">
        ← {t('back')}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-wide text-white sm:text-3xl">{booking.number}</h1>
        <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${CUSTOMER_STATUS_CLASS[status]}`}>{t(`status.${status}`)}</span>
      </div>
      <p className="text-[15px] leading-6 text-muted2">{t(`statusHelp.${status}`)}</p>

      {zmena === 'caka' || zmena === 'ulozena' ? (
        <p role="status" className="rounded-lg border border-gold/60 bg-gold/10 px-4 py-3 text-[15px] text-white">
          {t(zmena === 'caka' ? 'changeWaiting' : 'changeSaved')}
        </p>
      ) : null}

      {status === 'new' || status === 'confirmed' || status === 'modified' ? (
        <Countdown target={booking.pickup_at} title={t('countdownPickup')} labels={{ days: t('countdownDays'), hours: t('countdownHours'), minutes: t('countdownMinutes'), done: t('countdownNow') }} />
      ) : status === 'active' ? (
        <Countdown target={booking.return_at} title={t('countdownReturn')} labels={{ days: t('countdownDays'), hours: t('countdownHours'), minutes: t('countdownMinutes'), done: t('countdownReturnNow') }} />
      ) : null}

      {status === 'cancelled' ? (
        <div className={card}>
          <dl>
            <div className={row}>
              <dt className="text-muted2">{t('cancelledFee')}</dt>
              <dd className="font-semibold text-white">{booking.cancellation_fee_cents ? euro(booking.cancellation_fee_cents) : t('cancelNoFee')}</dd>
            </div>
            {booking.cancellation_reason ? (
              <div className={row}>
                <dt className="text-muted2">{t('cancelledReason')}</dt>
                <dd className="text-right text-white">{booking.cancellation_reason}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      {changes.length > 0 ? (
        <div className={`${card} border-amber-400/60`}>
          <h2 className={h2}>{t('pendingTitle')}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[380px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted2">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-semibold" />
                  <th scope="col" className="py-2 pr-4 font-semibold">{t('pendingBefore')}</th>
                  <th scope="col" className="py-2 font-semibold">{t('pendingAfter')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {changes.map((change) => (
                  <tr key={change.label} className="align-top">
                    <th scope="row" className="py-2 pr-4 font-normal text-muted2">{change.label}</th>
                    <td className="py-2 pr-4 text-muted2">{change.before}</td>
                    <td className="py-2 font-semibold text-white">{change.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className={card}>
        <h2 className={h2}>{t('vehicle')}</h2>
        <div className="mt-4 flex items-center gap-5">
          {image ? (
            <div className="relative h-24 w-36 shrink-0">
              <Image src={vehicleImageUrl(image.path)} alt="" fill sizes="144px" className="object-contain" />
            </div>
          ) : null}
          <div className="min-w-0">
            <p className="text-lg font-bold text-white">{vehicleName}</p>
            {vehicle ? (
              <p className="mt-1 text-sm text-muted2">
                {[c(`fuelLabels.${vehicle.fuel}`), c(`transmissionLabels.${vehicle.transmission}`), c('seatsCount', { count: vehicle.seats })].join(' · ')}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-white">
              {plate ? (
                <>
                  <span className="text-muted2">{t('plate')}:</span> <strong className="tracking-wider">{plate}</strong>
                </>
              ) : (
                <span className="text-muted2">{t('plateAfter')}</span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className={card}>
        <h2 className={h2}>{t('term')}</h2>
        <dl className="mt-3">
          {(
            [
              [t('pickup'), booking.pickup_at, pickup],
              [t('return'), booking.return_at, ret],
            ] as const
          ).map(([label, at, where]) => (
            <div key={label} className={row}>
              <dt className="text-muted2">{label}</dt>
              <dd className="text-right text-white">
                <strong>{formatDateTime(at, locale)}</strong>
                <br />
                <span className="text-muted2">{[where.name, where.address].filter(Boolean).join(', ')}</span>
                {where.address ? (
                  <>
                    <br />
                    <a href={mapsUrl(where.address)} target="_blank" rel="noopener" className="text-sm text-gold underline-offset-4 hover:underline">
                      {t('map')}
                    </a>
                  </>
                ) : null}
              </dd>
            </div>
          ))}
          <div className={row}>
            <dt className="text-muted2">{t('length')}</dt>
            <dd className="text-white">{t('days', { count: booking.days })}</dd>
          </div>
          {booking.abroad_trip ? (
            <div className={row}>
              <dt className="text-muted2">{t('abroad')}</dt>
              <dd className="text-right text-white">{booking.abroad_countries || '✓'}</dd>
            </div>
          ) : null}
          {booking.customer_note ? (
            <div className={row}>
              <dt className="text-muted2">{t('note')}</dt>
              <dd className="max-w-[70%] whitespace-pre-line text-right text-white">{booking.customer_note}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className={card}>
        <h2 className={h2}>{t('price')}</h2>
        <dl className="mt-3">
          <div className={row}>
            <dt className="text-muted2">{snapshot.ratePerDayCents ? t('rentalLine', { days: booking.days, rate: euro(snapshot.ratePerDayCents) }) : t('rental')}</dt>
            <dd className="text-white">{booking.subtotal_cents !== null ? euro(booking.subtotal_cents) : '—'}</dd>
          </div>
          {(extras ?? []).map((extra) => (
            <div key={extra.id} className={row}>
              <dt className="text-muted2">
                {localize(extra.name_snapshot as Localized, locale)}
                {extra.quantity > 1 ? ` (${t('pieces', { count: extra.quantity })})` : ''}
              </dt>
              <dd className="text-white">{euro(extra.total_cents)}</dd>
            </div>
          ))}
          {hasDelivery ? (
            <div className={row}>
              <dt className="text-muted2">{t(snapshot.delivery_outside_city ? 'deliveryOutside' : 'delivery')}</dt>
              <dd className="text-white">{t(snapshot.delivery_outside_city ? 'deliveryIndividual' : 'deliveryFree')}</dd>
            </div>
          ) : null}
          <div className={`${row} !border-gold/40`}>
            <dt className="font-semibold text-white">{t('total')}</dt>
            <dd className="text-xl font-bold text-white">{booking.total_cents !== null ? euro(booking.total_cents) : t('individual')}</dd>
          </div>
          {booking.total_cents !== null && snapshot.netCents != null && snapshot.vatCents != null ? (
            <div className={row}>
              <dt className="text-sm text-muted2">
                {t('net')} / {t('vat', { rate: Number(booking.vat_rate) })}
              </dt>
              <dd className="text-sm text-muted2">
                {euro(snapshot.netCents)} / {euro(snapshot.vatCents)}
              </dd>
            </div>
          ) : null}
          <div className={row}>
            <dt className="text-muted2">{t('deposit')}</dt>
            <dd className="text-white">{euro(booking.deposit_cents)}</dd>
          </div>
        </dl>
      </div>

      {status !== 'cancelled' ? (
        <div className={card}>
          <h2 className={h2}>{t('payment')}</h2>
          <dl className="mt-3">
            <div className={row}>
              <dt className="text-muted2">{t('paymentRental')}</dt>
              <dd className="text-right text-white">
                {t(`methods.${booking.rental_payment_method}`)} · <strong>{t(`rentalStatus.${booking.rental_payment_status}`)}</strong>
              </dd>
            </div>
            <div className={row}>
              <dt className="text-muted2">{t('paymentDeposit')}</dt>
              <dd className="text-right text-white">
                {t(`methods.${booking.deposit_payment_method}`)} · <strong>{t(`depositStatus.${booking.deposit_status}`)}</strong>
              </dd>
            </div>
            {status !== 'new' && (booking.rental_payment_method === 'transfer' || booking.deposit_payment_method === 'transfer') ? (
              <div className={row}>
                <dt className="text-muted2">{t('variableSymbol')}</dt>
                <dd className="font-semibold tracking-wider text-white">{variableSymbol(booking.number)}</dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-3 text-sm text-muted2">{status === 'new' ? t('paymentAfterConfirm') : booking.rental_payment_method === 'transfer' || booking.deposit_payment_method === 'transfer' ? t('transferNote') : ''}</p>
        </div>
      ) : null}

      <div className={card}>
        <h2 className={h2}>{t('contact')}</h2>
        <p className="mt-3 text-[15px] leading-6 text-white">
          {settings.company.name}
          <br />
          <span className="text-muted2">{settings.company.address}</span>
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {settings.company.phone ? (
            <a href={`tel:${settings.company.phone.replace(/\s/g, '')}`} className={outline}>
              {t('call')} {settings.company.phone}
            </a>
          ) : null}
          {settings.company.email ? (
            <a href={`mailto:${settings.company.email}?subject=${encodeURIComponent(booking.number)}`} className={outline}>
              {t('email')}
            </a>
          ) : null}
        </div>
        {assistance && (status === 'confirmed' || status === 'modified' || status === 'active') ? (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-sm text-muted2">{t('assistance')}</p>
            <a href={`tel:${assistance.replace(/\s/g, '')}`} className={`${outline} mt-2`}>
              {t('call')} {assistance}
            </a>
          </div>
        ) : null}
      </div>

      {status === 'new' || status === 'confirmed' ? (
        <div className={card}>
          <h2 className={h2}>{t('edit')}</h2>
          {editBlock ? (
            <p className="mt-3 text-[15px] leading-6 text-muted2">{t(`editBlocked.${editBlock}`, { hours: settings.modification_deadline_hours })}</p>
          ) : (
            <>
              <p className="mt-3 text-[15px] leading-6 text-muted2">{t('editLead')}</p>
              <Link href={`/moj-ucet/rezervacie/${booking.id}/upravit`} className={`${outline} mt-4`}>
                {t('edit')}
              </Link>
            </>
          )}
        </div>
      ) : null}

      {cancellable ? (
        <div id="storno" className={`${card} scroll-mt-24`}>
          <h2 className={h2}>{t('cancelTitle')}</h2>
          <details className="mt-3 text-sm text-muted2">
            <summary className="flex min-h-11 cursor-pointer items-center text-gold">{t('cancelTiers')}</summary>
            <dl className="pb-2">
              {tiers.map((tier, index) => (
                <div key={tier.min_hours} className="flex justify-between gap-4 py-1">
                  <dt>{index === 0 ? t('cancelMoreThan', { hours: tier.min_hours }) : tier.min_hours > 0 ? t('cancelBetween', { from: tiers[index - 1].min_hours, to: tier.min_hours }) : t('cancelLessThan', { hours: tiers[index - 1]?.min_hours ?? 0 })}</dt>
                  <dd className="text-white">{tier.fee_percent === 0 ? t('cancelNoFee') : `${tier.fee_percent} %`}</dd>
                </div>
              ))}
            </dl>
          </details>
          <div className="mt-3">
            <CancelBookingForm id={booking.id} feeCents={quote.feeCents} feePercent={quote.feePercent} />
          </div>
        </div>
      ) : null}
    </section>
  )
}
