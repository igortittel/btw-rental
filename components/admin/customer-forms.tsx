'use client'

import { useEffect, useState } from 'react'
import { declineDeletionAction, eraseCustomerAction, saveBlacklistAction, saveCustomerNoteAction, saveRefundIbanAction, sendCustomerPasswordLinkAction } from '@/app/admin/zakaznici/actions'
import { ActionForm, Feedback, SubmitButton, textareaClass } from '@/components/admin/ui'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFormAction } from '@/components/use-form-action'
import { ERASE_CONFIRMATION } from '@/lib/customers/list'

export function CustomerNoteForm({ id, note, canEdit }: { id: string; note: string; canEdit: boolean }) {
  if (!canEdit) return <p className="whitespace-pre-line text-sm text-white">{note || <span className="text-muted2">Bez poznámky.</span>}</p>
  return (
    <ActionForm action={saveCustomerNoteAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label htmlFor="customer-note" className="sr-only">
        Interná poznámka
      </label>
      <textarea id="customer-note" name="note" defaultValue={note} maxLength={4000} placeholder="Napr. preferencie, dohody, firemný kontakt" className={textareaClass} />
      <SubmitButton variant="outline">Uložiť poznámku</SubmitButton>
    </ActionForm>
  )
}

export function BlacklistForm({ id, blacklisted, reason, canEdit }: { id: string; blacklisted: boolean; reason: string; canEdit: boolean }) {
  const [on, setOn] = useState(blacklisted)
  if (!canEdit) return <p className="text-sm text-white">{blacklisted ? `Áno – ${reason}` : 'Nie'}</p>
  return (
    <ActionForm action={saveBlacklistAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label className="flex min-h-11 items-center gap-3 text-sm text-white">
        <input type="checkbox" name="blacklisted" checked={on} onChange={(e) => setOn(e.target.checked)} className="h-5 w-5 accent-[#B88746]" />
        Problémový zákazník (blacklist)
      </label>
      {on ? (
        <div className="space-y-2">
          <Label htmlFor="blacklist-reason">Dôvod (povinný, vidia ho len zamestnanci)</Label>
          <textarea id="blacklist-reason" name="reason" defaultValue={reason} maxLength={1000} className={textareaClass} />
        </div>
      ) : null}
      <SubmitButton variant="outline">Uložiť</SubmitButton>
    </ActionForm>
  )
}

export function RefundIbanForm({ id, iban }: { id: string; iban: string }) {
  return (
    <ActionForm action={saveRefundIbanAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="min-w-0 flex-1 space-y-2">
        <Label htmlFor="refund-iban">Účet na vrátenie depozitu (IBAN)</Label>
        <Input id="refund-iban" name="iban" defaultValue={iban} spellCheck={false} placeholder="SK00 0000 0000 0000 0000 0000" />
      </div>
      <SubmitButton variant="outline">Uložiť</SubmitButton>
    </ActionForm>
  )
}

export function PasswordLinkForm({ id }: { id: string }) {
  return (
    <ActionForm action={sendCustomerPasswordLinkAction} confirm="Poslať zákazníkovi e-mail s odkazom na nastavenie nového hesla?">
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="outline" pendingLabel="Posielam…">
        Poslať odkaz na nové heslo
      </SubmitButton>
    </ActionForm>
  )
}

export function DeclineDeletionForm({ id }: { id: string }) {
  return (
    <ActionForm action={declineDeletionAction} confirm="Uzavrieť žiadosť o vymazanie bez vymazania? (napr. zákazník ju stiahol)">
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="outline">Uzavrieť žiadosť bez vymazania</SubmitButton>
    </ActionForm>
  )
}

/** GDPR erasure with a typed confirmation. */
export function EraseCustomerForm({ id, name, hasBookings, blocked }: { id: string; name: string; hasBookings: boolean; blocked: boolean }) {
  const { state, pending, onSubmit } = useFormAction(eraseCustomerAction, {})
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  useEffect(() => {
    if (state.redirectTo) window.location.assign(state.redirectTo)
  }, [state])

  if (blocked) {
    return <p className="text-sm text-amber-100">Zákazník má novú, potvrdenú alebo prebiehajúcu rezerváciu. Vymazať ho možno až po jej ukončení alebo zrušení.</p>
  }
  if (!open) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => setOpen(true)} className="h-11 rounded-lg bg-red-700 px-5 text-sm font-semibold text-white hover:bg-red-800">
          {hasBookings ? 'Anonymizovať zákazníka' : 'Vymazať zákazníka'}
        </button>
        <Feedback state={state} />
      </div>
    )
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-red-400/60 bg-red-500/5 p-4">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-white">
        <strong>{hasBookings ? `Anonymizovať ${name}?` : `Úplne vymazať ${name}?`}</strong> Osobné údaje sa nenávratne odstránia a zákazník sa už neprihlási. Nedá sa to vrátiť späť.
      </p>
      <div className="space-y-2">
        <Label htmlFor="erase-confirm">
          Pre potvrdenie napíšte <strong className="text-white">{ERASE_CONFIRMATION}</strong>
        </Label>
        <Input id="erase-confirm" name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending || typed.trim().toUpperCase() !== ERASE_CONFIRMATION} className="h-11 rounded-lg bg-red-700 px-5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
          {pending ? 'Vykonávam…' : hasBookings ? 'Anonymizovať' : 'Vymazať'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-lg border border-gold/50 px-4 text-sm font-semibold text-gold hover:bg-gold/10">
          Späť
        </button>
      </div>
      <Feedback state={state} />
    </form>
  )
}
