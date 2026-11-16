'use server'

import { revalidatePath } from 'next/cache'
import { dbErrorMessage, staffAction, text, type ActionState } from '@/lib/admin/action'
import { BOOKING_STATUS_LABELS, NEXT_STATUSES, type BookingStatus } from '@/lib/booking/status'

/**
 * Quick status change from the list or the detail. Only transitions offered by
 * NEXT_STATUSES are accepted here; the database enforces the full transition rules,
 * the double-booking protection and writes the status history.
 */
export async function changeBookingStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('operator', async ({ supabase, userId }) => {
    const id = text(formData, 'id')
    const to = text(formData, 'to') as BookingStatus
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Rezervácia sa nenašla.' }

    const { data: booking } = await supabase.from('bookings').select('status, total_cents, is_individual_price').eq('id', id).maybeSingle()
    if (!booking) return { error: 'Rezervácia sa nenašla.' }
    if (!NEXT_STATUSES[booking.status].includes(to)) return { error: `Rezerváciu v stave „${BOOKING_STATUS_LABELS[booking.status]}“ takto zmeniť nemožno.` }
    if (to === 'confirmed' && booking.total_cents === null) return { error: 'Rezervácia nemá cenu. Najprv ju treba doplniť (individuálna cena).' }

    const { error } =
      to === 'cancelled'
        ? await supabase
            .from('bookings')
            .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: userId, cancellation_reason: text(formData, 'reason') || null })
            .eq('id', id)
        : await supabase.rpc('change_booking_status', { p_booking_id: id, p_to_status: to })
    if (error) {
      if (error.code === '23P01') return { error: 'Termín koliduje s inou potvrdenou rezerváciou alebo blokáciou vozidla.' }
      return { error: dbErrorMessage(error) }
    }

    revalidatePath('/admin/rezervacie')
    revalidatePath(`/admin/rezervacie/${id}`)
    revalidatePath('/admin')
    return { ok: true, message: `Stav zmenený: ${BOOKING_STATUS_LABELS[to]}.` }
  })
}
