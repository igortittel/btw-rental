'use client'

import { changeBookingStatusAction } from '@/app/admin/rezervacie/actions'
import { Feedback } from '@/components/admin/ui'
import { useFormAction } from '@/components/use-form-action'
import { NEXT_STATUSES, STATUS_ACTION_LABELS, type BookingStatus } from '@/lib/booking/status'

const CONFIRM: Partial<Record<BookingStatus, string>> = {
  cancelled: 'Naozaj zrušiť rezerváciu {number}? Túto zmenu nie je možné vrátiť.',
  completed: 'Ukončiť rezerváciu {number}? Vozidlo sa uvoľní pre ďalšie termíny.',
}

/** One-tap status changes for a booking; large touch targets for use on a phone. */
export function BookingQuickActions({ id, number, status }: { id: string; number: string; status: BookingStatus }) {
  const { state, pending, onSubmit } = useFormAction(changeBookingStatusAction, {})
  const options = NEXT_STATUSES[status]
  if (options.length === 0) return null

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {options.map((to) => (
          <form
            key={to}
            className="flex-1"
            onSubmit={(event) => {
              const question = CONFIRM[to]
              if (question && !window.confirm(question.replace('{number}', number))) {
                event.preventDefault()
                return
              }
              onSubmit(event)
            }}
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="to" value={to} />
            <button
              type="submit"
              disabled={pending}
              className={`h-11 w-full whitespace-nowrap rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-60 ${
                to === 'cancelled' ? 'border border-red-400/60 text-red-200 hover:bg-red-500/10' : 'bg-gold text-white hover:bg-gold-hover'
              }`}
            >
              {pending ? '…' : STATUS_ACTION_LABELS[to]}
            </button>
          </form>
        ))}
      </div>
      <div className="mt-2 empty:hidden">
        <Feedback state={state} />
      </div>
    </div>
  )
}
