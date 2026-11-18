'use server'

import { revalidatePath } from 'next/cache'
import { checkbox, dbErrorMessage, optionalInt, optionalText, staffAction, text, type ActionState } from '@/lib/admin/action'
import { parseEuroToCents } from '@/lib/format'
import { formatIban, isValidIban } from '@/lib/iban'
import { PUBLIC_SETTING_KEYS, settingsSchema, type SettingKey, type Settings } from '@/lib/settings'
import type { Json } from '@/types/database'

type Client = Parameters<Parameters<typeof staffAction>[1]>[0]['supabase']

/** Validates each value against the settings schema and upserts it. Owner only (also enforced by RLS). */
async function saveSettings(supabase: Client, userId: string, values: Partial<Settings>, message: string): Promise<ActionState> {
  const rows = []
  for (const [key, value] of Object.entries(values) as [SettingKey, unknown][]) {
    const parsed = settingsSchema.shape[key].safeParse(value)
    if (!parsed.success) return { error: 'Niektorá hodnota nie je platná. Skontrolujte formulár.' }
    rows.push({ key, value: parsed.data as Json, is_public: PUBLIC_SETTING_KEYS.includes(key), updated_by: userId })
  }
  const { error } = await supabase.from('settings').upsert(rows)
  if (error) return { error: dbErrorMessage(error) }
  revalidatePath('/admin/nastavenia')
  return { ok: true, message }
}

function int(formData: FormData, name: string, min: number, max: number): number | null {
  const value = optionalInt(formData, name)
  return value === null || Number.isNaN(value) || value < min || value > max ? null : value
}

export async function saveCompanyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('owner', async ({ supabase, userId }) => {
    const name = text(formData, 'name')
    const address = text(formData, 'address')
    if (!name || !address) return { error: 'Zadajte názov firmy aj adresu.' }
    const vat = Number(text(formData, 'vat_rate').replace(',', '.'))
    if (!Number.isFinite(vat) || vat < 0 || vat > 100) return { error: 'Sadzba DPH musí byť 0 až 100 %.' }
    return saveSettings(
      supabase,
      userId,
      {
        company: {
          name,
          address,
          ico: optionalText(formData, 'ico'),
          dic: optionalText(formData, 'dic'),
          ic_dph: optionalText(formData, 'ic_dph'),
          phone: optionalText(formData, 'phone'),
          email: optionalText(formData, 'email'),
          web: optionalText(formData, 'web'),
        },
        vat_rate: vat,
      },
      'Firemné údaje uložené.',
    )
  })
}

export async function saveBankAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('owner', async ({ supabase, userId }) => {
    const iban = text(formData, 'iban')
    if (!isValidIban(iban)) return { error: 'IBAN nie je platný. Skontrolujte, či ste ho zadali celý a bez preklepu.' }
    const swift = text(formData, 'swift').toUpperCase()
    if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(swift)) return { error: 'SWIFT/BIC má 8 alebo 11 znakov.' }
    const accountName = text(formData, 'account_name')
    if (!accountName) return { error: 'Zadajte názov účtu.' }

    const methods = (['transfer', 'terminal', 'cash'] as const).filter((m) => checkbox(formData, `method_${m}`))
    if (methods.length === 0) return { error: 'Povoľte aspoň jednu platobnú metódu.' }
    const due = int(formData, 'payment_due_days', 0, 60)
    if (due === null) return { error: 'Splatnosť zadajte v dňoch (0 až 60).' }

    return saveSettings(
      supabase,
      userId,
      { bank: { iban: formatIban(iban), swift, account_name: accountName, is_placeholder: false }, payment_methods: methods, payment_due_days: due, require_payment_before_pickup: checkbox(formData, 'require_payment_before_pickup') },
      'Bankové údaje a platby uložené.',
    )
  })
}

