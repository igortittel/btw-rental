import type { Metadata } from 'next'
import { saveCategoryAction } from './actions'
import { PageHeader, ReadOnlyNotice, Section } from '@/components/admin/section'
import { ActionForm, Check, Field, SubmitButton } from '@/components/admin/ui'
import { hasRole } from '@/lib/auth/roles'
import { requireStaff } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Kategórie' }

type Name = { sk?: string; en?: string }

export default async function CategoriesPage() {
  const user = await requireStaff('operator', '/admin/kategorie')
  const canEdit = hasRole(user.role, 'manager')
  const supabase = await createClient()
  const [{ data: categories }, { data: vehicles }] = await Promise.all([supabase.from('vehicle_categories').select('*').order('sort_order'), supabase.from('vehicles').select('category_id')])
  const counts = new Map<string, number>()
  for (const v of vehicles ?? []) counts.set(v.category_id, (counts.get(v.category_id) ?? 0) + 1)

  return (
    <div>
      <PageHeader title="Kategórie vozidiel" />
      {canEdit ? null : <ReadOnlyNotice />}
      <div className="space-y-4">
        {(categories ?? []).map((category) => {
          const name = category.name as Name
          return (
            <Section key={category.id} title={name.sk ?? category.slug} description={`rental.btw.sk/${category.slug} · vozidiel: ${counts.get(category.id) ?? 0}`}>
              <ActionForm action={saveCategoryAction}>
                <fieldset disabled={!canEdit} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <input type="hidden" name="id" value={category.id} />
                  <Field label="Názov (SK)" name="name_sk" id={`name_sk_${category.id}`} defaultValue={name.sk ?? ''} required />
                  <Field label="Názov (EN)" name="name_en" id={`name_en_${category.id}`} defaultValue={name.en ?? ''} />
                  <Field label="Slug (URL)" name="slug" id={`slug_${category.id}`} defaultValue={category.slug} hint="Zmena slugu zmení URL všetkých vozidiel v kategórii." />
                  <Field label="Poradie" name="sort_order" id={`sort_${category.id}`} type="number" defaultValue={category.sort_order} />
                  <div className="sm:col-span-2 lg:col-span-4">
                    <Check label="Aktívna (zobrazuje sa na webe)" name="is_active" defaultChecked={category.is_active} />
                  </div>
                  {canEdit ? (
                    <div>
                      <SubmitButton />
                    </div>
                  ) : null}
                </fieldset>
              </ActionForm>
            </Section>
          )
        })}

        {canEdit ? (
          <Section title="Nová kategória">
            <ActionForm action={saveCategoryAction} resetOnSuccess>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Názov (SK)" name="name_sk" required />
                <Field label="Názov (EN)" name="name_en" />
                <Field label="Slug (URL)" name="slug" hint="Nepovinné – vytvorí sa z názvu." />
                <Field label="Poradie" name="sort_order" type="number" defaultValue={((categories ?? []).at(-1)?.sort_order ?? 0) + 10} />
                <input type="hidden" name="is_active" value="true" />
                <div>
                  <SubmitButton>Pridať kategóriu</SubmitButton>
                </div>
              </div>
            </ActionForm>
          </Section>
        ) : null}
      </div>
    </div>
  )
}
