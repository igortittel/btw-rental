import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatEuro } from '@/lib/format'
import { renderProtocolPdf, type PdfImage, type ProtocolPdfData } from '@/lib/pdf/protocol-pdf'
import { accessoriesOf, cleanlinessOf, latestSigned, loadProtocols, PROTOCOL_MEDIA_BUCKET, PROTOCOLS_BUCKET, type LoadedProtocol } from '@/lib/protocol/load'
import { CLEANLINESS_LABEL, fuelLabel, percentToEighths, PHOTO_ANGLE_LABEL, PHOTO_ANGLES, PROTOCOL_SLUG, usesCharge, usesFuel, type DamageView } from '@/lib/protocol/model'
import { formatDuration } from '@/lib/settlement'
import { getSettings, type Settings } from '@/lib/settings'
import { formatDate, formatDateTime } from '@/lib/time'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>
type BookingRow = Database['public']['Tables']['bookings']['Row']
type Localized = { sk?: string; en?: string }

const km = (value: number | null) => (value === null ? '—' : `${new Intl.NumberFormat('sk-SK').format(value)} km`)

export type ProtocolPdfInput = {
  booking: BookingRow
  vehicle: { name: string; license_plate: string | null; vin: string; fuel: string }
  company: Settings['company']
  protocol: LoadedProtocol
  /** Valid pickup protocol, for the comparison in a return protocol. */
  pickup: LoadedProtocol | null
  supersedesVersion: number | null
  images: Map<string, PdfImage>
}

