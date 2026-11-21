'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { AvailabilityCalendar, type DateRange } from '@/components/catalog/availability-calendar'
import { Link } from '@/i18n/navigation'
import { formatEuro } from '@/lib/format'
import { calculatePrice, type PricingTier } from '@/lib/pricing'
import { formatDate, zonedLocalToUtc } from '@/lib/time'

export type CalendarPricing = { tiers: PricingTier[]; vatRate: number; toleranceMinutes: number; individualFromDays: number }

/**
 * Interactive calendar of the vehicle detail: pick a term, see the base price for it (rental
 * only, without extras – the same calculatePrice() as the booking), then continue to the
 * booking form with it.
 */
export function BookingCalendar({ vin, minDate, pricing }: { vin: string; minDate: string; pricing: CalendarPricing }) {
  const t = useTranslations('vehicle')
  const locale = useLocale()
  const [range, setRange] = useState<DateRange | null>(null)
  // Same time on both days (the booking form's default), so the days are the calendar difference.
  const pickupAt = range ? zonedLocalToUtc(`${range.from}T10:00`) : null
  const returnAt = range ? zonedLocalToUtc(`${range.to}T10:00`) : null
  const price =
    pickupAt && returnAt
      ? calculatePrice({
          pickupAt,
          returnAt,
          tiers: pricing.tiers,
          extras: [],
          pickupSurchargeCents: 0,
          returnSurchargeCents: 0,
          vatRate: pricing.vatRate,
          toleranceMinutes: pricing.toleranceMinutes,
          individualFromDays: pricing.individualFromDays,
        })
      : null
  const days = price?.days ?? 0
  const href = range ? `/rezervacia?${new URLSearchParams({ vozidlo: vin, od: range.from, do: range.to })}` : `/rezervacia?vozidlo=${vin}`

  return (
    <div>
      <AvailabilityCalendar vin={vin} value={range} onChange={setRange} minDate={minDate} />
      <div className="mt-6 flex flex-col items-center gap-4 border-t border-line pt-6 text-center sm:flex-row sm:justify-between sm:text-left" aria-live="polite">
        <p className="text-[15px] text-white">
          {range ? (
            <>
              <span className="text-muted2">{t('selectedTerm')}:</span>{' '}
              <strong>
                {formatDate(`${range.from}T12:00:00Z`, locale)} – {formatDate(`${range.to}T12:00:00Z`, locale)}
              </strong>{' '}
              <span className="text-muted2">({t('tierSame', { count: days })})</span>
              {price ? (
                <span className="mt-1 block">
                  <span className="text-muted2">{t('basePrice')}:</span>{' '}
                  {price.rentalCents !== null && price.ratePerDayCents !== null ? (
                    <>
                      <strong>{formatEuro(price.rentalCents, locale)}</strong>{' '}
                      <span className="text-muted2">({t('basePriceDetail', { count: days, rate: formatEuro(price.ratePerDayCents, locale) })})</span>
                    </>
                  ) : (
                    <strong>{t('individualPrice')}</strong>
                  )}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-muted2">{t('selectTermHint')}</span>
          )}
        </p>
        <Link
          href={href}
          rel="nofollow"
          className={`inline-flex h-12 w-full shrink-0 items-center justify-center rounded-lg px-8 text-base font-semibold text-white transition-colors sm:w-auto ${range ? 'bg-gold hover:bg-gold-hover' : 'border border-gold hover:bg-gold/15'}`}
        >
          {range ? t('bookTerm') : t('book')}
        </Link>
      </div>
    </div>
  )
}
