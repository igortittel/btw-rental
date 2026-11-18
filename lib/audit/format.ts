/**
 * Human-readable audit log: labels for tables, actions and the most common columns, and
 * value formatting (cents -> €, instants -> date, enums -> Slovak). Unknown columns fall
 * back to their technical name so nothing is ever hidden.
 */

export const AUDIT_AREAS = {
  rezervacie: { label: 'Rezervácie a platby', entities: ['bookings', 'booking_extras', 'booking_notes'] },
  doklady: { label: 'Doklady', entities: ['documents'] },
  zakaznici: { label: 'Zákazníci', entities: ['profiles', 'customer_internal'] },
  protokoly: { label: 'Protokoly a vyúčtovania', entities: ['handover_protocols', 'settlements'] },
  vozidla: { label: 'Vozidlá a cenník', entities: ['vehicles', 'vehicle_images', 'vehicle_features', 'features', 'vehicle_prices', 'price_tiers', 'extras', 'vehicle_extras', 'vehicle_categories', 'availability_blocks', 'locations'] },
  nastavenia: { label: 'Nastavenia', entities: ['settings'] },
  zamestnanci: { label: 'Zamestnanci', entities: ['staff_roles'] },
} as const
export type AuditArea = keyof typeof AUDIT_AREAS

export const ENTITY_LABELS: Record<string, string> = {
  bookings: 'Rezervácia',
  booking_extras: 'Doplnok rezervácie',
  booking_notes: 'Poznámka k rezervácii',
  documents: 'Doklad',
  profiles: 'Zákazník',
  customer_internal: 'Interné údaje zákazníka',
  handover_protocols: 'Protokol',
  settlements: 'Vyúčtovanie',
  vehicles: 'Vozidlo',
  vehicle_images: 'Fotka vozidla',
  vehicle_features: 'Výbava vozidla',
  features: 'Výbava',
  vehicle_prices: 'Cena vozidla',
  price_tiers: 'Cenová hladina',
  extras: 'Príplatok',
  vehicle_extras: 'Príplatok vozidla',
  vehicle_categories: 'Kategória',
  availability_blocks: 'Blokácia',
  locations: 'Miesto',
  settings: 'Nastavenie',
  staff_roles: 'Zamestnanec',
}

export function actionLabel(action: string): { label: string; tone: 'insert' | 'update' | 'delete' | 'gdpr' } {
  switch (action) {
    case 'insert':
      return { label: 'Vytvorenie', tone: 'insert' }
    case 'update':
      return { label: 'Zmena', tone: 'update' }
    case 'delete':
      return { label: 'Zmazanie', tone: 'delete' }
    case 'customer.anonymize':
      return { label: 'Anonymizácia', tone: 'gdpr' }
    case 'customer.delete':
      return { label: 'Vymazanie zákazníka', tone: 'gdpr' }
    case 'staff.mfa_reset':
      return { label: 'Reset 2FA', tone: 'gdpr' }
    default:
      return { label: action, tone: 'update' }
  }
}

const FIELD_LABELS: Record<string, string> = {
  status: 'Stav',
  pickup_at: 'Vyzdvihnutie',
  return_at: 'Vrátenie',
  vehicle_id: 'Vozidlo',
  total_cents: 'Cena s DPH',
  subtotal_cents: 'Prenájom',
  price_override_reason: 'Dôvod úpravy ceny',
  deposit_cents: 'Depozit',
  rental_payment_method: 'Spôsob platby prenájmu',
  rental_payment_status: 'Stav platby prenájmu',
  rental_paid_at: 'Prenájom uhradený',
  rental_paid_marked_by: 'Úhradu zaznamenal',
  rental_refunded_cents: 'Vrátená platba',
  rental_refunded_at: 'Platba vrátená',
  rental_refund_method: 'Spôsob vrátenia platby',
  rental_refund_note: 'Poznámka k vráteniu platby',
  deposit_payment_method: 'Spôsob platby depozitu',
  deposit_status: 'Stav depozitu',
  deposit_received_at: 'Depozit prijatý',
  deposit_received_marked_by: 'Prijatie zaznamenal',
  deposit_returned_cents: 'Vrátený depozit',
  deposit_returned_at: 'Depozit vrátený',
  deposit_return_method: 'Spôsob vrátenia depozitu',
  deposit_return_note: 'Poznámka k vráteniu depozitu',
  deposit_returned_marked_by: 'Vrátenie zaznamenal',
  cancellation_fee_cents: 'Storno poplatok',
  cancellation_reason: 'Dôvod zrušenia',
  cancelled_at: 'Zrušená',
  customer_note: 'Poznámka zákazníka',
  pickup_reminder_sent_at: 'Pripomienka vyzdvihnutia',
  return_reminder_sent_at: 'Pripomienka vrátenia',
  review_requested_at: 'Žiadosť o recenziu',
  is_blacklisted: 'Blacklist',
  blacklist_note: 'Dôvod blacklistu',
  internal_note: 'Interná poznámka',
  deletion_requested_at: 'Žiadosť o vymazanie',
  refund_iban: 'Účet na vrátenie',
  first_name: 'Meno',
  last_name: 'Priezvisko',
  phone: 'Telefón',
  email: 'E-mail',
  type: 'Typ',
  number: 'Číslo',
  amount_cents: 'Suma',
  issued_at: 'Vystavený',
  storage_path: 'Súbor',
  emailed_at: 'Odoslaný e-mailom',
  approved_at: 'Potvrdené',
  fuel_cents: 'Palivo',
  extra_km_cents: 'Kilometre nad limit',
  damage_cents: 'Poškodenia',
  late_cents: 'Meškanie',
  other_cents: 'Iné',
  note: 'Poznámka',
  name: 'Názov',
  is_active: 'Aktívne',
  role: 'Rola',
  value: 'Hodnota',
  starts_at: 'Od',
  ends_at: 'Do',
  reason: 'Dôvod',
  price_per_day_cents: 'Cena za deň',
  price_cents: 'Cena',
  signed_at: 'Podpísaný',
  pdf_path: 'PDF',
}