/** Database rows -> the formatted content of the PDF. Pure. */
export function buildProtocolPdfData({ booking, vehicle, company, protocol, pickup, supersedesVersion, images }: ProtocolPdfInput): ProtocolPdfData {
  const isReturn = protocol.type === 'return'
  const reference = isReturn ? pickup : null
  const customer = (booking.customer_snapshot ?? {}) as {
    first_name?: string; last_name?: string; email?: string; phone?: string; date_of_birth?: string
    is_company?: boolean; company_name?: string | null; ico?: string | null
    billing_address?: { street?: string; city?: string; zip?: string; country?: string }
  }
  const snapshot = (booking.price_snapshot ?? {}) as { pickup_location?: { name: Localized; address: string }; return_location?: { name: Localized; address: string } }
  const address = customer.billing_address ?? {}
  const place = (kind: 'pickup' | 'return') => (kind === 'pickup' ? booking.pickup_custom_address ?? snapshot.pickup_location?.address : booking.return_custom_address ?? snapshot.return_location?.address) ?? '—'
  const at = (value: string | null) => (value ? formatDateTime(value) : '—')

  const state: ProtocolPdfData['state'] = []
  const lateMinutes = isReturn && protocol.handover_at ? Math.round((new Date(protocol.handover_at).getTime() - new Date(booking.return_at).getTime()) / 60000) : 0
  state.push({ label: 'Dátum a čas', pickup: at(reference?.handover_at ?? null), value: at(protocol.handover_at), diff: lateMinutes > 0 ? `meškanie ${formatDuration(lateMinutes)}` : undefined })
  state.push({ label: 'Miesto', pickup: place('pickup'), value: place(isReturn ? 'return' : 'pickup') })
  const driven = reference && reference.odometer_km !== null && protocol.odometer_km !== null ? protocol.odometer_km - reference.odometer_km : null
  state.push({ label: 'Tachometer', pickup: km(reference?.odometer_km ?? null), value: km(protocol.odometer_km), diff: driven === null ? undefined : `${km(driven)} (limit ${km(booking.km_limit_per_day * booking.days)})` })
  if (usesFuel(vehicle.fuel)) {
    const before = percentToEighths(reference?.fuel_level)
    const after = percentToEighths(protocol.fuel_level)
    state.push({ label: 'Palivo', pickup: fuelLabel(reference?.fuel_level), value: fuelLabel(protocol.fuel_level), diff: before !== null && after !== null && before !== after ? `${after > before ? '+' : '−'}${Math.abs(after - before)}/8` : undefined })
  }
  if (usesCharge(vehicle.fuel)) {
    const pct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value} %`)
    state.push({ label: 'Nabitie batérie', pickup: pct(reference?.charge_level), value: pct(protocol.charge_level) })
  }
  const clean = cleanlinessOf(protocol)
  const cleanBefore = reference ? cleanlinessOf(reference) : null
  state.push({ label: 'Čistota interiéru', pickup: cleanBefore ? CLEANLINESS_LABEL[cleanBefore.interior] : '—', value: CLEANLINESS_LABEL[clean.interior] })
  state.push({ label: 'Čistota exteriéru', pickup: cleanBefore ? CLEANLINESS_LABEL[cleanBefore.exterior] : '—', value: CLEANLINESS_LABEL[clean.exterior] })

  const own = accessoriesOf(protocol)
  const handedOver = reference ? accessoriesOf(reference).filter((item) => item.present) : null
  const withQuantity = (label: string, quantity?: number) => (quantity !== undefined ? `${label} – ${quantity} ks` : label)
  const accessories: ProtocolPdfData['accessories'] = handedOver
    ? handedOver.map((item) => {
        const back = own.find((o) => o.key === item.key)
        const missing = !back || !back.present || (item.quantity !== undefined && (back.quantity ?? 0) < item.quantity)
        return { label: withQuantity(item.label, back?.present ? back.quantity : item.quantity), present: !!back?.present, missing }
      })
    : own.map((item) => ({ label: withQuantity(item.label, item.present ? item.quantity : undefined), present: item.present, missing: false }))

  const rows = [...(reference?.damages ?? []).map((d) => ({ ...d, isNew: false })), ...protocol.damages.map((d) => ({ ...d, isNew: isReturn }))]
  const damages = rows.map((d, index) => ({ no: index + 1, view: d.view as DamageView, x: Number(d.x), y: Number(d.y), kind: d.kind, description: d.description, isNew: d.isNew, photo: d.photo_path }))

  const photos: ProtocolPdfData['photos'] = []
  for (const angle of PHOTO_ANGLES) {
    for (const photo of protocol.photos.filter((p) => p.angle === angle.key)) {
      const image = images.get(photo.storage_path)
      if (image) photos.push({ label: PHOTO_ANGLE_LABEL[photo.angle] ?? photo.angle, image })
    }
  }

  return {
    type: protocol.type,
    bookingNumber: booking.number,
    version: protocol.version,
    supersedesVersion,
    company: { name: company.name, address: company.address, ids: [company.ico ? `IČO: ${company.ico}` : '', company.dic ? `DIČ: ${company.dic}` : '', company.ic_dph ? `IČ DPH: ${company.ic_dph}` : ''].filter(Boolean) },
    customer: {
      name: `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() || (protocol.signed_by_name ?? ''),
      lines: [
        customer.is_company && customer.company_name ? `${customer.company_name}${customer.ico ? `, IČO: ${customer.ico}` : ''}` : '',
        [address.street, [address.zip, address.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        customer.date_of_birth ? `nar.: ${formatDate(`${customer.date_of_birth}T12:00:00Z`)}` : '',
        protocol.driver_license_no ? `VP: ${protocol.driver_license_no}` : '',
        protocol.id_document_no ? `doklad totožnosti: ${protocol.id_document_no}` : '',
        customer.phone ? `tel.: ${customer.phone}` : '',
        customer.email ?? '',
      ].filter(Boolean),
    },
    vehicle: { name: vehicle.name, plate: vehicle.license_plate, vin: vehicle.vin },
    term: `${formatDateTime(booking.pickup_at)} – ${formatDateTime(booking.return_at)}`,
    state: isReturn ? state : state.map(({ label, value }) => ({ label, value })),
    accessories,
    damages: damages.map(({ photo: _photo, ...damage }) => damage),
    photos,
    damagePhotos: damages.flatMap((d) => (d.photo && images.get(d.photo) ? [{ no: d.no, image: images.get(d.photo)! }] : [])),
    note: protocol.note,
    kmLimitPerDay: booking.km_limit_per_day,
    extraKmPrice: formatEuro(booking.extra_km_cents),
    signedAt: at(protocol.signed_at),
    customerName: protocol.signed_by_name ?? '',
    staffName: protocol.staff_name ?? '',
    customerSignature: (protocol.customer_signature_path && images.get(protocol.customer_signature_path)) || null,
    staffSignature: (protocol.staff_signature_path && images.get(protocol.staff_signature_path)) || null,
  }
}

