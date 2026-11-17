import type { Database } from '@/types/database'

export type ProtocolType = Database['public']['Enums']['protocol_type']
export type DamageView = Database['public']['Enums']['damage_view']

/** URL segment of each protocol type in the admin. */
export const PROTOCOL_SLUG: Record<ProtocolType, string> = { pickup: 'odovzdavaci', return: 'preberaci' }
export function protocolTypeFromSlug(slug: string): ProtocolType | null {
  return slug === 'odovzdavaci' ? 'pickup' : slug === 'preberaci' ? 'return' : null
}
export const PROTOCOL_TITLE: Record<ProtocolType, string> = { pickup: 'Odovzdávací protokol', return: 'Preberací protokol' }

export const DAMAGE_VIEWS: { key: DamageView; label: string }[] = [
  { key: 'left', label: 'Ľavý bok' },
  { key: 'right', label: 'Pravý bok' },
  { key: 'front', label: 'Predok' },
  { key: 'rear', label: 'Zadok' },
  { key: 'top', label: 'Zhora' },
]
export const DAMAGE_VIEW_LABEL = Object.fromEntries(DAMAGE_VIEWS.map((v) => [v.key, v.label])) as Record<DamageView, string>

export const DAMAGE_KINDS = [
  { key: 'scratch', label: 'Škrabanec' },
  { key: 'dent', label: 'Preliačina' },
  { key: 'scuff', label: 'Odrenina' },
  { key: 'crack', label: 'Prasklina' },
  { key: 'other', label: 'Iné' },
] as const
export type DamageKind = (typeof DAMAGE_KINDS)[number]['key']
export const DAMAGE_KIND_LABEL = Object.fromEntries(DAMAGE_KINDS.map((k) => [k.key, k.label])) as Record<string, string>

export const PHOTO_ANGLES = [
  { key: 'front', label: 'Spredu', required: true },
  { key: 'rear', label: 'Zozadu', required: true },
  { key: 'left', label: 'Ľavý bok', required: true },
  { key: 'right', label: 'Pravý bok', required: true },
  { key: 'interior', label: 'Interiér', required: false },
  { key: 'odometer', label: 'Tachometer', required: false },
  { key: 'other', label: 'Iné', required: false },
] as const
export type PhotoAngle = (typeof PHOTO_ANGLES)[number]['key']
export const PHOTO_ANGLE_LABEL = Object.fromEntries(PHOTO_ANGLES.map((a) => [a.key, a.label])) as Record<string, string>
export const REQUIRED_ANGLES = PHOTO_ANGLES.filter((a) => a.required).map((a) => a.key)

export const CLEANLINESS = [
  { key: 'clean', label: 'Čisté' },
  { key: 'light', label: 'Mierne znečistené' },
  { key: 'dirty', label: 'Znečistené' },
] as const
export type Cleanliness = (typeof CLEANLINESS)[number]['key']
export const CLEANLINESS_LABEL = Object.fromEntries(CLEANLINESS.map((c) => [c.key, c.label])) as Record<string, string>

/** One line of the accessories checklist. `quantity` only for countable items (keys, extras with pieces). */
export type Accessory = { key: string; label: string; hint?: string; present: boolean; quantity?: number }

/** Standard checklist; booking extras are appended by defaultAccessories(). */
export const STANDARD_ACCESSORIES: Omit<Accessory, 'present'>[] = [
  { key: 'registration', label: 'Osvedčenie o evidencii', hint: 'malý technický preukaz' },
  { key: 'green_card', label: 'Zelená karta', hint: 'doklad o poistení' },
  { key: 'keys', label: 'Kľúče', quantity: 2 },
  { key: 'triangle', label: 'Výstražný trojuholník' },
  { key: 'first_aid', label: 'Lekárnička' },
  { key: 'vest', label: 'Reflexná vesta' },
  { key: 'spare', label: 'Rezerva / lepiaca sada' },
]

/** Checklist of a new pickup protocol: the standard items plus the extras ordered with the booking. */
export function defaultAccessories(extras: { id: string; name: string; quantity: number }[]): Accessory[] {
  return [
    ...STANDARD_ACCESSORIES.map((item) => ({ ...item, present: true })),
    ...extras.map((extra) => ({ key: `extra:${extra.id}`, label: extra.name, hint: 'doplnok z rezervácie', present: true, ...(extra.quantity > 1 ? { quantity: extra.quantity } : {}) })),
  ]
}

/** Checklist of a return protocol: what was handed over, everything pre-marked as returned. */
export function returnAccessories(pickup: Accessory[]): Accessory[] {
  return pickup.filter((item) => item.present && (item.quantity === undefined || item.quantity > 0)).map((item) => ({ ...item }))
}

