'use server'

import { revalidatePath } from 'next/cache'
import { FEATURE_GROUPS } from '@/lib/features'
import { redirect } from 'next/navigation'
import { checkbox, dbErrorMessage, localized, optionalInt, optionalText, staffAction, text, type ActionState } from '@/lib/admin/action'
import { parseEuroToCents } from '@/lib/format'
import { zonedLocalToUtc } from '@/lib/time'
import { buildVehicleName, buildVehicleSlug, normalizeVin, VIN_PATTERN } from '@/lib/vehicle-url'
import type { Database } from '@/types/database'

type Enums = Database['public']['Enums']
const FUELS: Enums['fuel_type'][] = ['petrol', 'diesel', 'hybrid', 'plug_in_hybrid', 'electric']
const TRANSMISSIONS: Enums['transmission_type'][] = ['automatic', 'manual']
const DRIVETRAINS: Enums['drivetrain_type'][] = ['fwd', 'rwd', 'awd']
const BLOCK_REASONS: Enums['block_reason'][] = ['service', 'stk', 'private', 'other']
const BUCKET = 'vehicle-images'

function revalidateVehicle(id: string) {
  revalidatePath('/admin/vozidla')
  revalidatePath(`/admin/vozidla/${id}`)
}

function intInRange(formData: FormData, name: string, min: number, max: number): number | null | 'invalid' {
  const value = optionalInt(formData, name)
  if (value === null) return null
  return Number.isNaN(value) || value < min || value > max ? 'invalid' : value
}

// ── Základné údaje ───────────────────────────────────────────────────────
export async function saveVehicleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let createdId: string | null = null
  const result = await staffAction('manager', async ({ supabase }) => {
    const id = text(formData, 'id')
    const brand = text(formData, 'brand')
    const model = text(formData, 'model')
    const variant = optionalText(formData, 'variant')
    if (!brand || !model) return { error: 'Zadajte značku aj model.' }

    const vin = normalizeVin(text(formData, 'vin'))
    if (!VIN_PATTERN.test(vin)) return { error: 'VIN môže obsahovať len písmená a číslice (5 až 20 znakov), bez medzier a pomlčiek.' }

    const slug = buildVehicleSlug({ brand, model, variant })
    if (!slug) return { error: 'Zo značky a modelu sa nedá vytvoriť URL.' }

    const categoryId = text(formData, 'category_id')
    const fuel = text(formData, 'fuel') as Enums['fuel_type']
    const transmission = text(formData, 'transmission') as Enums['transmission_type']
    const drivetrainRaw = text(formData, 'drivetrain')
    if (!categoryId) return { error: 'Zvoľte kategóriu.' }
    if (!FUELS.includes(fuel) || !TRANSMISSIONS.includes(transmission)) return { error: 'Zvoľte palivo a prevodovku.' }
    if (drivetrainRaw && !DRIVETRAINS.includes(drivetrainRaw as Enums['drivetrain_type'])) return { error: 'Neplatný pohon.' }

    const seats = intInRange(formData, 'seats', 1, 20)
    const luggage = intInRange(formData, 'luggage', 0, 50)
    const powerKw = intInRange(formData, 'power_kw', 1, 2000)
    const powerHp = intInRange(formData, 'power_hp', 1, 3000)
    const gears = intInRange(formData, 'gears', 1, 12)
    const sortOrder = intInRange(formData, 'sort_order', -100000, 100000)
    if (seats === null || seats === 'invalid') return { error: 'Počet miest musí byť 1 až 20.' }
    if ([luggage, powerKw, powerHp, gears, sortOrder].includes('invalid')) return { error: 'Skontrolujte číselné polia (kufre, výkon, prevody, poradie).' }

    const values = {
      brand,
      model,
      variant,
      name: text(formData, 'name') || buildVehicleName({ brand, model, variant }),
      slug,
      vin,
      category_id: categoryId,
      license_plate: optionalText(formData, 'license_plate'),
      engine: optionalText(formData, 'engine'),
      power_kw: powerKw as number | null,
      power_hp: powerHp as number | null,
      gears: gears as number | null,
      drivetrain: (drivetrainRaw || null) as Enums['drivetrain_type'] | null,
      fuel,
      transmission,
      seats,
      luggage: luggage as number | null,
      description: localized(formData, 'description'),
      for_rental: checkbox(formData, 'for_rental'),
      for_transfer: checkbox(formData, 'for_transfer'),
      is_active: checkbox(formData, 'is_active'),
      sort_order: (sortOrder as number | null) ?? 0,
    }

    if (id) {
      const { error } = await supabase.from('vehicles').update(values).eq('id', id)
      if (error) return { error: error.code === '23505' ? 'Vozidlo s týmto VIN už existuje.' : dbErrorMessage(error) }
      revalidateVehicle(id)
      return { ok: true, message: 'Vozidlo uložené.' }
    }

    const { data, error } = await supabase.from('vehicles').insert(values).select('id').single()
    if (error) return { error: error.code === '23505' ? 'Vozidlo s týmto VIN už existuje.' : dbErrorMessage(error) }
    createdId = data.id
    revalidatePath('/admin/vozidla')
    return { ok: true }
  })
  if (createdId) redirect(`/admin/vozidla/${createdId}?vytvorene=1`)
  return result
}