export async function saveBookingRulesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('owner', async ({ supabase, userId }) => {
    const lead = int(formData, 'min_lead_hours', 0, 8760)
    const minDays = int(formData, 'min_rental_days', 1, 365)
    const tolerance = int(formData, 'return_tolerance_minutes', 0, 720)
    const buffer = int(formData, 'default_buffer_hours', 0, 720)
    const modification = int(formData, 'modification_deadline_hours', 0, 8760)
    if ([lead, minDays, tolerance, buffer, modification].includes(null)) return { error: 'Vyplňte všetky polia nezápornými celými číslami.' }
    return saveSettings(
      supabase,
      userId,
      {
        min_lead_hours: lead!,
        min_rental_days: minDays!,
        return_tolerance_minutes: tolerance!,
        default_buffer_minutes: buffer! * 60,
        modification_deadline_hours: modification!,
        operating_24_7: true,
      },
      'Pravidlá rezervácie uložené.',
    )
  })
}

export async function saveConditionsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('owner', async ({ supabase, userId }) => {
    const deposit = parseEuroToCents(text(formData, 'deposit'))
    const extraKm = parseEuroToCents(text(formData, 'extra_km'))
    const kmLimit = int(formData, 'km_limit_per_day', 1, 100000)
    const minAge = int(formData, 'min_driver_age', 18, 99)
    const minLicense = int(formData, 'min_license_months', 0, 600)
    if (deposit === null || Number.isNaN(deposit) || extraKm === null || Number.isNaN(extraKm)) return { error: 'Depozit a cenu za km zadajte v eurách.' }
    if ([kmLimit, minAge, minLicense].includes(null)) return { error: 'Skontrolujte limit km, minimálny vek (18–99) a dobu vlastníctva VP.' }
    return saveSettings(
      supabase,
      userId,
      { deposit_cents: deposit, extra_km_cents: extraKm, km_limit_per_day: kmLimit!, min_driver_age: minAge!, min_license_months: minLicense! },
      'Podmienky prenájmu uložené.',
    )
  })
}

export async function saveCancellationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('owner', async ({ supabase, userId }) => {
    const upper = int(formData, 'upper_hours', 1, 8760)
    const lower = int(formData, 'lower_hours', 0, 8760)
    const pctFree = int(formData, 'percent_above', 0, 100)
    const pctMid = int(formData, 'percent_between', 0, 100)
    const pctLate = int(formData, 'percent_below', 0, 100)
    if ([upper, lower, pctFree, pctMid, pctLate].includes(null)) return { error: 'Vyplňte hranice v hodinách a poplatky v percentách (0–100).' }
    if (lower! >= upper!) return { error: 'Druhá hranica musí byť bližšie k vyzdvihnutiu ako prvá (menej hodín).' }
    if (pctFree! > pctMid! || pctMid! > pctLate!) return { error: 'Poplatok sa má s blížiacim sa vyzdvihnutím zvyšovať, nie klesať.' }
    return saveSettings(
      supabase,
      userId,
      {
        cancellation_tiers: [
          { min_hours: upper!, fee_percent: pctFree! },
          { min_hours: lower!, fee_percent: pctMid! },
          { min_hours: 0, fee_percent: pctLate! },
        ],
      },
      'Storno podmienky uložené.',
    )
  })
}

export async function saveAssistanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('owner', async ({ supabase, userId }) => {
    const phone = text(formData, 'phone')
    if (!/^\+?[0-9 ()/-]{6,20}$/.test(phone)) return { error: 'Zadajte telefónne číslo asistenčnej služby, napr. +421 900 000 000.' }
    return saveSettings(
      supabase,
      userId,
      { assistance: { phone, insurer: optionalText(formData, 'insurer'), policy_number: optionalText(formData, 'policy_number'), note: optionalText(formData, 'note') } },
      'Asistenčné kontakty uložené.',
    )
  })
}

