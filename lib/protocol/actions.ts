'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dbErrorMessage, staffAction, text, type ActionState } from '@/lib/admin/action'
import { notifyProtocolSigned } from '@/lib/booking/notify'
import { PROTOCOL_MEDIA_BUCKET, PROTOCOLS_BUCKET } from '@/lib/protocol/load'
import { CLEANLINESS, DAMAGE_KINDS, DAMAGE_VIEWS, PHOTO_ANGLES, PROTOCOL_SLUG, PROTOCOL_TITLE, protocolErrorMessage, type ProtocolDraft } from '@/lib/protocol/model'
import { generateProtocolPdf } from '@/lib/protocol/pdf'
import { zonedLocalToUtc } from '@/lib/time'
import type { Json } from '@/types/database'

const UUID = /^[0-9a-f-]{36}$/i
export type ProtocolActionResult = ActionState & { redirectTo?: string }

const keys = <T extends readonly { key: string }[]>(list: T) => list.map((item) => item.key) as [T[number]['key'], ...T[number]['key'][]]
const cleanliness = z.enum(keys(CLEANLINESS))
const draftSchema = z.object({
  handoverAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  odometerKm: z.number().int().min(0).max(5_000_000).nullable(),
  fuelLevel: z.number().int().min(0).max(100).nullable(),
  chargeLevel: z.number().int().min(0).max(100).nullable(),
  interior: cleanliness,
  exterior: cleanliness,
  accessories: z
    .array(z.object({ key: z.string().max(80), label: z.string().max(200), hint: z.string().max(200).optional(), present: z.boolean(), quantity: z.number().int().min(0).max(20).optional() }))
    .max(60),
  note: z.string().max(4000),
  customerName: z.string().max(200),
  staffName: z.string().max(200),
  driverLicenseNo: z.string().max(60),
  idDocumentNo: z.string().max(60),
  damages: z
    .array(
      z.object({
        id: z.string().regex(UUID),
        view: z.enum(keys(DAMAGE_VIEWS)),
        x: z.number().min(0).max(100),
        y: z.number().min(0).max(100),
        kind: z.enum(keys(DAMAGE_KINDS)),
        description: z.string().max(500),
        photoPath: z.string().max(300).nullable(),
      }),
    )
    .max(100),
  photos: z.array(z.object({ angle: z.enum(keys(PHOTO_ANGLES)), path: z.string().max(300) })).max(40),
})

function draftToJson(draft: ProtocolDraft): Json | null {
  const parsed = draftSchema.safeParse(draft)
  if (!parsed.success) return null
  const d = parsed.data
  const at = zonedLocalToUtc(d.handoverAt)
  if (!at) return null
  return {
    handover_at: at.toISOString(),
    odometer_km: d.odometerKm,
    fuel_level: d.fuelLevel,
    charge_level: d.chargeLevel,
    cleanliness: { interior: d.interior, exterior: d.exterior },
    accessories: d.accessories,
    note: d.note,
    signed_by_name: d.customerName,
    staff_name: d.staffName,
    driver_license_no: d.driverLicenseNo,
    id_document_no: d.idDocumentNo,
    damages: d.damages.map((damage) => ({ id: damage.id, view: damage.view, x: damage.x, y: damage.y, kind: damage.kind, description: damage.description, photo_path: damage.photoPath })),
    photos: d.photos.map((photo) => ({ angle: photo.angle, storage_path: photo.path })),
  }
}

function refresh(bookingId: string) {
  revalidatePath(`/admin/rezervacie/${bookingId}`, 'layout')
  revalidatePath('/admin/rezervacie')
  revalidatePath('/admin')
}

const failure = (error: { code?: string; message: string }): ActionState => ({ error: protocolErrorMessage(error.message) ?? dbErrorMessage(error) })

/** Opens the draft of a protocol (or a correcting version of a signed one). */
export async function startProtocolAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('operator', async ({ supabase }) => {
    const bookingId = text(formData, 'bookingId')
    const type = text(formData, 'type')
    if (!UUID.test(bookingId) || (type !== 'pickup' && type !== 'return')) return { error: 'Rezervácia sa nenašla.' }
    const { error } = await supabase.rpc('start_protocol', { p_booking_id: bookingId, p_type: type })
    if (error) return failure(error)
    refresh(bookingId)
    return { ok: true, message: 'Protokol je otvorený.' }
  })
}

/** Stores the draft; called by the wizard on every step change. */
export async function saveProtocolDraftAction(protocolId: string, draft: ProtocolDraft): Promise<ActionState> {
  return staffAction('operator', async ({ supabase }) => {
    const data = UUID.test(protocolId) ? draftToJson(draft) : null
    if (!data) return { error: 'Protokol obsahuje neplatné údaje. Skontrolujte vyplnené polia.' }
    const { error } = await supabase.rpc('save_protocol_draft', { p_protocol_id: protocolId, p_data: data })
    if (error) return failure(error)
    return { ok: true }
  })
}

/**
 * Saves the draft, signs the protocol (the database validates it, locks it and moves the
 * booking), then generates the PDF and emails it to the customer. A failed PDF or email
 * does not undo the signature: the PDF can be generated again from the protocol page.
 */
