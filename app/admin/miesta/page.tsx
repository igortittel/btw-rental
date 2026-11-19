import type { Metadata } from 'next'
import { deleteLocationAction, saveLocationAction, setDefaultLocationAction } from './actions'
import { PageHeader, ReadOnlyNotice, Section } from '@/components/admin/section'
import { ActionForm, Check, Field, SubmitButton } from '@/components/admin/ui'
import { hasRole } from '@/lib/auth/roles'
import { requireStaff } from '@/lib/auth/session'
import { centsToInput, formatEuro } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

export const metadata: Metadata = { title: 'Miesta' }

type Location = Database['public']['Tables']['locations']['Row']
type Name = { sk?: string; en?: string }

function LocationFields({ location, nextSort }: { location?: Location; nextSort?: number }) {
  const name = (location?.name ?? {}) as Name
  const key = location?.id ?? 'new'
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {location ? <input type="hidden" name="id" value={location.id} /> : null}
      <Field label="Názov (SK)" name="name_sk" id={`name_sk_${key}`} defaultValue={name.sk ?? ''} required />
      <Field label="Názov (EN)" name="name_en" id={`name_en_${key}`} defaultValue={name.en ?? ''} />
      <Field label="Adresa" name="address" id={`address_${key}`} defaultValue={location?.address ?? ''} required />
      <Field label="Odkaz na mapu" name="map_url" id={`map_${key}`} type="url" defaultValue={location?.map_url ?? ''} placeholder="https://maps.google.com/…" />
      <Field label="GPS šírka" name="latitude" id={`lat_${key}`} inputMode="decimal" defaultValue={location?.latitude ?? ''} placeholder="48.1560" />
      <Field label="GPS dĺžka" name="longitude" id={`lng_${key}`} inputMode="decimal" defaultValue={location?.longitude ?? ''} placeholder="17.1340" />
      <Field
        label="Príplatok (€)"
        name="surcharge"
        id={`surcharge_${key}`}
        inputMode="decimal"
        defaultValue={centsToInput(location?.surcharge_cents ?? 0)}
        hint="Účtuje sa jednorazovo za každé použitie miesta."
      />
      <Field label="Poradie" name="sort_order" id={`sort_${key}`} type="number" defaultValue={location?.sort_order ?? nextSort ?? 0} />
      <div className="space-y-2 sm:col-span-2 lg:col-span-3">
        <Check label="Dostupné na vyzdvihnutie" name="for_pickup" defaultChecked={location?.for_pickup ?? true} />
        <Check label="Dostupné na odovzdanie" name="for_return" defaultChecked={location?.for_return ?? true} />
        <Check label="Aktívne" name="is_active" defaultChecked={location?.is_active ?? true} />
      </div>
    </div>
  )
}

export default async function LocationsPage() {
  const user = await requireStaff('operator', '/admin/miesta')
  const canEdit = hasRole(user.role, 'manager')
  const supabase = await createClient()
  const { data: locations } = await supabase.from('locations').select('*').order('sort_order')
  const list = locations ?? []

  return (
    <div>
      <PageHeader title="Miesta vyzdvihnutia a odovzdania" />
      {canEdit ? null : <ReadOnlyNotice />}
      <p className="mb-6 text-sm text-muted2">Kým je aktívne len jedno miesto, zákazník ho vo formulári vidí len informatívne. Výber sa zobrazí, až keď pridáte ďalšie.</p>
      <div className="space-y-4">
        {list.map((location) => {
          const name = location.name as Name
          return (
            <Section
              key={location.id}
              title={`${name.sk ?? location.address}${location.is_default ? ' · predvolené' : ''}`}
              description={`${location.address} · príplatok ${formatEuro(location.surcharge_cents)}${location.is_active ? '' : ' · neaktívne'}`}
            >
              <ActionForm action={saveLocationAction}>
                <fieldset disabled={!canEdit} className="space-y-5">
                  <LocationFields location={location} />
                  {canEdit ? <SubmitButton /> : null}
                </fieldset>
              </ActionForm>
              {canEdit && !location.is_default ? (
                <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-4">
                  <ActionForm action={setDefaultLocationAction}>
                    <input type="hidden" name="id" value={location.id} />
                    <SubmitButton variant="outline">Nastaviť ako predvolené</SubmitButton>
                  </ActionForm>
                  <ActionForm action={deleteLocationAction} confirm="Naozaj zmazať toto miesto?">
                    <input type="hidden" name="id" value={location.id} />
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
          <Section title="Nové miesto">
            <ActionForm action={saveLocationAction} resetOnSuccess>
              <div className="space-y-5">
                <LocationFields nextSort={(list.at(-1)?.sort_order ?? 0) + 10} />
                <SubmitButton>Pridať miesto</SubmitButton>
              </div>
            </ActionForm>
          </Section>
        ) : null}
      </div>
    </div>
  )
}