export async function saveNotificationsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('owner', async ({ supabase, userId }) => {
    const emails = text(formData, 'emails').split(/[\s,;]+/).map((e) => e.toLowerCase()).filter(Boolean)
    if (emails.length === 0 || emails.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) {
      return { error: 'Zadajte aspoň jednu platnú e-mailovú adresu (viac adries oddeľte čiarkou).' }
    }
    const reviewDays = int(formData, 'review_request_days', 0, 365)
    if (reviewDays === null) return { error: 'Počet dní do žiadosti o recenziu musí byť 0 až 365.' }
    const reviewUrl = optionalText(formData, 'google_review_url')
    if (reviewUrl && !/^https:\/\//.test(reviewUrl)) return { error: 'Odkaz na Google recenziu musí začínať https://' }
    return saveSettings(supabase, userId, { admin_notification_emails: [...new Set(emails)], review_request_days: reviewDays, google_review_url: reviewUrl }, 'Notifikácie uložené.')
  })
}

export async function saveLegalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('owner', async ({ supabase, userId }) => {
    const termsUrl = text(formData, 'terms_url')
    const gdprUrl = text(formData, 'gdpr_url')
    if (!/^https:\/\//.test(termsUrl) || !/^https:\/\//.test(gdprUrl)) return { error: 'Oba odkazy musia začínať https://' }

    const { data: current } = await supabase.from('settings').select('key, value').in('key', ['terms_version', 'gdpr_version'])
    const version = (key: string) => Number(current?.find((r) => r.key === key)?.value ?? 1) || 1
    const values: Partial<Settings> = { terms_url: termsUrl, gdpr_url: gdprUrl }
    // A new version is stored with every consent given from now on.
    if (checkbox(formData, 'bump_terms')) values.terms_version = String(version('terms_version') + 1)
    if (checkbox(formData, 'bump_gdpr')) values.gdpr_version = String(version('gdpr_version') + 1)
    return saveSettings(supabase, userId, values, 'Právne dokumenty uložené.')
  })
}

/** Tier boundaries: the upper day limit of each priced tier; the last tier is open-ended (individual price). */
export async function savePriceTiersAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('owner', async ({ supabase, userId }) => {
    const { data: tiers } = await supabase.from('price_tiers').select('id, min_days, max_days').order('min_days')
    const priced = (tiers ?? []).filter((t) => t.max_days !== null)
    const open = (tiers ?? []).find((t) => t.max_days === null)
    if (priced.length === 0 || !open) return { error: 'Cenové hladiny nie sú inicializované.' }

    const bounds: number[] = []
    for (const tier of priced) {
      const value = int(formData, `max_${tier.id}`, 1, 365)
      if (value === null) return { error: 'Každá hranica musí byť celé číslo 1 až 365.' }
      if (bounds.length > 0 && value <= bounds[bounds.length - 1]) return { error: 'Hranice musia rásť: každá hladina končí neskôr ako predchádzajúca.' }
      bounds.push(value)
    }

    // min_days is unique: move everything out of the way first, then write the final values.
    const OFFSET = 100000
    for (const tier of [...priced, open]) {
      const { error } = await supabase
        .from('price_tiers')
        .update({ min_days: tier.min_days + OFFSET, max_days: tier.max_days === null ? null : tier.max_days + OFFSET })
        .eq('id', tier.id)
      if (error) return { error: dbErrorMessage(error) }
    }
    for (const [index, tier] of priced.entries()) {
      const { error } = await supabase
        .from('price_tiers')
        .update({ min_days: index === 0 ? 1 : bounds[index - 1] + 1, max_days: bounds[index] })
        .eq('id', tier.id)
      if (error) return { error: dbErrorMessage(error) }
    }
    const individualFrom = bounds[bounds.length - 1] + 1
    const { error } = await supabase.from('price_tiers').update({ min_days: individualFrom, max_days: null }).eq('id', open.id)
    if (error) return { error: dbErrorMessage(error) }

    return saveSettings(supabase, userId, { individual_price_from_days: individualFrom }, 'Cenové hladiny uložené.')
  })
}