export async function signProtocolAction(protocolId: string, draft: ProtocolDraft, signatures: { customer: string; staff: string }): Promise<ProtocolActionResult> {
  return staffAction('operator', async ({ supabase }): Promise<ProtocolActionResult> => {
    const data = UUID.test(protocolId) ? draftToJson(draft) : null
    if (!data) return { error: 'Protokol obsahuje neplatné údaje. Skontrolujte vyplnené polia.' }
    const saved = await supabase.rpc('save_protocol_draft', { p_protocol_id: protocolId, p_data: data })
    if (saved.error) return failure(saved.error)
    const { data: row, error } = await supabase.rpc('sign_protocol', { p_protocol_id: protocolId, p_customer_signature_path: signatures.customer, p_staff_signature_path: signatures.staff })
    if (error || !row) return failure(error ?? { message: 'protocol_not_editable' })

    let pdf: { filename: string; content: Buffer } | null = null
    try {
      const generated = await generateProtocolPdf(supabase, protocolId)
      pdf = { filename: generated.filename, content: generated.pdf }
    } catch (e) {
      console.error('protocol pdf failed', e)
    }
    await notifyProtocolSigned(supabase, protocolId, pdf)
    refresh(row.booking_id)
    return { ok: true, redirectTo: `/admin/rezervacie/${row.booking_id}/protokol/${PROTOCOL_SLUG[row.type]}` }
  })
}

/** Generates the PDF of a signed protocol that has none yet (the first attempt failed). */
export async function generateProtocolPdfAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('operator', async ({ supabase }) => {
    const protocolId = text(formData, 'protocolId')
    if (!UUID.test(protocolId)) return { error: 'Protokol sa nenašiel.' }
    try {
      await generateProtocolPdf(supabase, protocolId)
    } catch (e) {
      console.error('protocol pdf failed', e)
      return { error: 'PDF sa nepodarilo vytvoriť. Skúste to znova.' }
    }
    const { data: row } = await supabase.from('handover_protocols').select('booking_id').eq('id', protocolId).maybeSingle()
    if (row) refresh(row.booking_id)
    return { ok: true, message: 'PDF je vytvorené.' }
  })
}

/** Sends the protocol email (8 / 10) again, e.g. after email sending was configured. */
export async function resendProtocolEmailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('operator', async ({ supabase }) => {
    const protocolId = text(formData, 'protocolId')
    if (!UUID.test(protocolId)) return { error: 'Protokol sa nenašiel.' }
    const { data: row } = await supabase.from('handover_protocols').select('booking_id, type, pdf_path, signed_at').eq('id', protocolId).maybeSingle()
    if (!row?.signed_at) return { error: 'Protokol ešte nie je podpísaný.' }
    let pdf: { filename: string; content: Buffer } | null = null
    if (row.pdf_path) {
      const { data: file } = await supabase.storage.from(PROTOCOLS_BUCKET).download(row.pdf_path)
      if (file) pdf = { filename: row.pdf_path.split('/').pop() ?? 'protokol.pdf', content: Buffer.from(await file.arrayBuffer()) }
    }
    const sent = await notifyProtocolSigned(supabase, protocolId, pdf)
    revalidatePath(`/admin/rezervacie/${row.booking_id}`)
    return sent ? { ok: true, message: `${PROTOCOL_TITLE[row.type]} bol odoslaný zákazníkovi.` } : { error: 'E-mail sa neodoslal (odosielanie nie je nastavené alebo zlyhalo).' }
  })
}

/** Throws away an unsigned draft together with the files only it uses. */
export async function discardProtocolDraftAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('operator', async ({ supabase }) => {
    const protocolId = text(formData, 'protocolId')
    if (!UUID.test(protocolId)) return { error: 'Protokol sa nenašiel.' }
    const { data: row } = await supabase.from('handover_protocols').select('id, booking_id, signed_at').eq('id', protocolId).maybeSingle()
    if (!row || row.signed_at) return { error: 'Podpísaný protokol sa nedá zahodiť.' }

    // A correcting draft starts with the files of the signed version: remove only what no other protocol uses.
    const { data: siblings } = await supabase.from('handover_protocols').select('id').eq('booking_id', row.booking_id)
    const ids = (siblings ?? []).map((s) => s.id)
    const [{ data: photos }, { data: damages }] = await Promise.all([
      supabase.from('protocol_photos').select('protocol_id, storage_path').in('protocol_id', ids),
      supabase.from('protocol_damages').select('protocol_id, photo_path').in('protocol_id', ids),
    ])
    const files = [
      ...(photos ?? []).map((p) => ({ owner: p.protocol_id, path: p.storage_path })),
      ...(damages ?? []).flatMap((d) => (d.photo_path ? [{ owner: d.protocol_id, path: d.photo_path }] : [])),
    ]
    const keep = new Set(files.filter((f) => f.owner !== protocolId).map((f) => f.path))
    const remove = [...new Set(files.filter((f) => f.owner === protocolId && !keep.has(f.path)).map((f) => f.path))]

    const { error } = await supabase.from('handover_protocols').delete().eq('id', protocolId)
    if (error) return failure(error)
    if (remove.length > 0) await supabase.storage.from(PROTOCOL_MEDIA_BUCKET).remove(remove)
    refresh(row.booking_id)
    return { ok: true, message: 'Rozpracovaný protokol je zahodený.' }
  })
}
