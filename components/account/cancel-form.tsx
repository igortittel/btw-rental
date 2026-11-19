'use client'

import { useLocale, useTranslations } from 'next-intl'
import { controlClass } from '@/components/booking/fields'
import { useFormAction } from '@/components/use-form-action'
import { cancelMyBookingAction, type AccountState } from '@/lib/account/actions'
import { formatEuro } from '@/lib/format'

const initial: AccountState = {}

/**
 * Cancellation by the customer. The fee shown is a preview; the database calculates
 * the binding amount at the moment of cancellation.
 */
export function CancelBookingForm({ id, feeCents, feePercent }: { id: string; feeCents: number; feePercent: number }) {
  const t = useTranslations('account')
  const locale = useLocale()
  const { state, pending, onSubmit } = useFormAction(cancelMyBookingAction, initial)
  const fee = feeCents > 0 ? formatEuro(feeCents, locale) : null

  if (state.ok) {
    return (
      <p role="status" className="rounded-lg border border-gold/60 bg-gold/10 px-4 py-3 text-[15px] text-white">
        {state.feeCents ? t('cancelDoneFee', { fee: formatEuro(state.feeCents, locale) }) : t('cancelDone')}
      </p>
    )
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="id" value={id} />
      <p className={`rounded-lg border px-4 py-3 text-[15px] ${fee ? 'border-amber-400/60 bg-amber-400/10 text-amber-100' : 'border-line text-white'}`}>
        {fee ? t('cancelFeeLine', { fee, percent: feePercent }) : t('cancelFree')}
      </p>
      <div>
        <label htmlFor="cancel-reason" className="mb-1.5 block text-sm font-medium text-white">
          {t('cancelReason')} <span className="font-normal text-muted2">({t('optional')})</span>
        </label>
        <textarea id="cancel-reason" name="reason" rows={2} maxLength={500} className={`${controlClass} h-auto py-2.5`} />
      </div>
      <label htmlFor="cancel-confirm" className="flex min-h-11 cursor-pointer items-start gap-3 text-[15px] leading-6 text-white">
        <input id="cancel-confirm" name="confirm" type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-gold" />
        <span>{t('cancelConfirm', { fee: fee ?? 'none' })}</span>
      </label>
      {state.error ? (
        <p role="alert" className="rounded-lg border border-red-400/60 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {t.has(`errors.${state.error}`) ? t(`errors.${state.error}`) : t('errors.unknown')}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-red-400/70 px-6 text-base font-semibold text-red-100 transition-colors hover:bg-red-500/10 disabled:opacity-60 sm:w-auto"
      >
        {pending ? t('cancelPending') : t('cancelSubmit')}
      </button>
    </form>
  )
}
