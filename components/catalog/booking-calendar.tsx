'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { AvailabilityCalendar, type DateRange } from '@/components/catalog/availability-calendar'
import { Link } from '@/i18n/navigation'
import { formatDate } from '@/lib/time'

/** Interactive calendar of the vehicle detail: pick a term, then continue to the booking form with it. */
export function BookingCalendar({ vin, minDate }: { vin: string; minDate: string }) {
  const t = useTranslations('vehicle')
  const locale = useLocale()
  const [range, setRange] = useState<DateRange | null>(null)
  const days = range ? Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) : 0
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
