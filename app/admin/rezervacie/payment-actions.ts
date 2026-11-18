'use server'

import { revalidatePath } from 'next/cache'
import { dbErrorMessage, staffAction, text, type ActionState } from '@/lib/admin/action'
import { parseEuroToCents } from '@/lib/format'
import { PAYMENT_KINDS, paymentDateToUtc, type PaymentKind, type UndoKind } from '@/lib/payment'

const UUID = /^[0-9a-f-]{36}$/i
const METHODS = ['transfer', 'terminal', 'cash'] as const
type Method = (typeof METHODS)[number]

const ERRORS: Record<string, string> = {
  payment_already_recorded: 'Platba už je zaznamenaná. Obnovte stránku.',
  price_not_set: 'Rezervácia nemá cenu. Najprv ju doplňte v úprave rezervácie.',
  invalid_date: 'Dátum nemôže byť v budúcnosti.',
  deposit_not_received: 'Depozit nie je zaznamenaný ako prijatý.',
  booking_not_finished: 'Depozit sa vracia až po ukončení alebo zrušení rezervácie.',
  settlement_not_approved: 'Najprv potvrďte vyúčtovanie.',
  invalid_amount: 'Suma je mimo povoleného rozsahu.',
  rental_not_paid: 'Prenájom nie je zaznamenaný ako uhradený.',
  nothing_to_undo: 'Nie je čo vrátiť späť. Obnovte stránku.',
}

function refresh(id: string) {
  revalidatePath(`/admin/rezervacie/${id}`)
  revalidatePath(`/admin/rezervacie/${id}/protokol/odovzdavaci`)
  revalidatePath('/admin/rezervacie')
  revalidatePath('/admin')
}

function rpcError(error: { code?: string; message: string }): ActionState {
  const key = Object.keys(ERRORS).find((k) => error.message.includes(k))
  return { error: key ? ERRORS[key] : dbErrorMessage(error) }
}

function readCommon(formData: FormData): { id: string; at: string; method: Method } | { error: string } {
  const id = text(formData, 'id')
  if (!UUID.test(id)) return { error: 'Rezervácia sa nenašla.' }
  const at = paymentDateToUtc(text(formData, 'date'))
  if (!at) return { error: 'Zadajte dátum.' }
  const method = text(formData, 'method') as Method
  if (!METHODS.includes(method)) return { error: 'Zvoľte spôsob platby.' }
  return { id, at, method }
}

/** Rental paid / deposit received. Any staff member – terminal and cash are taken at the car. */
export async function recordPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('operator', async ({ supabase }) => {
    const common = readCommon(formData)
    if ('error' in common) return common
    const kind = text(formData, 'kind') as PaymentKind
    if (!PAYMENT_KINDS.includes(kind)) return { error: 'Neznámy druh platby.' }
    const { error } = await supabase.rpc('record_payment', { p_booking_id: common.id, p_kind: kind, p_at: common.at, p_method: common.method })
    if (error) return rpcError(error)
    refresh(common.id)
    return { ok: true, message: kind === 'rental' ? 'Úhrada prenájmu zaznamenaná.' : 'Prijatie depozitu zaznamenané.' }
  })
}

/** Deposit returned after the rental (minus the approved settlement). */
export async function returnDepositAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const common = readCommon(formData)
    if ('error' in common) return common
    const amount = parseEuroToCents(text(formData, 'amount'))
    if (amount === null || amount < 0) return { error: 'Zadajte vrátenú sumu (môže byť aj 0).' }
    const { error } = await supabase.rpc('record_deposit_return', {
      p_booking_id: common.id, p_amount: amount, p_at: common.at, p_method: common.method, p_note: text(formData, 'note') || undefined,
    })
    if (error) return rpcError(error)
    refresh(common.id)
    return { ok: true, message: 'Vrátenie depozitu zaznamenané.' }
  })
}

/** Refund of a paid rental (typically after a cancellation). */
export async function refundRentalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const common = readCommon(formData)
    if ('error' in common) return common
    const amount = parseEuroToCents(text(formData, 'amount'))
    if (amount === null || amount <= 0) return { error: 'Zadajte vrátenú sumu.' }
    const { error } = await supabase.rpc('record_rental_refund', {
      p_booking_id: common.id, p_amount: amount, p_at: common.at, p_method: common.method, p_note: text(formData, 'note') || undefined,
    })
    if (error) return rpcError(error)
    refresh(common.id)
    return { ok: true, message: 'Vrátenie platby zaznamenané.' }
  })
}

const UNDO_KINDS: UndoKind[] = ['rental', 'deposit', 'deposit_return', 'rental_refund']
const UNDO_DONE: Record<UndoKind, string> = {
  rental: 'Záznam o úhrade prenájmu zrušený.',
  deposit: 'Záznam o prijatí depozitu zrušený.',
  deposit_return: 'Záznam o vrátení depozitu zrušený.',
  rental_refund: 'Záznam o vrátení platby zrušený.',
}

/** Undo a wrongly recorded step (managers; the audit log keeps the history). */
export async function undoPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const id = text(formData, 'id')
    const kind = text(formData, 'kind') as UndoKind
    if (!UUID.test(id) || !UNDO_KINDS.includes(kind)) return { error: 'Neplatná požiadavka.' }
    const { error } = await supabase.rpc('undo_payment', { p_booking_id: id, p_kind: kind })
    if (error) return rpcError(error)
    refresh(id)
    return { ok: true, message: UNDO_DONE[kind] }
  })
}
