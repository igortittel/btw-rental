'use server'

import { revalidatePath } from 'next/cache'
import { checkbox, dbErrorMessage, localized, optionalInt, staffAction, text, type ActionState } from '@/lib/admin/action'
import { isReservedSlug, slugify } from '@/lib/vehicle-url'

export async function saveCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return staffAction('manager', async ({ supabase }) => {
    const id = text(formData, 'id')
    const name = localized(formData, 'name')
    if (!name.sk) return { error: 'Zadajte slovenský názov kategórie.' }

    const slug = slugify(text(formData, 'slug') || name.sk)
    if (!slug) return { error: 'Zadajte platný slug (malé písmená, číslice, pomlčky).' }
    if (isReservedSlug(slug)) return { error: `Slug „${slug}“ je rezervovaný pre inú stránku webu. Zvoľte iný.` }

    const sortOrder = optionalInt(formData, 'sort_order') ?? 0
    if (Number.isNaN(sortOrder)) return { error: 'Poradie musí byť celé číslo.' }

    const values = { name, slug, sort_order: sortOrder, is_active: checkbox(formData, 'is_active') }
    const { error } = id
      ? await supabase.from('vehicle_categories').update(values).eq('id', id)
      : await supabase.from('vehicle_categories').insert(values)
    if (error) return { error: dbErrorMessage(error) }

    revalidatePath('/admin/kategorie')
    return { ok: true, message: id ? 'Kategória uložená.' : 'Kategória pridaná.' }
  })
}
