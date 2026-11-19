import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const nullableText = z.string().nullable()

/** Shape of every key in the `settings` table. Unknown or malformed values fall back to the defaults. */
export const settingsSchema = z.object({
  company: z.object({
    name: z.string(),
    address: z.string(),
    ico: nullableText,
    dic: nullableText,
    ic_dph: nullableText,
    phone: nullableText,
    email: nullableText,
    web: nullableText,
  }),
  vat_rate: z.number().min(0).max(100),
  operating_24_7: z.boolean(),
  bank: z.object({ iban: z.string(), swift: z.string(), account_name: z.string(), is_placeholder: z.boolean().optional() }),
  payment_methods: z.array(z.enum(['transfer', 'terminal', 'cash'])),
  payment_due_days: z.number().int().min(0),
  require_payment_before_pickup: z.boolean(),
  min_lead_hours: z.number().int().min(0),
  min_rental_days: z.number().int().min(1),
  return_tolerance_minutes: z.number().int().min(0),
  default_buffer_minutes: z.number().int().min(0),
  individual_price_from_days: z.number().int().min(2),
  cancellation_tiers: z.array(z.object({ min_hours: z.number().int().min(0), fee_percent: z.number().min(0).max(100) })),
  modification_deadline_hours: z.number().int().min(0),
  deposit_cents: z.number().int().min(0),
  km_limit_per_day: z.number().int().min(1),
  extra_km_cents: z.number().int().min(0),
  min_driver_age: z.number().int().min(18).max(99),
  min_license_months: z.number().int().min(0),
  assistance: z.object({ phone: z.string(), insurer: nullableText, policy_number: nullableText, note: nullableText }),
  admin_notification_emails: z.array(z.string()),
  email_from: z.string(),
  email_reply_to: z.string(),
  terms_version: z.string(),
  gdpr_version: z.string(),
  terms_url: z.string(),
  gdpr_url: z.string(),
  review_request_days: z.number().int().min(0),
  google_review_url: nullableText,
  timezone: z.string(),
})

export type Settings = z.infer<typeof settingsSchema>
export type SettingKey = keyof Settings

/** Values from the brief; used when a key is missing from the database. */
export const DEFAULT_SETTINGS: Settings = {
  company: { name: 'BY THE WAVE, s.r.o.', address: 'Trenčianska 56/A, 821 09 Bratislava', ico: null, dic: null, ic_dph: null, phone: null, email: 'btw@btw.sk', web: 'https://www.btw.sk' },
  vat_rate: 23,
  operating_24_7: true,
  bank: { iban: '', swift: '', account_name: 'BY THE WAVE, s.r.o.', is_placeholder: true },
  payment_methods: ['transfer', 'terminal', 'cash'],
  payment_due_days: 3,
  require_payment_before_pickup: true,
  min_lead_hours: 24,
  min_rental_days: 1,
  return_tolerance_minutes: 59,
  default_buffer_minutes: 240,
  individual_price_from_days: 31,
  cancellation_tiers: [
    { min_hours: 72, fee_percent: 0 },
    { min_hours: 24, fee_percent: 20 },
    { min_hours: 0, fee_percent: 100 },
  ],
  modification_deadline_hours: 48,
  deposit_cents: 100000,
  km_limit_per_day: 300,
  extra_km_cents: 62,
  min_driver_age: 21,
  min_license_months: 6,
  assistance: { phone: '+421900000000', insurer: null, policy_number: null, note: 'nonstop' },
  admin_notification_emails: ['btw@btw.sk'],
  email_from: 'BY THE WAVE <info@rental.btw.sk>',
  email_reply_to: 'btw@btw.sk',
  terms_version: '1',
  gdpr_version: '1',
  terms_url: 'https://www.btw.sk/vseobecne-obchodne-podmienky',
  gdpr_url: 'https://www.btw.sk/ochrana-osobnych-udajov',
  review_request_days: 3,
  google_review_url: null,
  timezone: 'Europe/Bratislava',
}

/** Keys exposed to the public site through the `public_settings` view. */
export const PUBLIC_SETTING_KEYS: SettingKey[] = [
  'company',
  'vat_rate',
  'operating_24_7',
  'payment_methods',
  'min_lead_hours',
  'min_rental_days',
  'return_tolerance_minutes',
  'individual_price_from_days',
  'cancellation_tiers',
  'modification_deadline_hours',
  'deposit_cents',
  'km_limit_per_day',
  'extra_km_cents',
  'min_driver_age',
  'min_license_months',
  'terms_version',
  'gdpr_version',
  'terms_url',
  'gdpr_url',
  'timezone',
]

/** Merges rows of {key, value} over the defaults, validating each key separately. */
export function parseSettings(rows: { key: string | null; value: unknown }[]): Settings {
  const result: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const row of rows) {
    if (!row.key || !(row.key in settingsSchema.shape)) continue
    const parsed = settingsSchema.shape[row.key as SettingKey].safeParse(row.value)
    if (parsed.success) result[row.key] = parsed.data
  }
  return result as Settings
}

/** All settings; requires a staff session (RLS) or the service role. */
export async function getSettings(supabase: SupabaseClient<Database>): Promise<Settings> {
  const { data } = await supabase.from('settings').select('key, value')
  return parseSettings(data ?? [])
}
