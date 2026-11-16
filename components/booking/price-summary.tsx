'use client'

import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { formatEuro } from '@/lib/format'
import type { PriceBreakdown } from '@/lib/pricing'
import type { BookingLocation, BookingVehicle } from './types'

type Props = {
  vehicle: BookingVehicle | null
  price: PriceBreakdown | null
  pickupLabel: string | null
  returnLabel: string | null
  pickupLocation: BookingLocation | null
  returnLocation: BookingLocation | null
  /** Own delivery / collection address: free within Bratislava, individual outside it. */
  delivery?: 'city' | 'outside' | null
}

/** Price lines + totals; used in the sidebar, the mobile sheet and step 3. */
export function PriceLines({ vehicle, price, pickupLocation, returnLocation, delivery }: Pick<Props, 'vehicle' | 'price' | 'pickupLocation' | 'returnLocation' | 'delivery'>) {
  const t = useTranslations('booking')
  const locale = useLocale()
  if (!price || !vehicle) return null
  const euro = (cents: number) => formatEuro(cents, locale)
  const pick = (name: { sk?: string; en?: string }) => (locale === 'en' ? name.en : name.sk) || name.sk || name.en || ''
  const row = 'flex items-baseline justify-between gap-4 py-1.5 text-[15px]'

  return (
    <div>
      <dl>
        <div className={row}>
          <dt className="text-muted2">{price.ratePerDayCents !== null ? t('rentalLine', { days: price.days, rate: euro(price.ratePerDayCents) }) : t('rentalIndividual', { days: price.days })}</dt>
          <dd className="shrink-0 text-white">{price.rentalCents !== null ? euro(price.rentalCents) : t('individualPrice')}</dd>
        </div>
        {price.extras.map((line) => (
          <div key={line.extraId} className={row}>
            <dt className="text-muted2">
              {pick(line.name)}
              {line.quantity > 1 ? ` (${t('pieces', { count: line.quantity })})` : ''}
            </dt>
            <dd className="shrink-0 text-white">{euro(line.totalCents)}</dd>
          </div>
        ))}
        {delivery ? (
          <div className={row}>
            <dt className="text-muted2">{t(delivery === 'outside' ? 'deliveryOutside' : 'delivery')}</dt>
            <dd className="shrink-0 text-right text-white">{t(delivery === 'outside' ? 'deliveryIndividual' : 'deliveryFree')}</dd>
          </div>
        ) : null}
        {price.pickupSurchargeCents > 0 && pickupLocation ? (
          <div className={row}>
            <dt className="text-muted2">
              {t('pickupSurcharge')} – {pickupLocation.name}
            </dt>
            <dd className="shrink-0 text-white">{euro(price.pickupSurchargeCents)}</dd>
          </div>
        ) : null}
        {price.returnSurchargeCents > 0 && returnLocation ? (
          <div className={row}>
            <dt className="text-muted2">
              {t('returnSurcharge')} – {returnLocation.name}
            </dt>
            <dd className="shrink-0 text-white">{euro(price.returnSurchargeCents)}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-2 border-t border-gold/40 pt-3">
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-semibold text-white">{t('total')}</span>
          <span className="text-xl font-bold text-white">{price.totalCents !== null ? euro(price.totalCents) : t('individualPrice')}</span>
        </div>
        {price.totalCents !== null && price.netCents !== null && price.vatCents !== null ? (
          <dl className="mt-1 text-sm text-muted2">
            <div className="flex justify-between gap-4">
              <dt>{t('net')}</dt>
              <dd>{euro(price.netCents)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t('vat', { rate: price.vatRate })}</dt>
              <dd>{euro(price.vatCents)}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-1 text-sm text-muted2">{t('individualPriceHint')}</p>
        )}
        <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-line pt-3 text-[15px]">
          <span className="text-muted2">
            {t('deposit')} <span className="text-sm">({t('depositHint')})</span>
          </span>
          <span className="shrink-0 text-white">{euro(vehicle.depositCents)}</span>
        </div>
      </div>
    </div>
  )
}

function SummaryBody({ vehicle, price, pickupLabel, returnLabel, pickupLocation, returnLocation, delivery }: Props) {
  const t = useTranslations('booking')
  const locale = useLocale()
  if (!vehicle) return <p className="text-[15px] text-muted2">{t('summaryEmpty')}</p>
  return (
    <div>
      <div className="flex items-center gap-4">
        {vehicle.imageUrl ? (
          <div className="relative h-16 w-24 shrink-0">
            <Image src={vehicle.imageUrl} alt="" fill sizes="96px" className="object-contain" />
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-gold">{vehicle.categoryName}</p>
          <p className="font-bold text-white">{vehicle.name}</p>
        </div>
      </div>
      {pickupLabel && returnLabel ? (
        <dl className="mt-4 space-y-1 border-t border-line pt-4 text-[15px]">
          <div className="flex justify-between gap-4">
            <dt className="text-muted2">{t('reviewPickup')}</dt>
            <dd className="text-right text-white">{pickupLabel}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted2">{t('reviewReturn')}</dt>
            <dd className="text-right text-white">{returnLabel}</dd>
          </div>
        </dl>
      ) : null}
      <div className="mt-4 border-t border-line pt-3">
        {price ? (
          <PriceLines vehicle={vehicle} price={price} pickupLocation={pickupLocation} returnLocation={returnLocation} delivery={delivery} />
        ) : (
          <p className="text-[15px] text-muted2">
            {vehicle.priceFromCents !== null ? `${t('summaryFrom', { price: formatEuro(vehicle.priceFromCents, locale) })}. ` : ''}
            {t('summaryEmpty')}
          </p>
        )}
      </div>
    </div>
  )
}

/** Running price summary: a sticky card on desktop, a sticky bar with an expandable sheet on phones. */
export function PriceSummary(props: Props) {
  const t = useTranslations('booking')
  const locale = useLocale()
  const { price, vehicle } = props
  const headline = !vehicle || !price ? t('summaryEmpty') : price.totalCents !== null ? formatEuro(price.totalCents, locale) : t('individualPrice')

  return (
    <>
      <aside aria-label={t('summary')} className="hidden lg:block">
        <div className="sticky top-28 rounded-xl border border-gold/60 bg-surface p-6">
          <h2 className="mb-4 text-lg font-bold text-white">{t('summary')}</h2>
          <SummaryBody {...props} />
        </div>
      </aside>

      <details className="group fixed inset-x-0 bottom-0 z-40 border-t border-gold/60 bg-[#111111] lg:hidden">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-xs text-muted2">{vehicle && price ? `${t('total')} · ${t('days', { count: price.days })}` : t('summary')}</span>
            <span className={`block truncate text-white ${vehicle && price ? 'text-lg font-bold' : 'text-sm'}`}>{headline}</span>
          </span>
          <span className="shrink-0 rounded-lg border border-gold px-3 py-2 text-sm font-semibold text-white">
            <span className="group-open:hidden">{t('showDetails')}</span>
            <span className="hidden group-open:inline">{t('hideDetails')}</span>
          </span>
        </summary>
        <div className="max-h-[60vh] overflow-y-auto border-t border-line px-5 pb-5 pt-4">
          <SummaryBody {...props} />
        </div>
      </details>
    </>
  )
}