export async function deleteVehicleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let deleted = false
  const result = await staffAction('manager', async ({ supabase }) => {
    const id = text(formData, 'id')
    const { count } = await supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('vehicle_id', id)
    if (count) return { error: 'Vozidlo má rezervácie, preto sa nedá zmazať. Namiesto toho ho skryte (zrušte „Aktívne“).' }

    const { data: images } = await supabase.from('vehicle_images').select('storage_path').eq('vehicle_id', id)
    const { error } = await supabase.from('vehicles').delete().eq('id', id)
    if (error) return { error: dbErrorMessage(error) }
    if (images?.length) await supabase.storage.from(BUCKET).remove(images.map((i) => i.storage_path))
    deleted = true
    revalidatePath('/admin/vozidla')
    return { ok: true }
  })
  if (deleted) redirect('/admin/vozidla?zmazane=1')
  return result
}

// ── Ceny ─────────────────────────────────────────────────────────────────
export async function saveVehiclePricesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const vehicleId = text(formData, 'vehicle_id')
    const { data: tiers } = await supabase.from('price_tiers').select('id, min_days, max_days').not('max_days', 'is', null)
    const rows = []
    for (const tier of tiers ?? []) {
      const cents = parseEuroToCents(text(formData, `price_${tier.id}`))
      if (cents === null || Number.isNaN(cents)) return { error: 'Vyplňte cenu pre každú hladinu (v eurách s DPH).' }
      rows.push({ vehicle_id: vehicleId, tier_id: tier.id, price_per_day_cents: cents })
    }
    const { error } = await supabase.from('vehicle_prices').upsert(rows)
    if (error) return { error: dbErrorMessage(error) }
    revalidateVehicle(vehicleId)
    return { ok: true, message: 'Ceny uložené.' }
  })
}

// ── Podmienky a asistencia (prepíšu globálne nastavenia) ─────────────────
export async function saveVehicleConditionsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const vehicleId = text(formData, 'vehicle_id')
    const deposit = parseEuroToCents(text(formData, 'deposit'))
    const extraKm = parseEuroToCents(text(formData, 'extra_km'))
    if (Number.isNaN(deposit) || Number.isNaN(extraKm)) return { error: 'Sumy zadajte v eurách alebo nechajte prázdne.' }

    const kmLimit = intInRange(formData, 'km_limit_per_day', 1, 100000)
    const minAge = intInRange(formData, 'min_driver_age', 18, 99)
    const minLicense = intInRange(formData, 'min_license_months', 0, 600)
    const buffer = intInRange(formData, 'buffer_hours', 0, 720)
    if ([kmLimit, minAge, minLicense, buffer].includes('invalid')) {
      return { error: 'Skontrolujte číselné polia (vek 18–99, ostatné nezáporné celé čísla).' }
    }

    const assistance = {
      phone: optionalText(formData, 'assistance_phone'),
      insurer: optionalText(formData, 'assistance_insurer'),
      policy_number: optionalText(formData, 'assistance_policy_number'),
      note: optionalText(formData, 'assistance_note'),
    }
    const hasAssistance = Object.values(assistance).some(Boolean)

    const { error } = await supabase
      .from('vehicles')
      .update({
        deposit_cents: deposit,
        extra_km_cents: extraKm,
        km_limit_per_day: kmLimit as number | null,
        min_driver_age: minAge as number | null,
        min_license_months: minLicense as number | null,
        buffer_minutes: buffer === null ? null : (buffer as number) * 60,
        assistance: hasAssistance ? assistance : null,
      })
      .eq('id', vehicleId)
    if (error) return { error: dbErrorMessage(error) }
    revalidateVehicle(vehicleId)
    return { ok: true, message: 'Podmienky uložené.' }
  })
}

