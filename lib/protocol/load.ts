import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Accessory, Cleanliness, DamageKind, DamageView, PhotoAngle, ProtocolDraft, ProtocolType } from '@/lib/protocol/model'
import { utcToZonedLocal } from '@/lib/time'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>
export type ProtocolRow = Database['public']['Tables']['handover_protocols']['Row']
export type DamageRow = Database['public']['Tables']['protocol_damages']['Row']
export type PhotoRow = Database['public']['Tables']['protocol_photos']['Row']
export type LoadedProtocol = ProtocolRow & { damages: DamageRow[]; photos: PhotoRow[] }

export const PROTOCOL_MEDIA_BUCKET = 'protocol-media'
export const PROTOCOLS_BUCKET = 'protocols'

/** Every protocol of a booking (drafts and all signed versions) with damages and photos, oldest first. */
export async function loadProtocols(supabase: Client, bookingId: string): Promise<LoadedProtocol[]> {
  const { data: rows } = await supabase.from('handover_protocols').select('*').eq('booking_id', bookingId).order('type').order('version')
  if (!rows?.length) return []
  const ids = rows.map((row) => row.id)
  const [{ data: damages }, { data: photos }] = await Promise.all([
    supabase.from('protocol_damages').select('*').in('protocol_id', ids).order('created_at').order('id'),
    supabase.from('protocol_photos').select('*').in('protocol_id', ids).order('created_at'),
  ])
  return rows.map((row) => ({
    ...row,
    damages: (damages ?? []).filter((damage) => damage.protocol_id === row.id),
    photos: (photos ?? []).filter((photo) => photo.protocol_id === row.id),
  }))
}

/** The valid protocol of a type: the signed version with the highest number. */
export function latestSigned<T extends { type: ProtocolType; version: number; signed_at: string | null }>(protocols: T[], type: ProtocolType): T | null {
  return protocols.filter((p) => p.type === type && p.signed_at).sort((a, b) => b.version - a.version)[0] ?? null
}
export function draftOf<T extends { type: ProtocolType; signed_at: string | null }>(protocols: T[], type: ProtocolType): T | null {
  return protocols.find((p) => p.type === type && !p.signed_at) ?? null
}

export function cleanlinessOf(row: Pick<ProtocolRow, 'cleanliness'>): { interior: Cleanliness; exterior: Cleanliness } {
  const value = (row.cleanliness ?? {}) as { interior?: Cleanliness; exterior?: Cleanliness }
  return { interior: value.interior ?? 'clean', exterior: value.exterior ?? 'clean' }
}
export function accessoriesOf(row: Pick<ProtocolRow, 'accessories'>): Accessory[] {
  return Array.isArray(row.accessories) ? (row.accessories as unknown as Accessory[]) : []
}

/** Database rows -> the shape edited by the wizard. */
export function protocolToDraft(protocol: LoadedProtocol, fallback: { accessories: Accessory[]; customerName: string; staffName: string }): ProtocolDraft {
  const accessories = accessoriesOf(protocol)
  return {
    handoverAt: utcToZonedLocal(protocol.handover_at ?? new Date()),
    odometerKm: protocol.odometer_km,
    fuelLevel: protocol.fuel_level,
    chargeLevel: protocol.charge_level,
    ...cleanlinessOf(protocol),
    accessories: accessories.length > 0 ? accessories : fallback.accessories,
    note: protocol.note ?? '',
    customerName: protocol.signed_by_name ?? fallback.customerName,
    staffName: protocol.staff_name ?? fallback.staffName,
    driverLicenseNo: protocol.driver_license_no ?? '',
    idDocumentNo: protocol.id_document_no ?? '',
    damages: protocol.damages.map((d) => ({ id: d.id, view: d.view as DamageView, x: Number(d.x), y: Number(d.y), kind: d.kind as DamageKind, description: d.description, photoPath: d.photo_path })),
    photos: protocol.photos.map((p) => ({ angle: p.angle as PhotoAngle, path: p.storage_path })),
  }
}

/** Short-lived URLs for private protocol media (staff session). Missing files are simply absent from the map. */
export async function signedMediaUrls(supabase: Client, paths: (string | null | undefined)[], expiresIn = 3600): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))]
  if (unique.length === 0) return {}
  const { data } = await supabase.storage.from(PROTOCOL_MEDIA_BUCKET).createSignedUrls(unique, expiresIn)
  const result: Record<string, string> = {}
  for (const item of data ?? []) if (item.path && item.signedUrl) result[item.path] = item.signedUrl
  return result
}
