'use server'

import { revalidatePath } from 'next/cache'
import { dbErrorMessage, staffAction, text, type ActionState } from '@/lib/admin/action'
import { notifySettlementApproved } from '@/lib/booking/notify'
import { parseEuroToCents } from '@/lib/format'
import { loadSettlementContext } from '@/lib/settlement-data'
import type { DamageItem } from '@/lib/settlement'
import type { Json } from '@/types/database'

const UUID = /^[0-9a-f-]{36}$/i
const MAX_CENTS = 100_000_00

/**
 * Settlement after the return protocol (manager and above).
 *   intent=save     stores the draft – the customer does not see it
 *   intent=approve  stores and approves it: visible to the customer, email sent
 *   intent=reopen   withdraws the approval so that the amounts can be changed
 * Kilometres, fuel difference and lateness are always taken from the signed protocols;
 * only the amounts come from the form.
 */
export async function saveSettlementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase, userId }) => {
    const bookingId = text(formData, 'bookingId')
    const intent = text(formData, 'intent')
    if (!UUID.test(bookingId)) return { error: 'Rezervácia sa nenašla.' }
    // Never guess what an unknown button meant.
    if (intent !== 'save' && intent !== 'approve' && intent !== 'reopen') return { error: 'Akcia sa nepodarila. Skúste to znova.' }

    const context = await loadSettlementContext(supabase, bookingId)
    if (!context) return { error: 'Rezervácia sa nenašla.' }
    const { settlement, proposal, damages } = context
    if (!context.returned || !proposal) return { error: 'Vyúčtovanie je možné až po podpise preberacieho protokolu.' }
    const refresh = () => {
      revalidatePath(`/admin/rezervacie/${bookingId}`, 'layout')
      revalidatePath('/admin')
    }

    if (intent === 'reopen') {
      if (!settlement?.approved_at) return { error: 'Vyúčtovanie nie je potvrdené.' }
      const { error } = await supabase.from('settlements').update({ approved_at: null, approved_by: null }).eq('id', settlement.id)
      if (error) return { error: dbErrorMessage(error) }
      refresh()
      return { ok: true, message: 'Vyúčtovanie je otvorené na úpravu. Zákazník ho nevidí, kým ho znova nepotvrdíte.' }
    }
    if (settlement?.approved_at) return { error: 'Vyúčtovanie je už potvrdené. Ak ho chcete zmeniť, najprv ho otvorte na úpravu.' }

    const amount = (name: string, label: string): number | string => {
      const cents = parseEuroToCents(text(formData, name)) ?? 0
      return Number.isNaN(cents) || cents > MAX_CENTS ? `${label}: zadajte sumu v eurách (napr. 45 alebo 45,50).` : cents
    }
    const fields = { km: amount('km', 'Kilometre nad limit'), fuel: amount('fuel', 'Palivo'), late: amount('late', 'Meškanie'), other: amount('other', 'Iné') }
    const items: DamageItem[] = []
    for (const damage of damages) {
      const cents = amount(`damage_${damage.id}`, `Poškodenie č. ${damage.no}`)
      if (typeof cents === 'string') return { error: cents }
      items.push({ damage_id: damage.id, label: damage.label, cents })
    }
    const invalid = Object.values(fields).find((value) => typeof value === 'string')
    if (typeof invalid === 'string') return { error: invalid }
    const { km, fuel, late, other } = fields as Record<keyof typeof fields, number>
    const otherLabel = text(formData, 'otherLabel').slice(0, 200)
    if (other > 0 && !otherLabel) return { error: 'Pri položke „Iné“ napíšte, za čo sa účtuje.' }

    const values = {
      km_driven: proposal.kmDriven,
      extra_km: proposal.extraKm,
      extra_km_cents: km,
      fuel_diff: proposal.fuelDiff,
      fuel_cents: fuel,
      damage_cents: items.reduce((sum, item) => sum + item.cents, 0),
      damage_items: items as unknown as Json,
      late_minutes: proposal.lateMinutes,
      late_cents: late,
      other_cents: other,
      other_label: otherLabel || null,
      note: text(formData, 'note').slice(0, 2000) || null,
      ...(intent === 'approve' ? { approved_at: new Date().toISOString(), approved_by: userId } : {}),
    }
    const { error } = settlement ? await supabase.from('settlements').update(values).eq('id', settlement.id) : await supabase.from('settlements').insert({ booking_id: bookingId, ...values })
    if (error) return { error: dbErrorMessage(error) }
    refresh()
    if (intent === 'save') return { ok: true, message: 'Návrh vyúčtovania je uložený. Zákazník ho uvidí až po potvrdení.' }
    const sent = await notifySettlementApproved(supabase, bookingId)
    return {
      ok: true,
      message: sent
        ? 'Vyúčtovanie je potvrdené, zákazník dostal e-mail.'
        : 'Vyúčtovanie je potvrdené a zákazník ho vidí vo svojom účte. E-mail sa neodoslal (odosielanie nie je nastavené alebo zlyhalo).',
    }
  })
}