async function downloadImages(supabase: Client, paths: (string | null)[]): Promise<Map<string, PdfImage>> {
  const images = new Map<string, PdfImage>()
  await Promise.all(
    [...new Set(paths.filter((p): p is string => !!p))].map(async (path) => {
      // The PDF renderer reads JPEG and PNG only; the protocol screens upload nothing else.
      const format = /\.png$/i.test(path) ? 'png' : /\.jpe?g$/i.test(path) ? 'jpg' : null
      if (!format) return
      const { data } = await supabase.storage.from(PROTOCOL_MEDIA_BUCKET).download(path)
      if (data) images.set(path, { data: Buffer.from(await data.arrayBuffer()), format })
    }),
  )
  return images
}

/**
 * Renders the PDF of a signed protocol, stores it in the private `protocols` bucket and
 * attaches it to the protocol (the only change the database allows after signing).
 * Returns the stored path and the file; throws when something fails, so the caller can
 * offer "generate again".
 */
export async function generateProtocolPdf(supabase: Client, protocolId: string): Promise<{ path: string; pdf: Buffer; filename: string }> {
  const { data: head } = await supabase.from('handover_protocols').select('booking_id').eq('id', protocolId).maybeSingle()
  if (!head) throw new Error('protocol_not_found')
  const [protocols, { data: booking }, settings] = await Promise.all([
    loadProtocols(supabase, head.booking_id),
    supabase.from('bookings').select('*, vehicles(name, license_plate, vin, fuel)').eq('id', head.booking_id).maybeSingle(),
    getSettings(supabase),
  ])
  const protocol = protocols.find((p) => p.id === protocolId)
  if (!protocol || !protocol.signed_at || !booking?.vehicles) throw new Error('protocol_not_signed')

  const pickup = protocol.type === 'return' ? latestSigned(protocols, 'pickup') : null
  const images = await downloadImages(supabase, [
    ...protocol.photos.map((p) => p.storage_path),
    ...protocol.damages.map((d) => d.photo_path),
    ...(pickup?.damages ?? []).map((d) => d.photo_path),
    protocol.customer_signature_path,
    protocol.staff_signature_path,
  ])
  const { vehicles: vehicle, ...bookingRow } = booking
  const pdf = await renderProtocolPdf(
    buildProtocolPdfData({ booking: bookingRow, vehicle, company: settings.company, protocol, pickup, supersedesVersion: protocols.find((p) => p.id === protocol.supersedes_id)?.version ?? null, images }),
  )

  const filename = `${booking.number}-${PROTOCOL_SLUG[protocol.type]}-protokol${protocol.version > 1 ? `-v${protocol.version}` : ''}.pdf`
  if (protocol.pdf_path) return { path: protocol.pdf_path, pdf, filename }
  const path = `${booking.id}/${crypto.randomUUID()}/${filename}`
  const { error: uploadError } = await supabase.storage.from(PROTOCOLS_BUCKET).upload(path, pdf, { contentType: 'application/pdf' })
  if (uploadError) throw new Error(`pdf_upload_failed: ${uploadError.message}`)
  const { error } = await supabase.from('handover_protocols').update({ pdf_path: path }).eq('id', protocolId)
  if (error) throw new Error(`pdf_attach_failed: ${error.message}`)
  return { path, pdf, filename }
}
