import type { Metadata } from 'next'
import { applyExtraToAllAction, deleteExtraAction, saveExtraAction } from './actions'
import { PageHeader, ReadOnlyNotice, Section } from '@/components/admin/section'
import { ActionForm, Check, Field, selectClass, SubmitButton } from '@/components/admin/ui'
import { Label } from '@/components/ui/label'
import { hasRole } from '@/lib/auth/roles'
import { requireStaff } from '@/lib/auth/session'
import { centsToInput, formatEuro } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

export const metadata: Metadata = { title: 'Príplatky' }

type Extra = Database['public']['Tables']['extras']['Row']
type Text = { sk?: string; en?: string }
type VehicleOption = { id: string; name: string }

function ExtraFields({ extra, vehicles, enabledVehicleIds, nextSort }: { extra?: Extra; vehicles: VehicleOption[]; enabledVehicleIds: Set<string>; nextSort?: number }) {
  const name = (extra?.name ?? {}) as Text
  const description = (extra?.description ?? {}) as Text
  const key = extra?.id ?? 'new'
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {extra ? <input type="hidden" name="id" value={extra.id} /> : null}
      <Field label="Názov (SK)" name="name_sk" id={`name_sk_${key}`} defaultValue={name.sk ?? ''} required />
      <Field label="Názov (EN)" name="name_en" id={`name_en_${key}`} defaultValue={name.en ?? ''} />
      <Field label="Poradie" name="sort_order" id={`sort_${key}`} type="number" defaultValue={extra?.sort_order ?? nextSort ?? 0} />
      <Field label="Popis (SK)" name="description_sk" id={`desc_sk_${key}`} defaultValue={description.sk ?? ''} />
      <Field label="Popis (EN)" name="description_en" id={`desc_en_${key}`} defaultValue={description.en ?? ''} />
      <div className="space-y-2">
        <Label htmlFor={`type_${key}`}>Typ ceny</Label>
        <select id={`type_${key}`} name="pricing_type" defaultValue={extra?.pricing_type ?? 'per_day'} className={selectClass}>
          <option value="per_day">za deň (× počet dní)</option>
          <option value="per_rental">jednorazovo za prenájom</option>
        </select>
      </div>
      <Field label="Cena (€)" name="price" id={`price_${key}`} inputMode="decimal" defaultValue={centsToInput(extra?.price_cents)} required />
      <Field label="Strop ceny (€)" name="max_charge" id={`max_charge_${key}`} inputMode="decimal" defaultValue={centsToInput(extra?.max_charge_cents)} hint="Nepovinné. Najvyššia suma za jeden kus za celý prenájom." />
      <Field label="Max. počet kusov" name="max_quantity" id={`max_q_${key}`} type="number" min={1} max={20} defaultValue={extra?.max_quantity ?? 1} />
      <div className="space-y-2">
        <Label htmlFor={`scope_${key}`}>Platí pre</Label>
        <select id={`scope_${key}`} name="scope" defaultValue={extra && !extra.is_global ? 'selected' : 'all'} className={selectClass}>
          <option value="all">všetky vozidlá</option>
          <option value="selected">len vybrané vozidlá</option>
        </select>
      </div>
      <fieldset className="space-y-2 sm:col-span-2">
        <legend className="mb-2 text-sm font-medium text-zinc-300">Vybrané vozidlá (použije sa pri voľbe „len vybrané vozidlá“)</legend>
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {vehicles.map((vehicle) => (
            <label key={vehicle.id} className="flex min-h-9 items-center gap-3 text-sm text-white">
              <input type="checkbox" name="vehicle_ids" value={vehicle.id} defaultChecked={enabledVehicleIds.has(vehicle.id)} className="h-5 w-5 shrink-0 accent-[#B88746]" />
              {vehicle.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-2 lg:col-span-3">
        <Check label="Aktívny (ponúka sa vo formulári)" name="is_active" defaultChecked={extra?.is_active ?? true} />
      </div>
    </div>
  )
}

export default async function ExtrasPage() {
  const user = await requireStaff('operator', '/admin/priplatky')
  const canEdit = hasRole(user.role, 'manager')
  const supabase = await createClient()
  const [{ data: extras }, { data: vehicles }, { data: links }] = await Promise.all([
    supabase.from('extras').select('*').order('sort_order'),
    supabase.from('vehicles').select('id, name').order('sort_order'),
    supabase.from('vehicle_extras').select('vehicle_id, extra_id, is_enabled, price_override_cents'),
  ])
  const list = extras ?? []
  const vehicleOptions = vehicles ?? []

  return (
    <div>
      <PageHeader title="Príplatky" />
      {canEdit ? null : <ReadOnlyNotice />}
      <p className="mb-6 text-sm text-muted2">
        Cenu pre konkrétne vozidlo alebo vypnutie príplatku pri jednom vozidle nastavíte v detaile vozidla, časť Príplatky.
      </p>
      <div className="space-y-4">
        {list.map((extra) => {
          const name = extra.name as Text
          const rows = (links ?? []).filter((l) => l.extra_id === extra.id)
          const enabled = new Set(rows.filter((l) => l.is_enabled).map((l) => l.vehicle_id))
          const exceptions = rows.filter((l) => !l.is_enabled || l.price_override_cents !== null).length
          const summary = [
            `${formatEuro(extra.price_cents)} ${extra.pricing_type === 'per_day' ? '/ deň' : '/ prenájom'}`,
            extra.is_global ? 'všetky vozidlá' : `vybrané vozidlá: ${enabled.size}`,
            extra.is_global && exceptions > 0 ? `výnimky: ${exceptions}` : null,
            extra.is_active ? null : 'neaktívny',
          ]
            .filter(Boolean)
            .join(' · ')
          return (
            <Section key={extra.id} title={name.sk ?? '—'} description={summary}>
              <ActionForm action={saveExtraAction}>
                <fieldset disabled={!canEdit} className="space-y-5">
                  <ExtraFields extra={extra} vehicles={vehicleOptions} enabledVehicleIds={extra.is_global ? new Set() : enabled} />
                  {canEdit ? <SubmitButton /> : null}
                </fieldset>
              </ActionForm>
              {canEdit ? (
                <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-4">
                  <ActionForm action={applyExtraToAllAction} confirm="Príplatok bude platiť pre všetky vozidlá za základnú cenu. Výnimky a vlastné ceny pri vozidlách sa zrušia. Pokračovať?">
                    <input type="hidden" name="id" value={extra.id} />
                    <SubmitButton variant="outline">Aplikovať na všetky vozidlá</SubmitButton>
                  </ActionForm>
                  <ActionForm action={deleteExtraAction} confirm="Naozaj zmazať tento príplatok? V existujúcich rezerváciách zostane zachovaný.">
                    <input type="hidden" name="id" value={extra.id} />
                    <SubmitButton variant="destructive" pendingLabel="Mažem…">
                      Zmazať
                    </SubmitButton>
                  </ActionForm>
                </div>
              ) : null}
            </Section>
          )
        })}

        {canEdit ? (
          <Section title="Nový príplatok">
            <ActionForm action={saveExtraAction} resetOnSuccess>
              <div className="space-y-5">
                <ExtraFields vehicles={vehicleOptions} enabledVehicleIds={new Set()} nextSort={(list.at(-1)?.sort_order ?? 0) + 10} />
                <SubmitButton>Pridať príplatok</SubmitButton>
              </div>
            </ActionForm>
          </Section>
        ) : null}
      </div>
    </div>
  )
}
