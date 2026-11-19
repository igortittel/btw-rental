'use client'

import { addBookingNoteAction, cancelBookingAction, changeBookingStatusAction, resolveBookingChangeAction } from '@/app/admin/rezervacie/actions'
import { ActionForm, Feedback, SubmitButton, textareaClass } from '@/components/admin/ui'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFormAction } from '@/components/use-form-action'
import { canTransition } from '@/lib/booking-status'
import { NEXT_STATUSES, STATUS_ACTION_LABELS, type BookingStatus } from '@/lib/booking/status'
import { centsToInput, formatEuro } from '@/lib/format'

const CONFIRM: Partial<Record<BookingStatus, string>> = {
  completed: 'Ukončiť rezerváciu {number}? Vozidlo sa uvoľní pre ďalšie termíny.',
}

/**
 * One-tap status changes for a booking; large touch targets for use on a phone.
 * Cancelling leads to the detail, where the cancellation fee is decided.
 */
export function BookingQuickActions({ id, number, status, cancelHref, detailHref }: { id: string; number: string; status: BookingStatus; cancelHref?: string; detailHref?: string }) {
  const { state, pending, onSubmit } = useFormAction(changeBookingStatusAction, {})
  // Handing over and taking back go through the protocol, whose signature changes the status.
  const options = NEXT_STATUSES[status].filter((to) => !detailHref || (to !== 'active' && to !== 'completed'))
  const protocol =
    detailHref && status === 'confirmed'
      ? { href: `${detailHref}/protokol/odovzdavaci`, label: 'Odovzdať vozidlo' }
      : detailHref && status === 'active'
        ? { href: `${detailHref}/protokol/preberaci`, label: 'Prevziať vozidlo' }
        : null
  const cancellable = !!cancelHref && canTransition(status, 'cancelled')
  if (options.length === 0 && !cancellable && !protocol) return null
  const reviewHref = status === 'modified' && cancelHref ? cancelHref.replace(/#.*$/, '#uprava') : null

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
              className="h-11 w-full whitespace-nowrap rounded-lg bg-gold px-4 text-sm font-semibold text-white transition-colors hover:bg-gold-hover disabled:opacity-60"
            >
              {pending ? '…' : STATUS_ACTION_LABELS[to]}
            </button>
          </form>
        ))}
        {protocol ? (
          <a
            href={protocol.href}
            className="flex h-11 flex-1 items-center justify-center whitespace-nowrap rounded-lg bg-gold px-4 text-sm font-semibold text-white transition-colors hover:bg-gold-hover"
          >
            {protocol.label}
          </a>
        ) : null}
        {/* Plain <a>: links with a #fragment must load the page so the browser scrolls to the section
            (client-side navigation to a prefetched route with a hash does not complete). */}
        {reviewHref ? (
          <a
            href={reviewHref}
            className="flex h-11 flex-1 items-center justify-center whitespace-nowrap rounded-lg bg-gold px-4 text-sm font-semibold text-white transition-colors hover:bg-gold-hover"
          >
            Posúdiť úpravu
          </a>
        ) : null}
        {cancellable ? (
          <a
            href={cancelHref}
            className="flex h-11 flex-1 items-center justify-center whitespace-nowrap rounded-lg border border-red-400/60 px-4 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/10"
          >
            Zrušiť
          </a>
        ) : null}
      </div>
      <div className="mt-2 empty:hidden">
        <Feedback state={state} />
      </div>
    </div>
  )
}

/** Cancellation with the fee pre-calculated from the cancellation tiers; staff may change or waive it with a reason. */
export function CancelBookingForm({ id, number, quote, hasPrice }: { id: string; number: string; quote: { feeCents: number; feePercent: number; hoursBeforePickup: number }; hasPrice: boolean }) {
  return (
    <ActionForm action={cancelBookingAction} confirm={`Naozaj zrušiť rezerváciu ${number}? Túto zmenu nie je možné vrátiť.`} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-muted2">
        {hasPrice
          ? `Do vyzdvihnutia ${quote.hoursBeforePickup >= 0 ? `zostáva ${quote.hoursBeforePickup} h` : 'už čas uplynul'}. Podľa storno podmienok: ${quote.feePercent} % = ${formatEuro(quote.feeCents)}.`
          : 'Rezervácia nemá stanovenú cenu – storno je bez poplatku.'}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cancel-fee">Storno poplatok (€)</Label>
          <Input id="cancel-fee" name="fee" inputMode="decimal" defaultValue={centsToInput(quote.feeCents)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cancel-fee-reason">Dôvod úpravy poplatku</Label>
          <Input id="cancel-fee-reason" name="feeReason" maxLength={300} placeholder="Vyplňte, ak poplatok meníte alebo odpúšťate" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="cancel-reason">Dôvod zrušenia (uvidí ho zákazník)</Label>
        <textarea id="cancel-reason" name="reason" maxLength={500} className={textareaClass} />
      </div>
      <SubmitButton variant="destructive" pendingLabel="Ruším…">
        Zrušiť rezerváciu
      </SubmitButton>
    </ActionForm>
  )
}

/** Approve or reject a change requested by the customer. */
export function ResolveChangeForm({ id, collision }: { id: string; collision: boolean }) {
  const { state, pending, onSubmit } = useFormAction(resolveBookingChangeAction, {})
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="space-y-2">
        <Label htmlFor="resolve-note">Správa pre zákazníka (pri zamietnutí povinná)</Label>
        <textarea id="resolve-note" name="note" maxLength={500} className={textareaClass} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={pending || collision}
          className="h-11 flex-1 rounded-lg bg-gold px-4 text-sm font-semibold text-white transition-colors hover:bg-gold-hover disabled:opacity-50"
        >
          Schváliť úpravu
        </button>
        <button
          type="submit"
          name="decision"
          value="reject"
          disabled={pending}
          className="h-11 flex-1 rounded-lg border border-red-400/60 px-4 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/10 disabled:opacity-50"
        >
          Zamietnuť
        </button>
      </div>
      <Feedback state={state} />
    </form>
  )
}

export function BookingNoteForm({ id }: { id: string }) {
  return (
    <ActionForm action={addBookingNoteAction} resetOnSuccess className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label htmlFor="note-body" className="sr-only">
        Nová interná poznámka
      </label>
      <textarea id="note-body" name="body" maxLength={4000} placeholder="Interná poznámka – zákazník ju nevidí" className={textareaClass} />
      <SubmitButton variant="outline">Pridať poznámku</SubmitButton>
    </ActionForm>
  )
}

/** Exception path: change the status without a protocol (e.g. the tablet is not at hand). */
export function StatusWithoutProtocol({ id, to }: { id: string; to: 'active' | 'completed' }) {
  return (
    <ActionForm
      action={changeBookingStatusAction}
      confirm={
        to === 'active' ? 'Vydať vozidlo bez odovzdávacieho protokolu? Stav vozidla pri odovzdaní nebude zdokumentovaný.' : 'Ukončiť rezerváciu bez preberacieho protokolu? Vyúčtovanie sa nevytvorí.'
      }
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="note" value="Bez protokolu" />
      <button type="submit" className="min-h-11 text-sm text-muted2 underline underline-offset-4 hover:text-white">
        {to === 'active' ? 'Vydať vozidlo bez protokolu' : 'Ukončiť bez protokolu'}
      </button>
    </ActionForm>
  )
}
