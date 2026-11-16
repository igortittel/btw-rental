'use server'

import { revalidatePath } from 'next/cache'
import { checkbox, dbErrorMessage, localized, optionalInt, optionalText, staffAction, text, type ActionState } from '@/lib/admin/action'
import { parseEuroToCents } from '@/lib/format'

function coordinate(formData: FormData, name: string, limit: number): number | null {
  const raw = text(formData, name).replace(',', '.')
  if (raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : Number.NaN
}

export async function saveLocationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const id = text(formData, 'id')
    const name = localized(formData, 'name')
    const address = text(formData, 'address')
    if (!name.sk || !address) return { error: 'Zadajte názov (SK) aj adresu.' }

    const surcharge = parseEuroToCents(text(formData, 'surcharge')) ?? 0
    if (Number.isNaN(surcharge)) return { error: 'Príplatok zadajte ako sumu v eurách, napr. 15 alebo 15,50.' }

    const mapUrl = optionalText(formData, 'map_url')
    if (mapUrl && !/^https:\/\//.test(mapUrl)) return { error: 'Odkaz na mapu musí začínať https://' }

    const latitude = coordinate(formData, 'latitude', 90)
    const longitude = coordinate(formData, 'longitude', 180)
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) return { error: 'GPS súradnice nie sú platné.' }

    const sortOrder = optionalInt(formData, 'sort_order') ?? 0
    if (Number.isNaN(sortOrder)) return { error: 'Poradie musí byť celé číslo.' }

    const forPickup = checkbox(formData, 'for_pickup')
    const forReturn = checkbox(formData, 'for_return')
    if (!forPickup && !forReturn) return { error: 'Miesto musí slúžiť aspoň na vyzdvihnutie alebo odovzdanie.' }

    const values = {
      name,
      address,
      map_url: mapUrl,
      latitude,
      longitude,
      surcharge_cents: surcharge,
      for_pickup: forPickup,
      for_return: forReturn,
      is_active: checkbox(formData, 'is_active'),
      sort_order: sortOrder,
    }

    if (id) {
      const { data: current } = await supabase.from('locations').select('is_default').eq('id', id).maybeSingle()
      if (current?.is_default && !values.is_active) return { error: 'Predvolené miesto nemožno deaktivovať. Najprv nastavte iné miesto ako predvolené.' }
      const { error } = await supabase.from('locations').update(values).eq('id', id)
      if (error) return { error: dbErrorMessage(error) }
    } else {
      const { error } = await supabase.from('locations').insert(values)
      if (error) return { error: dbErrorMessage(error) }
    }

    revalidatePath('/admin/miesta')
    return { ok: true, message: id ? 'Miesto uložené.' : 'Miesto pridané.' }
  })
}

export async function setDefaultLocationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const id = text(formData, 'id')
    const { data: target } = await supabase.from('locations').select('is_active, for_pickup, for_return').eq('id', id).maybeSingle()
    if (!target) return { error: 'Miesto sa nenašlo.' }
    if (!target.is_active || !target.for_pickup || !target.for_return) {
      return { error: 'Predvolené miesto musí byť aktívne a dostupné na vyzdvihnutie aj odovzdanie.' }
    }
    // The partial unique index allows only one default: clear first, then set.
    const cleared = await supabase.from('locations').update({ is_default: false }).eq('is_default', true)
    if (cleared.error) return { error: dbErrorMessage(cleared.error) }
    const { error } = await supabase.from('locations').update({ is_default: true }).eq('id', id)
    if (error) return { error: dbErrorMessage(error) }
    revalidatePath('/admin/miesta')
    return { ok: true, message: 'Predvolené miesto zmenené.' }
  })
}

export async function deleteLocationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const id = text(formData, 'id')
    const { data: target } = await supabase.from('locations').select('is_default').eq('id', id).maybeSingle()
    if (target?.is_default) return { error: 'Predvolené miesto nemožno zmazať.' }
    const { error } = await supabase.from('locations').delete().eq('id', id)
    if (error) return { error: dbErrorMessage(error) }
    revalidatePath('/admin/miesta')
    return { ok: true, message: 'Miesto zmazané.' }
  })
}
