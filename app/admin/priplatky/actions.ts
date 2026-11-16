'use server'

import { revalidatePath } from 'next/cache'
import { checkbox, dbErrorMessage, localized, optionalInt, staffAction, text, type ActionState } from '@/lib/admin/action'
import { parseEuroToCents } from '@/lib/format'

export async function saveExtraAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const id = text(formData, 'id')
    const name = localized(formData, 'name')
    if (!name.sk) return { error: 'Zadajte slovenský názov príplatku.' }

    const price = parseEuroToCents(text(formData, 'price'))
    if (price === null || Number.isNaN(price)) return { error: 'Cenu zadajte v eurách, napr. 8 alebo 4,50.' }

    const maxCharge = parseEuroToCents(text(formData, 'max_charge'))
    if (Number.isNaN(maxCharge)) return { error: 'Strop ceny zadajte v eurách alebo nechajte prázdny.' }
    if (maxCharge !== null && maxCharge < price) return { error: 'Strop ceny nemôže byť nižší ako cena.' }

    const pricingType = text(formData, 'pricing_type')
    if (pricingType !== 'per_day' && pricingType !== 'per_rental') return { error: 'Zvoľte typ ceny.' }

    const maxQuantity = optionalInt(formData, 'max_quantity') ?? 1
    if (Number.isNaN(maxQuantity) || maxQuantity < 1 || maxQuantity > 20) return { error: 'Max. počet kusov musí byť 1 až 20.' }

    const sortOrder = optionalInt(formData, 'sort_order') ?? 0
    if (Number.isNaN(sortOrder)) return { error: 'Poradie musí byť celé číslo.' }

    const isGlobal = text(formData, 'scope') !== 'selected'
    const values = {
      name,
      description: localized(formData, 'description'),
      price_cents: price,
      pricing_type: pricingType as 'per_day' | 'per_rental',
      max_quantity: maxQuantity,
      max_charge_cents: maxCharge,
      is_global: isGlobal,
      is_active: checkbox(formData, 'is_active'),
      sort_order: sortOrder,
    }

    let extraId = id
    if (id) {
      const { error } = await supabase.from('extras').update(values).eq('id', id)
      if (error) return { error: dbErrorMessage(error) }
    } else {
      const { data, error } = await supabase.from('extras').insert(values).select('id').single()
      if (error) return { error: dbErrorMessage(error) }
      extraId = data.id
    }

    // "Only selected vehicles": the checked vehicles get an enabled row, the rest lose theirs.
    if (!isGlobal) {
      const selected = new Set(formData.getAll('vehicle_ids').filter((v): v is string => typeof v === 'string'))
      const { data: existing } = await supabase.from('vehicle_extras').select('vehicle_id, is_enabled').eq('extra_id', extraId)
      const have = new Map((existing ?? []).map((row) => [row.vehicle_id, row.is_enabled]))

      const toRemove = [...have.keys()].filter((vehicleId) => !selected.has(vehicleId))
      if (toRemove.length > 0) {
        const { error } = await supabase.from('vehicle_extras').delete().eq('extra_id', extraId).in('vehicle_id', toRemove)
        if (error) return { error: dbErrorMessage(error) }
      }
      const toEnable = [...selected].filter((vehicleId) => have.get(vehicleId) === false)
      if (toEnable.length > 0) {
        const { error } = await supabase.from('vehicle_extras').update({ is_enabled: true }).eq('extra_id', extraId).in('vehicle_id', toEnable)
        if (error) return { error: dbErrorMessage(error) }
      }
      const toAdd = [...selected].filter((vehicleId) => !have.has(vehicleId))
      if (toAdd.length > 0) {
        const { error } = await supabase.from('vehicle_extras').insert(toAdd.map((vehicleId) => ({ vehicle_id: vehicleId, extra_id: extraId, is_enabled: true })))
        if (error) return { error: dbErrorMessage(error) }
      }
    }

    revalidatePath('/admin/priplatky')
    return { ok: true, message: id ? 'Príplatok uložený.' : 'Príplatok pridaný.' }
  })
}

/** Bulk action: make the extra global and drop every per-vehicle exception and price override. */
export async function applyExtraToAllAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const id = text(formData, 'id')
    const removed = await supabase.from('vehicle_extras').delete().eq('extra_id', id)
    if (removed.error) return { error: dbErrorMessage(removed.error) }
    const { error } = await supabase.from('extras').update({ is_global: true }).eq('id', id)
    if (error) return { error: dbErrorMessage(error) }
    revalidatePath('/admin/priplatky')
    return { ok: true, message: 'Príplatok platí pre všetky vozidlá za základnú cenu.' }
  })
}

export async function deleteExtraAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const { error } = await supabase.from('extras').delete().eq('id', text(formData, 'id'))
    if (error) return { error: dbErrorMessage(error) }
    revalidatePath('/admin/priplatky')
    return { ok: true, message: 'Príplatok zmazaný.' }
  })
}
