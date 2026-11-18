'use server'

import { revalidatePath } from 'next/cache'
import { checkbox, dbErrorMessage, staffAction, text, type ActionState } from '@/lib/admin/action'
import { notifyDocumentAvailable } from '@/lib/booking/notify'
import { DOCUMENTS_BUCKET, DOCUMENT_MAX_BYTES, DOCUMENT_TYPES, isDocumentPathOf, looksLikePdf, type DocumentType } from '@/lib/documents'
import { parseEuroToCents } from '@/lib/format'

const UUID = /^[0-9a-f-]{36}$/i

function refresh(bookingId: string) {
  revalidatePath(`/admin/rezervacie/${bookingId}`)
}

/**
 * Records a PDF the browser has just uploaded to `documents/<booking_id>/<uuid>.pdf`
 * (storage RLS: managers only, existing booking folder). The file is checked here – it
 * must be a PDF within the size limit – and removed again if anything is wrong.
 * Optionally sends email 11 with the PDF attached.
 */
export async function createDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase, userId }) => {
    const bookingId = text(formData, 'bookingId')
    const path = text(formData, 'path')
    if (!UUID.test(bookingId) || !isDocumentPathOf(bookingId, path)) return { error: 'Najprv vyberte PDF súbor.' }
    const discard = async (error: string): Promise<ActionState> => {
      await supabase.storage.from(DOCUMENTS_BUCKET).remove([path])
      return { error }
    }

    const type = text(formData, 'type') as DocumentType
    if (!DOCUMENT_TYPES.includes(type)) return discard('Zvoľte typ dokladu.')
    const amountRaw = text(formData, 'amount')
    const amount = amountRaw ? parseEuroToCents(amountRaw) : null
    if (amountRaw && (amount === null || amount < 0)) return { error: 'Suma nie je platná (napr. 632,00).' }
    const issuedAt = text(formData, 'issuedAt')
    if (issuedAt && !/^\d{4}-\d{2}-\d{2}$/.test(issuedAt)) return { error: 'Dátum vystavenia nie je platný.' }

    const { data: file, error: downloadError } = await supabase.storage.from(DOCUMENTS_BUCKET).download(path)
    if (downloadError || !file) return { error: 'Súbor sa nepodarilo nahrať. Skúste to znova.' }
    if (file.size > DOCUMENT_MAX_BYTES) return discard('Súbor je väčší ako 10 MB.')
    if (!looksLikePdf(new Uint8Array(await file.slice(0, 5).arrayBuffer()))) return discard('Súbor nie je PDF.')

    const { data: row, error } = await supabase
      .from('documents')
      .insert({
        booking_id: bookingId,
        type,
        number: text(formData, 'number').slice(0, 60) || null,
        amount_cents: amount,
        issued_at: issuedAt || null,
        storage_path: path,
        file_name: text(formData, 'fileName').slice(0, 200) || null,
        uploaded_by: userId,
      })
      .select('id')
      .single()
    if (error || !row) return discard(error ? dbErrorMessage(error) : 'Doklad sa nepodarilo uložiť.')

    refresh(bookingId)
    if (!checkbox(formData, 'notify')) return { ok: true, message: 'Doklad nahratý. Zákazník ho vidí v Mojom účte.' }
    const sent = await notifyDocumentAvailable(supabase, row.id)
    refresh(bookingId)
    return sent
      ? { ok: true, message: 'Doklad nahratý a zákazníkovi odoslaný e-mailom.' }
      : { ok: true, message: 'Doklad nahratý. E-mail sa nepodarilo odoslať – zákazník doklad aj tak vidí v Mojom účte.' }
  })
}

/** Removes a document and its file (managers). The customer is not notified. */
export async function deleteDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const id = text(formData, 'id')
    if (!UUID.test(id)) return { error: 'Doklad sa nenašiel.' }
    const { data: row, error } = await supabase.from('documents').delete().eq('id', id).select('booking_id, storage_path').maybeSingle()
    if (error) return { error: dbErrorMessage(error) }
    if (!row) return { error: 'Doklad sa nenašiel.' }
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([row.storage_path])
    refresh(row.booking_id)
    return { ok: true, message: 'Doklad zmazaný.' }
  })
}

/** Sends email 11 again for an existing document. */
export async function resendDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const id = text(formData, 'id')
    if (!UUID.test(id)) return { error: 'Doklad sa nenašiel.' }
    const { data: row } = await supabase.from('documents').select('booking_id').eq('id', id).maybeSingle()
    if (!row) return { error: 'Doklad sa nenašiel.' }
    const sent = await notifyDocumentAvailable(supabase, id)
    refresh(row.booking_id)
    return sent ? { ok: true, message: 'E-mail odoslaný.' } : { error: 'E-mail sa nepodarilo odoslať.' }
  })
}