const ENUMS: Record<string, string> = {
  new: 'Nová', confirmed: 'Potvrdená', modified: 'Upravená', active: 'Prebiehajúca', completed: 'Ukončená', cancelled: 'Zrušená',
  unpaid: 'Neuhradené', paid: 'Uhradené', refunded: 'Vrátené', partially_refunded: 'Čiastočne vrátené',
  pending: 'Neprijatý', received: 'Prijatý', returned: 'Vrátený', partially_returned: 'Čiastočne vrátený',
  transfer: 'Prevodom', terminal: 'Terminálom', cash: 'V hotovosti',
  proforma: 'Zálohová faktúra', invoice: 'Faktúra', credit_note: 'Dobropis', settlement: 'Doúčtovanie',
  operator: 'Operátor', manager: 'Manažér', owner: 'Majiteľ',
}

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key
}

const euro = new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' })
const dateTime = new Intl.DateTimeFormat('sk-SK', { timeZone: 'Europe/Bratislava', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** One value of a diff, formatted by its column. */
export function formatAuditValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'áno' : 'nie'
  if (typeof value === 'number' && key.endsWith('_cents')) return euro.format(value / 100)
  if (typeof value === 'string') {
    if (/_at$/.test(key) && /^\d{4}-\d{2}-\d{2}T/.test(value)) return dateTime.format(new Date(value))
    if (ENUMS[value] && (key === 'status' || key.endsWith('_status') || key.endsWith('_method') || key === 'type' || key === 'role')) return ENUMS[value]
    return value.length > 160 ? `${value.slice(0, 157)}…` : value
  }
  const text = JSON.stringify(value)
  return text.length > 160 ? `${text.slice(0, 157)}…` : text
}

export type AuditChange = { field: string; before: string; after: string }

const HIDDEN = new Set(['updated_at', 'created_at', 'blocked_until', 'price_snapshot', 'customer_snapshot', 'pending_change', 'id'])

/**
 * Rows of the diff table. Updates store {column: {old, new}}, inserts {new: row},
 * deletes {old: row}; redacted tables store {column: {changed: true}} (values not kept).
 */
export function auditChanges(action: string, diff: unknown): AuditChange[] {
  if (!diff || typeof diff !== 'object') return []
  const d = diff as Record<string, unknown>
  if (action === 'insert' && d.new && typeof d.new === 'object') {
    return Object.entries(d.new as Record<string, unknown>)
      .filter(([k, v]) => !HIDDEN.has(k) && v !== null && v !== '')
      .map(([k, v]) => ({ field: fieldLabel(k), before: '—', after: formatAuditValue(k, v) }))
  }
  if (action === 'delete' && d.old && typeof d.old === 'object') {
    return Object.entries(d.old as Record<string, unknown>)
      .filter(([k, v]) => !HIDDEN.has(k) && v !== null && v !== '')
      .map(([k, v]) => ({ field: fieldLabel(k), before: formatAuditValue(k, v), after: '—' }))
  }
  if (action.startsWith('customer.')) {
    return [{ field: 'Rezervácie', before: '', after: String(d.bookings ?? 0) }, ...(d.requested_at ? [{ field: 'Žiadosť zákazníka', before: '', after: formatAuditValue('requested_at', d.requested_at) }] : [])]
  }
  return Object.entries(d)
    .filter(([k]) => !HIDDEN.has(k))
    .map(([k, v]) => {
      const change = (v ?? {}) as { old?: unknown; new?: unknown; changed?: boolean }
      if (change.changed) return { field: fieldLabel(k), before: '(skryté)', after: '(zmenené)' }
      return { field: fieldLabel(k), before: formatAuditValue(k, change.old), after: formatAuditValue(k, change.new) }
    })
}
