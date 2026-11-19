'use server'

import { revalidatePath } from 'next/cache'
import { dbErrorMessage, localized, optionalInt, staffAction, text, type ActionState } from '@/lib/admin/action'
import { FEATURE_GROUPS, type FeatureGroup } from '@/lib/features'

function readFeature(formData: FormData) {
  const name = localized(formData, 'name')
  const group = text(formData, 'group') as FeatureGroup
  const sortOrder = optionalInt(formData, 'sort_order') ?? 0
  if (!name.sk) return { error: 'Zadajte slovenský názov položky.' } as const
  if (name.sk.length > 300 || (name.en?.length ?? 0) > 300) return { error: 'Názov môže mať najviac 300 znakov.' } as const
  if (!FEATURE_GROUPS.includes(group)) return { error: 'Zvoľte skupinu výbavy.' } as const
  if (Number.isNaN(sortOrder)) return { error: 'Poradie musí byť celé číslo.' } as const
  return { values: { name, group_key: group, sort_order: sortOrder } } as const
}

function refresh() {
  revalidatePath('/admin/vybava')
  revalidatePath('/admin/vozidla', 'layout')
}

/** Create or update an item of the equipment catalogue (shared by all vehicles). */
export async function saveFeatureAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const id = text(formData, 'id')
    const parsed = readFeature(formData)
    if ('error' in parsed) return { error: parsed.error }
    const { error } = id ? await supabase.from('features').update(parsed.values).eq('id', id) : await supabase.from('features').insert(parsed.values)
    if (error) return { error: dbErrorMessage(error) }
    refresh()
    return { ok: true, message: id ? 'Položka uložená – zmena platí pre všetky vozidlá s touto výbavou.' : 'Položka pridaná. Vozidlám ju priradíte v detaile vozidla.' }
  })
}

/** Only items no vehicle uses can be deleted, so a vehicle never loses equipment by accident. */
export async function deleteFeatureAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const id = text(formData, 'id')
    if (!id) return { error: 'Chýba položka.' }
    const { count, error: countError } = await supabase.from('vehicle_features').select('vehicle_id', { count: 'exact', head: true }).eq('feature_id', id)
    if (countError) return { error: dbErrorMessage(countError) }
    if ((count ?? 0) > 0) return { error: `Položku má ${count} ${count === 1 ? 'vozidlo' : count! < 5 ? 'vozidlá' : 'vozidiel'}. Najprv ju odoberte v detaile vozidla.` }
    const { error } = await supabase.from('features').delete().eq('id', id)
    if (error) return { error: dbErrorMessage(error) }
    refresh()
    return { ok: true, message: 'Položka zmazaná.' }
  })
}