/** Items handed over at pickup that did not come back (or came back in a smaller number). */
export function missingAccessories(pickup: Accessory[], returned: Accessory[]): string[] {
  const result: string[] = []
  for (const item of pickup) {
    if (!item.present) continue
    const back = returned.find((r) => r.key === item.key)
    if (!back || !back.present) result.push(item.label)
    else if (item.quantity !== undefined && (back.quantity ?? 0) < item.quantity) result.push(`${item.label} (${back.quantity ?? 0} z ${item.quantity})`)
  }
  return result
}

// Fuel is entered in eighths of a tank and stored as whole percent.
export function eighthsToPercent(eighths: number): number {
  return Math.round(Math.min(8, Math.max(0, eighths)) * 12.5)
}
export function percentToEighths(percent: number | null | undefined): number | null {
  return percent === null || percent === undefined ? null : Math.round(percent / 12.5)
}
export function fuelLabel(percent: number | null | undefined): string {
  const eighths = percentToEighths(percent)
  return eighths === null ? '—' : `${eighths}/8 · ${percent} %`
}

export function usesFuel(fuel: string): boolean {
  return fuel !== 'electric'
}
export function usesCharge(fuel: string): boolean {
  return fuel === 'electric' || fuel === 'plug_in_hybrid'
}

export type DraftDamage = { id: string; view: DamageView; x: number; y: number; kind: DamageKind; description: string; photoPath: string | null }
export type DraftPhoto = { angle: PhotoAngle; path: string }

/** Everything the wizard edits. Mirrors the jsonb accepted by save_protocol_draft(). */
export type ProtocolDraft = {
  handoverAt: string // "YYYY-MM-DDTHH:mm", Europe/Bratislava
  odometerKm: number | null
  fuelLevel: number | null
  chargeLevel: number | null
  interior: Cleanliness
  exterior: Cleanliness
  accessories: Accessory[]
  note: string
  customerName: string
  staffName: string
  driverLicenseNo: string
  idDocumentNo: string
  damages: DraftDamage[]
  photos: DraftPhoto[]
}

/**
 * What still has to be filled in before the protocol can be signed (Slovak, for the list on
 * the last step). The database repeats these checks in sign_protocol().
 */
export function protocolMissing(draft: ProtocolDraft, opts: { fuel: string; pickupOdometerKm?: number | null; customerSigned: boolean; staffSigned: boolean }): string[] {
  const missing: string[] = []
  if (!draft.handoverAt) missing.push('dátum a čas')
  if (draft.odometerKm === null) missing.push('stav tachometra')
  else if (opts.pickupOdometerKm != null && draft.odometerKm < opts.pickupOdometerKm) missing.push('tachometer je nižší ako pri odovzdaní')
  if (usesFuel(opts.fuel) && draft.fuelLevel === null) missing.push('stav paliva')
  if (!usesFuel(opts.fuel) && draft.chargeLevel === null) missing.push('nabitie batérie')
  for (const angle of PHOTO_ANGLES) {
    if (angle.required && !draft.photos.some((photo) => photo.angle === angle.key)) missing.push(`fotka: ${angle.label.toLowerCase()}`)
  }
  draft.damages.forEach((damage, index) => {
    if (!damage.description.trim()) missing.push(`popis nového poškodenia (${index + 1}.)`)
  })
  if (!draft.customerName.trim()) missing.push('meno zákazníka')
  if (!draft.staffName.trim()) missing.push('meno zamestnanca')
  if (!opts.customerSigned) missing.push('podpis zákazníka')
  if (!opts.staffSigned) missing.push('podpis zamestnanca')
  return missing
}

/** Human message for the errors raised by start_protocol / save_protocol_draft / sign_protocol. */
export function protocolErrorMessage(message: string): string | null {
  if (message.includes('protocol_not_editable')) return 'Protokol je už podpísaný alebo neexistuje. Obnovte stránku.'
  if (message.includes('odometer_below_pickup')) return 'Stav tachometra je nižší ako pri odovzdaní vozidla.'
  if (message.includes('booking_status_mismatch')) return 'Stav rezervácie tento protokol neumožňuje (odovzdávací sa robí pri potvrdenej, preberací pri prebiehajúcej rezervácii).'
  if (message.includes('invalid_storage_path')) return 'Niektorý súbor nepatrí k tejto rezervácii. Nahrajte ho znova.'
  if (message.includes('protocol_incomplete')) {
    const what = message.split('protocol_incomplete:')[1]?.trim() ?? ''
    const labels: Record<string, string> = { handover_at: 'dátum a čas', odometer: 'stav tachometra', fuel: 'stav paliva alebo nabitie', names: 'mená podpisujúcich', photos: 'štyri povinné fotky', damage_description: 'popis každého poškodenia', signatures: 'oba podpisy' }
    return `Protokol nie je úplný – chýba: ${labels[what] ?? what}.`
  }
  return null
}
