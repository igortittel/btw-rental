import 'server-only'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import { parseSettings, type Settings } from '@/lib/settings'
import type { Database } from '@/types/database'

type Enums = Database['public']['Enums']
export type Localized = { sk?: string; en?: string }

export type PublicCategory = { id: string; slug: string; name: Localized; vehicleCount: number }
export type PublicImage = { id: string; path: string; alt: Localized; width: number | null; height: number | null; isMain: boolean }
export type PublicFeature = { id: string; group: Enums['feature_group']; name: Localized }
export type PublicPrice = { tierId: string; minDays: number; maxDays: number | null; pricePerDayCents: number | null }
export type PublicExtra = {
  id: string
  code: string | null
  name: Localized
  description: Localized
  priceCents: number
  pricingType: Enums['extra_pricing_type']
  maxQuantity: number
  maxChargeCents: number | null
}
export type PublicVehicle = {
  id: string
  slug: string
  vin: string
  name: string
  brand: string
  model: string
  variant: string | null
  categorySlug: string
  categoryName: Localized
  engine: string | null
  powerKw: number | null
  powerHp: number | null
  gears: number | null
  drivetrain: Enums['drivetrain_type'] | null
  fuel: Enums['fuel_type']
  transmission: Enums['transmission_type']
  seats: number
  luggage: number | null
  description: Localized
  depositCents: number
  kmLimitPerDay: number
  extraKmCents: number
  minDriverAge: number
  minLicenseMonths: number
  priceFromCents: number | null
  prices: PublicPrice[]
  images: PublicImage[]
  features: PublicFeature[]
  extras: PublicExtra[]
  updatedAt: string
}
export type PublicLocation = { id: string; name: Localized; address: string; mapUrl: string | null; surchargeCents: number; forPickup: boolean; forReturn: boolean; isDefault: boolean }
export type Catalog = { categories: PublicCategory[]; vehicles: PublicVehicle[]; locations: PublicLocation[]; settings: Settings }

/** Anonymous, cookie-less client: reads only the public_* views and RPC. */
export function createPublicClient() {
  return createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON columns of the public views */
/** Uncached read – used where stale prices must never be used (creating a booking). */
export async function loadCatalog(): Promise<Catalog> {
  const supabase = createPublicClient()
  const [categories, vehicles, locations, settings] = await Promise.all([
    supabase.from('public_categories').select('*').order('sort_order'),
    supabase.from('public_vehicles').select('*').order('sort_order'),
    supabase.from('public_locations').select('*').order('sort_order'),
    supabase.from('public_settings').select('key, value'),
  ])
  const failed = [categories, vehicles, locations, settings].find((r) => r.error)
  if (failed?.error) throw new Error(`catalog load failed: ${failed.error.message}`)

  return {
    categories: (categories.data ?? []).map((c) => ({ id: c.id!, slug: c.slug!, name: (c.name ?? {}) as Localized, vehicleCount: c.vehicle_count ?? 0 })),
    vehicles: (vehicles.data ?? []).map((v) => ({
      id: v.id!,
      slug: v.slug!,
      vin: v.vin!,
      name: v.name!,
      brand: v.brand!,
      model: v.model!,
      variant: v.variant,
      categorySlug: v.category_slug!,
      categoryName: (v.category_name ?? {}) as Localized,
      engine: v.engine,
      powerKw: v.power_kw,
      powerHp: v.power_hp,
      gears: v.gears,
      drivetrain: v.drivetrain,
      fuel: v.fuel!,
      transmission: v.transmission!,
      seats: v.seats!,
      luggage: v.luggage,
      description: (v.description ?? {}) as Localized,
      depositCents: v.deposit_cents!,
      kmLimitPerDay: v.km_limit_per_day!,
      extraKmCents: v.extra_km_cents!,
      minDriverAge: v.min_driver_age!,
      minLicenseMonths: v.min_license_months!,
      priceFromCents: v.price_from_cents,
      prices: ((v.prices ?? []) as any[]).map((p) => ({ tierId: p.tier_id, minDays: p.min_days, maxDays: p.max_days, pricePerDayCents: p.price_per_day_cents })),
      images: ((v.images ?? []) as any[]).map((i) => ({ id: i.id, path: i.path, alt: i.alt ?? {}, width: i.width, height: i.height, isMain: i.is_main })),
      features: ((v.features ?? []) as any[]).map((f) => ({ id: f.id, group: f.group, name: f.name ?? {} })),
      extras: ((v.extras ?? []) as any[]).map((e) => ({
        id: e.id,
        code: e.code,
        name: e.name ?? {},
        description: e.description ?? {},
        priceCents: e.price_cents,
        pricingType: e.pricing_type,
        maxQuantity: e.max_quantity,
        maxChargeCents: e.max_charge_cents,
      })),
      updatedAt: v.updated_at!,
    })),
    locations: (locations.data ?? []).map((l) => ({
      id: l.id!,
      name: (l.name ?? {}) as Localized,
      address: l.address!,
      mapUrl: l.map_url,
      surchargeCents: l.surcharge_cents ?? 0,
      forPickup: !!l.for_pickup,
      forReturn: !!l.for_return,
      isDefault: !!l.is_default,
    })),
    settings: parseSettings((settings.data ?? []) as { key: string; value: unknown }[]),
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const CATALOG_TAG = 'catalog'

/** Whole public catalogue, cached for 5 minutes and refreshed whenever the admin saves something. */
export const getCatalog = unstable_cache(loadCatalog, ['catalog-v1'], { tags: [CATALOG_TAG], revalidate: 300 })

/** Text in the visitor's language, falling back to Slovak. */
export function localize(value: Localized | null | undefined, locale: string): string {
  if (!value) return ''
  return (locale === 'en' ? value.en : value.sk) || value.sk || value.en || ''
}

/** IDs of vehicles free for the whole window (buffer included). Not cached. */
export async function getAvailableVehicleIds(vehicleIds: string[], from: Date, to: Date): Promise<Set<string>> {
  const supabase = createPublicClient()
  const results = await Promise.all(
    vehicleIds.map(async (id) => {
      const { data } = await supabase.rpc('is_vehicle_available', { p_vehicle_id: id, p_pickup_at: from.toISOString(), p_return_at: to.toISOString() })
      return data ? id : null
    }),
  )
  return new Set(results.filter((id): id is string => id !== null))
}