// ── Výbava ───────────────────────────────────────────────────────────────
export async function saveVehicleFeaturesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const vehicleId = text(formData, 'vehicle_id')
    const selected = new Set(formData.getAll('feature_ids').filter((v): v is string => typeof v === 'string'))

    // Optional custom item: created in the catalogue and ticked for this vehicle.
    const customName = text(formData, 'custom_name')
    if (customName) {
      const group = text(formData, 'custom_group') as Enums['feature_group']
      if (!FEATURE_GROUPS.includes(group)) return { error: 'Zvoľte skupinu pre vlastnú položku.' }
      const customEn = text(formData, 'custom_name_en')
      const { data, error } = await supabase
        .from('features')
        .insert({ group_key: group, name: customEn ? { sk: customName, en: customEn } : { sk: customName }, sort_order: 100000 })
        .select('id')
        .single()
      if (error) return { error: dbErrorMessage(error) }
      selected.add(data.id)
    }

    const { data: existing } = await supabase.from('vehicle_features').select('feature_id').eq('vehicle_id', vehicleId)
    const have = new Set((existing ?? []).map((row) => row.feature_id))
    const toRemove = [...have].filter((id) => !selected.has(id))
    const toAdd = [...selected].filter((id) => !have.has(id))

    if (toRemove.length > 0) {
      const { error } = await supabase.from('vehicle_features').delete().eq('vehicle_id', vehicleId).in('feature_id', toRemove)
      if (error) return { error: dbErrorMessage(error) }
    }
    if (toAdd.length > 0) {
      const { error } = await supabase.from('vehicle_features').insert(toAdd.map((featureId, i) => ({ vehicle_id: vehicleId, feature_id: featureId, sort_order: 1000 + i * 10 })))
      if (error) return { error: dbErrorMessage(error) }
    }
    revalidateVehicle(vehicleId)
    return { ok: true, message: 'Výbava uložená.' }
  })
}

// ── Príplatky pri vozidle ────────────────────────────────────────────────
export async function saveVehicleExtrasAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const vehicleId = text(formData, 'vehicle_id')
    const { data: extras } = await supabase.from('extras').select('id, is_global, price_cents')
    const upserts = []
    const removals = []

    for (const extra of extras ?? []) {
      const enabled = checkbox(formData, `enabled_${extra.id}`)
      const override = parseEuroToCents(text(formData, `price_${extra.id}`))
      if (Number.isNaN(override)) return { error: 'Vlastnú cenu zadajte v eurách alebo nechajte prázdnu.' }
      const priceOverride = override === extra.price_cents ? null : override

      // A row is needed only where the vehicle differs from the extra's default.
      const differs = extra.is_global ? !enabled || priceOverride !== null : enabled
      if (differs) upserts.push({ vehicle_id: vehicleId, extra_id: extra.id, is_enabled: enabled, price_override_cents: enabled ? priceOverride : null })
      else removals.push(extra.id)
    }

    if (removals.length > 0) {
      const { error } = await supabase.from('vehicle_extras').delete().eq('vehicle_id', vehicleId).in('extra_id', removals)
      if (error) return { error: dbErrorMessage(error) }
    }
    if (upserts.length > 0) {
      const { error } = await supabase.from('vehicle_extras').upsert(upserts)
      if (error) return { error: dbErrorMessage(error) }
    }
    revalidateVehicle(vehicleId)
    revalidatePath('/admin/priplatky')
    return { ok: true, message: 'Príplatky uložené.' }
  })
}

// ── Blokácie ─────────────────────────────────────────────────────────────
export async function addBlockAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase, userId }) => {
    const vehicleId = text(formData, 'vehicle_id')
    const startsAt = zonedLocalToUtc(text(formData, 'starts_at'))
    const endsAt = zonedLocalToUtc(text(formData, 'ends_at'))
    const reason = text(formData, 'reason') as Enums['block_reason']
    if (!startsAt || !endsAt) return { error: 'Zadajte začiatok aj koniec blokácie.' }
    if (endsAt <= startsAt) return { error: 'Koniec blokácie musí byť po začiatku.' }
    if (!BLOCK_REASONS.includes(reason)) return { error: 'Zvoľte dôvod blokácie.' }

    const { error } = await supabase.from('availability_blocks').insert({
      vehicle_id: vehicleId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      reason,
      note: optionalText(formData, 'note'),
      created_by: userId,
    })
    if (error) return { error: dbErrorMessage(error) }
    revalidateVehicle(vehicleId)
    return { ok: true, message: 'Blokácia pridaná.' }
  })
}

export async function deleteBlockAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const vehicleId = text(formData, 'vehicle_id')
    const { error } = await supabase.from('availability_blocks').delete().eq('id', text(formData, 'id'))
    if (error) return { error: dbErrorMessage(error) }
    revalidateVehicle(vehicleId)
    return { ok: true, message: 'Blokácia zrušená.' }
  })
}

