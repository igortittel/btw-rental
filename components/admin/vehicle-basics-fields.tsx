import { VehicleUrlPreview } from '@/components/admin/vehicle-url-preview'
import { Check, Field, selectClass, textareaClass } from '@/components/admin/ui'
import { Label } from '@/components/ui/label'
import type { Database } from '@/types/database'

type Vehicle = Database['public']['Tables']['vehicles']['Row']
type Category = { id: string; slug: string; name: unknown }
type Text = { sk?: string; en?: string }

export const FUEL_LABELS: Record<Database['public']['Enums']['fuel_type'], string> = {
  petrol: 'Benzín',
  diesel: 'Diesel',
  hybrid: 'Hybrid',
  plug_in_hybrid: 'Plug-in hybrid',
  electric: 'Elektro',
}
export const TRANSMISSION_LABELS: Record<Database['public']['Enums']['transmission_type'], string> = {
  automatic: 'Automat',
  manual: 'Manuál',
}
const DRIVETRAIN_LABELS = { fwd: 'Predný náhon', rwd: 'Zadný náhon', awd: '4×4' }

export function VehicleBasicsFields({ vehicle, categories, nextSort }: { vehicle?: Vehicle; categories: Category[]; nextSort?: number }) {
  const description = (vehicle?.description ?? {}) as Text
  return (
    <div className="space-y-6">
      {vehicle ? <input type="hidden" name="id" value={vehicle.id} /> : null}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Značka" name="brand" defaultValue={vehicle?.brand ?? ''} placeholder="Mercedes-Benz" required />
        <Field label="Model" name="model" defaultValue={vehicle?.model ?? ''} placeholder="E 220 d" required />
        <Field label="Variant" name="variant" defaultValue={vehicle?.variant ?? ''} placeholder="4MATIC" hint="Nepovinné. Je súčasťou názvu a URL." />
        <Field label="Názov" name="name" defaultValue={vehicle?.name ?? ''} hint="Nechajte prázdne – zloží sa zo značky, modelu a variantu." />
        <div className="space-y-2">
          <Label htmlFor="category_id">Kategória</Label>
          <select id="category_id" name="category_id" defaultValue={vehicle?.category_id ?? ''} className={selectClass} required>
            <option value="" disabled>
              – zvoľte –
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {(c.name as Text).sk ?? c.slug}
              </option>
            ))}
          </select>
        </div>
        <Field label="VIN" name="vin" defaultValue={vehicle?.vin ?? ''} autoCapitalize="characters" spellCheck={false} hint="Povinný, unikátny, verejný – je súčasťou URL." required />
        <Field label="ŠPZ" name="license_plate" defaultValue={vehicle?.license_plate ?? ''} autoCapitalize="characters" hint="Interný údaj. Zákazník ju uvidí až po potvrdení rezervácie." />
        <Field label="Poradie zobrazenia" name="sort_order" type="number" defaultValue={vehicle?.sort_order ?? nextSort ?? 0} />
      </div>

      <VehicleUrlPreview categorySlugs={Object.fromEntries(categories.map((c) => [c.id, c.slug]))} />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Motorizácia" name="engine" defaultValue={vehicle?.engine ?? ''} placeholder="2.0 TDI" />
        <Field label="Výkon (kW)" name="power_kw" type="number" min={1} defaultValue={vehicle?.power_kw ?? ''} />
        <Field label="Výkon (k)" name="power_hp" type="number" min={1} defaultValue={vehicle?.power_hp ?? ''} />
        <Field label="Počet prevodov" name="gears" type="number" min={1} defaultValue={vehicle?.gears ?? ''} />
        <div className="space-y-2">
          <Label htmlFor="fuel">Palivo</Label>
          <select id="fuel" name="fuel" defaultValue={vehicle?.fuel ?? 'diesel'} className={selectClass}>
            {Object.entries(FUEL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="transmission">Prevodovka</Label>
          <select id="transmission" name="transmission" defaultValue={vehicle?.transmission ?? 'automatic'} className={selectClass}>
            {Object.entries(TRANSMISSION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="drivetrain">Pohon</Label>
          <select id="drivetrain" name="drivetrain" defaultValue={vehicle?.drivetrain ?? ''} className={selectClass}>
            <option value="">– neuvedené –</option>
            {Object.entries(DRIVETRAIN_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <Field label="Počet miest" name="seats" type="number" min={1} max={20} defaultValue={vehicle?.seats ?? 5} required />
        <Field label="Počet kufrov" name="luggage" type="number" min={0} defaultValue={vehicle?.luggage ?? ''} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="description_sk">Popis (SK)</Label>
          <textarea id="description_sk" name="description_sk" defaultValue={description.sk ?? ''} className={textareaClass} rows={4} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description_en">Popis (EN)</Label>
          <textarea id="description_en" name="description_en" defaultValue={description.en ?? ''} className={textareaClass} rows={4} />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Check label="Aktívne" name="is_active" defaultChecked={vehicle?.is_active ?? false} hint={vehicle ? 'Neaktívne vozidlo je na webe skryté.' : 'Zapnite až po doplnení cien a fotiek.'} />
        <Check label="Na prenájom" name="for_rental" defaultChecked={vehicle?.for_rental ?? true} hint="Zobrazuje sa v katalógu." />
        <Check label="Na transfer" name="for_transfer" defaultChecked={vehicle?.for_transfer ?? false} hint="Len evidenčný príznak." />
      </div>
    </div>
  )
}
