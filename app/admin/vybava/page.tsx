import type { Metadata } from 'next'
import { deleteFeatureAction, saveFeatureAction } from './actions'
import { PageHeader, ReadOnlyNotice, Section } from '@/components/admin/section'
import { ActionForm, Field, SubmitButton, selectClass } from '@/components/admin/ui'
import { SELECT_CHEVRON_STYLE } from '@/components/ui/date-field'
import { Label } from '@/components/ui/label'
import { hasRole } from '@/lib/auth/roles'
import { requireStaff } from '@/lib/auth/session'
import { FEATURE_GROUP_LABELS, FEATURE_GROUPS, type FeatureGroup } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Výbava' }

type Name = { sk?: string; en?: string }

function GroupSelect({ id, value, disabled }: { id: string; value: FeatureGroup; disabled?: boolean }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Skupina</Label>
      <select id={id} name="group" defaultValue={value} disabled={disabled} className={selectClass} style={SELECT_CHEVRON_STYLE}>
        {FEATURE_GROUPS.map((group) => (
          <option key={group} value={group}>
            {FEATURE_GROUP_LABELS[group]}
          </option>
        ))}
      </select>
    </div>
  )
}

// Equipment catalogue shared by all vehicles: Slovak and English names, group and order.
export default async function FeaturesPage() {
  const user = await requireStaff('operator', '/admin/vybava')
  const canEdit = hasRole(user.role, 'manager')
  const supabase = await createClient()
  const [{ data: features }, { data: links }] = await Promise.all([
    supabase.from('features').select('id, group_key, name, sort_order').order('sort_order'),
    supabase.from('vehicle_features').select('feature_id'),
  ])
  const usage = new Map<string, number>()
  for (const link of links ?? []) usage.set(link.feature_id, (usage.get(link.feature_id) ?? 0) + 1)
  const missingEn = (features ?? []).filter((f) => !(f.name as Name).en).length

  return (
    <div>
      <PageHeader title="Výbava" />
      {canEdit ? null : <ReadOnlyNotice />}
      <p className="mb-6 text-sm text-muted2">
        Číselník výbavy pre všetky vozidlá. Zmena názvu sa prejaví na každom vozidle, ktoré položku má. Ktoré položky má konkrétne vozidlo, nastavíte v jeho detaile.
        {missingEn > 0 ? <strong className="text-amber-200"> Bez anglického názvu: {missingEn} (na anglickom webe sa zobrazí slovenský text).</strong> : null}
      </p>
      <div className="space-y-4">
        {FEATURE_GROUPS.map((group) => {
          const items = (features ?? []).filter((f) => f.group_key === group)
          return (
            <Section key={group} title={FEATURE_GROUP_LABELS[group]} description={`Položiek: ${items.length}`}>
              {items.length === 0 ? <p className="text-sm text-muted2">Žiadne položky.</p> : null}
              <ul className="divide-y divide-line">
                {items.map((feature) => {
                  const name = feature.name as Name
                  const used = usage.get(feature.id) ?? 0
                  return (
                    <li key={feature.id} className="py-4 first:pt-0 last:pb-0">
                      <ActionForm action={saveFeatureAction}>
                        <fieldset disabled={!canEdit} className="grid gap-4 md:grid-cols-[1fr_1fr_11rem_6rem]">
                          <input type="hidden" name="id" value={feature.id} />
                          <Field label="Názov (SK)" name="name_sk" id={`sk_${feature.id}`} defaultValue={name.sk ?? ''} required maxLength={300} />
                          <Field label="Názov (EN)" name="name_en" id={`en_${feature.id}`} defaultValue={name.en ?? ''} maxLength={300} />
                          <GroupSelect id={`group_${feature.id}`} value={feature.group_key} disabled={!canEdit} />
                          <Field label="Poradie" name="sort_order" id={`sort_${feature.id}`} type="number" defaultValue={feature.sort_order} />
                          <p className="text-xs text-muted2 md:col-span-4">
                            {used === 0 ? 'Nepoužíva žiadne vozidlo.' : `Používa ${used} ${used === 1 ? 'vozidlo' : used < 5 ? 'vozidlá' : 'vozidiel'}.`}
                          </p>
                          {canEdit ? (
                            <div className="md:col-span-4">
                              <SubmitButton variant="outline">Uložiť</SubmitButton>
                            </div>
                          ) : null}
                        </fieldset>
                      </ActionForm>
                      {canEdit && used === 0 ? (
                        <ActionForm action={deleteFeatureAction} confirm={`Zmazať položku „${name.sk ?? ''}“ z číselníka?`} className="mt-2">
                          <input type="hidden" name="id" value={feature.id} />
                          <button type="submit" className="min-h-11 text-sm text-red-200 underline underline-offset-4 hover:text-white">
                            Zmazať položku
                          </button>
                        </ActionForm>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </Section>
          )
        })}

        {canEdit ? (
          <Section title="Nová položka" description="Pridá sa do číselníka; vozidlám ju priradíte v ich detaile.">
            <ActionForm action={saveFeatureAction} resetOnSuccess>
              <div className="grid gap-4 md:grid-cols-[1fr_1fr_11rem_6rem]">
                <Field label="Názov (SK)" name="name_sk" id="new_sk" required maxLength={300} />
                <Field label="Názov (EN)" name="name_en" id="new_en" maxLength={300} />
                <GroupSelect id="new_group" value="comfort" />
                <Field label="Poradie" name="sort_order" id="new_sort" type="number" defaultValue={((features ?? []).reduce((max, f) => Math.max(max, f.sort_order), 0) || 0) + 10} />
                <div className="md:col-span-4">
                  <SubmitButton>Pridať položku</SubmitButton>
                </div>
              </div>
            </ActionForm>
          </Section>
        ) : null}
      </div>
    </div>
  )
}