// ── Fotky (volané priamo z klientskeho komponentu) ───────────────────────
type UploadedImage = { path: string; width: number; height: number }

export async function registerVehicleImagesAction(vehicleId: string, images: UploadedImage[]): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    // Paths are chosen by the client: accept only files inside this vehicle's folder.
    const valid = images.filter((i) => new RegExp(`^${vehicleId}/[a-z0-9-]+\\.(webp|jpg|png)$`).test(i.path)).slice(0, 30)
    if (valid.length === 0) return { error: 'Žiadna fotka sa nenahrala.' }

    const { data: vehicle } = await supabase.from('vehicles').select('name').eq('id', vehicleId).maybeSingle()
    const { data: existing } = await supabase.from('vehicle_images').select('sort_order, is_main').eq('vehicle_id', vehicleId)
    const hasMain = (existing ?? []).some((i) => i.is_main)
    let sort = Math.max(0, ...(existing ?? []).map((i) => i.sort_order))

    const { error } = await supabase.from('vehicle_images').insert(
      valid.map((image, index) => ({
        vehicle_id: vehicleId,
        storage_path: image.path,
        width: Math.round(image.width) || null,
        height: Math.round(image.height) || null,
        alt: { sk: vehicle?.name ?? '', en: vehicle?.name ?? '' },
        sort_order: (sort += 10),
        is_main: !hasMain && index === 0,
      })),
    )
    if (error) return { error: dbErrorMessage(error) }
    revalidateVehicle(vehicleId)
    return { ok: true, message: `Nahraté fotky: ${valid.length}.` }
  })
}

export async function reorderVehicleImagesAction(vehicleId: string, orderedIds: string[]): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    for (const [index, id] of orderedIds.slice(0, 100).entries()) {
      const { error } = await supabase
        .from('vehicle_images')
        .update({ sort_order: (index + 1) * 10 })
        .eq('id', id)
        .eq('vehicle_id', vehicleId)
      if (error) return { error: dbErrorMessage(error) }
    }
    revalidateVehicle(vehicleId)
    return { ok: true, message: 'Poradie uložené.' }
  })
}

export async function setMainVehicleImageAction(vehicleId: string, imageId: string): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const cleared = await supabase.from('vehicle_images').update({ is_main: false }).eq('vehicle_id', vehicleId).eq('is_main', true)
    if (cleared.error) return { error: dbErrorMessage(cleared.error) }
    const { error } = await supabase.from('vehicle_images').update({ is_main: true }).eq('id', imageId).eq('vehicle_id', vehicleId)
    if (error) return { error: dbErrorMessage(error) }
    revalidateVehicle(vehicleId)
    return { ok: true, message: 'Hlavná fotka zmenená.' }
  })
}

/** Alternative text of a photo (screen readers, image search); SK required, EN optional. */
export async function saveVehicleImageAltAction(vehicleId: string, imageId: string, alt: { sk: string; en: string }): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const sk = alt.sk.trim()
    const en = alt.en.trim()
    if (!sk) return { error: 'Zadajte popis fotky po slovensky.' }
    if (sk.length > 200 || en.length > 200) return { error: 'Popis fotky môže mať najviac 200 znakov.' }
    const { error } = await supabase
      .from('vehicle_images')
      .update({ alt: en ? { sk, en } : { sk } })
      .eq('id', imageId)
      .eq('vehicle_id', vehicleId)
    if (error) return { error: dbErrorMessage(error) }
    revalidateVehicle(vehicleId)
    return { ok: true, message: 'Popis fotky uložený.' }
  })
}

export async function deleteVehicleImageAction(vehicleId: string, imageId: string): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const { data: image } = await supabase.from('vehicle_images').select('storage_path, is_main').eq('id', imageId).eq('vehicle_id', vehicleId).maybeSingle()
    if (!image) return { error: 'Fotka sa nenašla.' }
    const { error } = await supabase.from('vehicle_images').delete().eq('id', imageId)
    if (error) return { error: dbErrorMessage(error) }
    await supabase.storage.from(BUCKET).remove([image.storage_path])

    if (image.is_main) {
      const { data: next } = await supabase.from('vehicle_images').select('id').eq('vehicle_id', vehicleId).order('sort_order').limit(1).maybeSingle()
      if (next) await supabase.from('vehicle_images').update({ is_main: true }).eq('id', next.id)
    }
    revalidateVehicle(vehicleId)
    return { ok: true, message: 'Fotka zmazaná.' }
  })
}
