import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  addBlockAction,
  deleteBlockAction,
  deleteVehicleAction,
  saveVehicleAction,
  saveVehicleConditionsAction,
  saveVehicleExtrasAction,
  saveVehicleFeaturesAction,
  saveVehiclePricesAction,
} from '../actions'
import { MonthCalendar, parseMonth, type CalendarRange } from '@/components/admin/month-calendar'
import { PageHeader, ReadOnlyNotice, Section } from '@/components/admin/section'
import { ActionForm, Field, selectClass, SubmitButton } from '@/components/admin/ui'
import { VehicleBasicsFields } from '@/components/admin/vehicle-basics-fields'
import { VehicleImages } from '@/components/admin/vehicle-images'
import { Label } from '@/components/ui/label'
import { hasRole } from '@/lib/auth/roles'
import { requireStaff } from '@/lib/auth/session'
import { centsToInput, formatEuro } from '@/lib/format'
import { getSettings } from '@/lib/settings'
import { vehicleImageUrl } from '@/lib/storage'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/time'
import { vehiclePath } from '@/lib/vehicle-url'

export const metadata: Metadata = { title: 'Vozidlo' }

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ mesiac?: string; vytvorene?: string }> }
type Text = { sk?: string; en?: string }

const GROUPS = [
  { key: 'comfort', label: 'Komfort' },
  { key: 'technical', label: 'Technické' },
  { key: 'safety', label: 'Bezpečnosť' },
  { key: 'included', label: 'V cene prenájmu' },
] as const

const BLOCK_REASONS = { service: 'Servis', stk: 'STK / EK', private: 'Súkromné použitie', other: 'Iné' }
const STATUS_LABELS: Record<string, string> = { new: 'nová', confirmed: 'potvrdená', modified: 'upravená', active: 'prebieha' }

const tierLabel = (min: number, max: number | null) => (max === null ? `${min}+ dní` : min === max ? (min === 1 ? '1 deň' : `${min} dní`) : `${min}–${max} dní`)

export default async function VehiclePage({ params, searchParams }: Props) {
  const [{ id }, { mesiac, vytvorene }] = await Promise.all([params, searchParams])
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()

  const user = await requireStaff('operator', `/admin/vozidla/${id}`)
  const canEdit = hasRole(user.role, 'manager')
  const supabase = await createClient()
  const nowIso = new Date().toISOString()

  const [vehicleRes, categoriesRes, tiersRes, pricesRes, featuresRes, vehicleFeaturesRes, extrasRes, vehicleExtrasRes, imagesRes, blocksRes, bookingsRes, settings] =
    await Promise.all([
      supabase.from('vehicles').select('*').eq('id', id).maybeSingle(),
      supabase.from('vehicle_categories').select('id, slug, name').order('sort_order'),
      supabase.from('price_tiers').select('*').order('min_days'),
      supabase.from('vehicle_prices').select('tier_id, price_per_day_cents').eq('vehicle_id', id),
      supabase.from('features').select('*').order('sort_order'),
      supabase.from('vehicle_features').select('feature_id').eq('vehicle_id', id),
      supabase.from('extras').select('*').order('sort_order'),
      supabase.from('vehicle_extras').select('*').eq('vehicle_id', id),
      supabase.from('vehicle_images').select('*').eq('vehicle_id', id).order('sort_order'),
      supabase.from('availability_blocks').select('*').eq('vehicle_id', id).gte('ends_at', nowIso).order('starts_at'),
      supabase
        .from('bookings')
        .select('id, number, status, pickup_at, return_at, blocked_until')
        .eq('vehicle_id', id)
        .in('status', ['new', 'confirmed', 'modified', 'active'])
        .gte('blocked_until', nowIso)
        .order('pickup_at'),
      getSettings(supabase),
    ])

  const vehicle = vehicleRes.data
  if (!vehicle) notFound()

  const categories = categoriesRes.data ?? []
  const category = categories.find((c) => c.id === vehicle.category_id)
  const publicPath = category ? vehiclePath(category.slug, vehicle.slug, vehicle.vin) : null
  const prices = new Map((pricesRes.data ?? []).map((p) => [p.tier_id, p.price_per_day_cents]))
  const selectedFeatures = new Set((vehicleFeaturesRes.data ?? []).map((f) => f.feature_id))
  const vehicleExtras = new Map((vehicleExtrasRes.data ?? []).map((e) => [e.extra_id, e]))
  const blocks = blocksRes.data ?? []
  const bookings = bookingsRes.data ?? []
  const assistance = (vehicle.assistance ?? {}) as { phone?: string; insurer?: string; policy_number?: string; note?: string }

  const { year, month } = parseMonth(mesiac)
  const ranges: CalendarRange[] = [
    ...blocks.map((b) => ({ start: b.starts_at, end: b.ends_at, kind: 'block' as const })),
    ...bookings.map((b) => ({
      start: b.pickup_at,
      end: b.status === 'new' ? b.return_at : b.blocked_until,
      kind: b.status === 'new' ? ('pending' as const) : ('booked' as const),
    })),
  ]

  return (
    <div className="space-y-6">
      <PageHeader title={vehicle.name} back={{ href: '/admin/vozidla', label: 'Vozidlá' }} />
      {vytvorene ? (
        <p role="status" className="rounded-lg border border-gold/50 bg-gold/10 px-3 py-2 text-sm text-white">
          Vozidlo je vytvorené a zatiaľ skryté. Doplňte ceny a fotky a potom ho v základných údajoch označte ako aktívne.
        </p>
      ) : null}
      {canEdit ? null : <ReadOnlyNotice />}

      <nav aria-label="Časti vozidla" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {[
          ['#udaje', 'Údaje'],
          ['#fotky', 'Fotky'],
          ['#ceny', 'Ceny'],
          ['#vybava', 'Výbava'],
          ['#priplatky', 'Príplatky'],
          ['#podmienky', 'Podmienky'],
          ['#dostupnost', 'Dostupnosť'],
        ].map(([href, label]) => (
          <a key={href} href={href} className="py-1 text-gold underline-offset-4 hover:underline">
            {label}
          </a>
        ))}
      </nav>

      <Section id="udaje" title="Základné údaje" description={publicPath ? `Verejná adresa: rental.btw.sk${publicPath}` : undefined}>
        <ActionForm action={saveVehicleAction}>
          <fieldset disabled={!canEdit} className="space-y-6">
            <VehicleBasicsFields vehicle={vehicle} categories={categories} />
            {canEdit ? <SubmitButton /> : null}
          </fieldset>
        </ActionForm>
      </Section>

      <Section id="fotky" title="Fotky" description="Hlavná fotka sa zobrazuje na karte vozidla v katalógu.">
        <VehicleImages
          vehicleId={vehicle.id}
          canEdit={canEdit}
          images={(imagesRes.data ?? []).map((image) => ({
            id: image.id,
            url: vehicleImageUrl(image.storage_path),
            isMain: image.is_main,
            alt: (image.alt as Text).sk ?? vehicle.name,
          }))}
        />
      </Section>

      <Section id="ceny" title="Ceny za deň" description="Sumy s DPH. Sadzba podľa celkovej dĺžky prenájmu sa použije na všetky dni. Hranice hladín sa menia v Nastaveniach.">
        <ActionForm action={saveVehiclePricesAction}>
          <fieldset disabled={!canEdit} className="space-y-5">
            <input type="hidden" name="vehicle_id" value={vehicle.id} />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
              {(tiersRes.data ?? []).map((tier) =>
                tier.max_days === null ? (
                  <div key={tier.id} className="space-y-2">
                    <Label>{tierLabel(tier.min_days, null)}</Label>
                    <p className="flex h-10 items-center text-sm text-muted2">Individuálna cena</p>
                  </div>
                ) : (
                  <Field key={tier.id} label={`${tierLabel(tier.min_days, tier.max_days)} (€)`} name={`price_${tier.id}`} inputMode="decimal" defaultValue={centsToInput(prices.get(tier.id))} required />
                ),
              )}
            </div>
            {canEdit ? <SubmitButton>Uložiť ceny</SubmitButton> : null}
          </fieldset>
        </ActionForm>
      </Section>

      <Section id="vybava" title="Výbava" description="Zaškrtnuté položky sa zobrazia na detaile vozidla v príslušnej skupine.">
        <ActionForm action={saveVehicleFeaturesAction}>
          <fieldset disabled={!canEdit} className="space-y-6">
            <input type="hidden" name="vehicle_id" value={vehicle.id} />
            {GROUPS.map((group) => {
              const items = (featuresRes.data ?? []).filter((f) => f.group_key === group.key)
              return (
                <fieldset key={group.key}>
                  <legend className="mb-2 text-sm font-semibold uppercase tracking-wider text-gold">{group.label}</legend>
                  {items.length === 0 ? <p className="text-sm text-muted2">Žiadne položky.</p> : null}
                  <div className="grid gap-x-6 gap-y-1 lg:grid-cols-2">
                    {items.map((feature) => (
                      <label key={feature.id} className="flex min-h-9 items-start gap-3 py-1 text-sm text-white">
                        <input type="checkbox" name="feature_ids" value={feature.id} defaultChecked={selectedFeatures.has(feature.id)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#B88746]" />
                        <span>{(feature.name as Text).sk}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )
            })}
            {canEdit ? (
              <>
                <div className="grid gap-5 border-t border-line pt-5 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Vlastná položka (SK)" name="custom_name" hint="Nepovinné. Pridá sa do číselníka a k tomuto vozidlu." />
                  <Field label="Vlastná položka (EN)" name="custom_name_en" />
                  <div className="space-y-2">
                    <Label htmlFor="custom_group">Skupina</Label>
                    <select id="custom_group" name="custom_group" defaultValue="comfort" className={selectClass}>
                      {GROUPS.map((g) => (
                        <option key={g.key} value={g.key}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <SubmitButton>Uložiť výbavu</SubmitButton>
              </>
            ) : null}
          </fieldset>
        </ActionForm>
      </Section>

      <Section id="priplatky" title="Príplatky" description="Ktoré príplatky sa pri tomto vozidle ponúkajú a za akú cenu. Prázdna cena = základná cena príplatku.">
        <ActionForm action={saveVehicleExtrasAction}>
          <fieldset disabled={!canEdit} className="space-y-4">
            <input type="hidden" name="vehicle_id" value={vehicle.id} />
            {(extrasRes.data ?? []).map((extra) => {
              const row = vehicleExtras.get(extra.id)
              const enabled = extra.is_global ? (row?.is_enabled ?? true) : (row?.is_enabled ?? false)
              return (
                <div key={extra.id} className="grid items-end gap-4 border-b border-line pb-4 last:border-0 sm:grid-cols-[1fr_12rem]">
                  <label className="flex min-h-10 items-start gap-3 text-sm text-white">
                    <input type="checkbox" name={`enabled_${extra.id}`} defaultChecked={enabled} className="mt-0.5 h-5 w-5 shrink-0 accent-[#B88746]" />
                    <span>
                      {(extra.name as Text).sk}
                      <span className="block text-xs text-muted2">
                        základná cena {formatEuro(extra.price_cents)} {extra.pricing_type === 'per_day' ? '/ deň' : '/ prenájom'}
                        {extra.is_global ? '' : ' · len vybrané vozidlá'}
                        {extra.is_active ? '' : ' · príplatok je neaktívny'}
                      </span>
                    </span>
                  </label>
                  <Field label="Vlastná cena (€)" name={`price_${extra.id}`} inputMode="decimal" defaultValue={centsToInput(row?.price_override_cents)} placeholder={centsToInput(extra.price_cents)} />
                </div>
              )
            })}
            {canEdit ? <SubmitButton>Uložiť príplatky</SubmitButton> : null}
          </fieldset>
        </ActionForm>
      </Section>

      <Section id="podmienky" title="Podmienky a asistencia" description="Prázdne pole = platí globálna hodnota z Nastavení (uvedená sivou).">
        <ActionForm action={saveVehicleConditionsAction}>
          <fieldset disabled={!canEdit} className="space-y-6">
            <input type="hidden" name="vehicle_id" value={vehicle.id} />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Depozit (€)" name="deposit" inputMode="decimal" defaultValue={centsToInput(vehicle.deposit_cents)} placeholder={centsToInput(settings.deposit_cents)} />
              <Field label="Limit km / deň" name="km_limit_per_day" type="number" min={1} defaultValue={vehicle.km_limit_per_day ?? ''} placeholder={String(settings.km_limit_per_day)} />
              <Field label="Cena za km navyše (€)" name="extra_km" inputMode="decimal" defaultValue={centsToInput(vehicle.extra_km_cents)} placeholder={centsToInput(settings.extra_km_cents)} />
              <Field label="Min. vek vodiča" name="min_driver_age" type="number" min={18} max={99} defaultValue={vehicle.min_driver_age ?? ''} placeholder={String(settings.min_driver_age)} />
              <Field label="Min. vlastníctvo VP (mesiace)" name="min_license_months" type="number" min={0} defaultValue={vehicle.min_license_months ?? ''} placeholder={String(settings.min_license_months)} />
              <Field
                label="Príprava medzi prenájmami (hodiny)"
                name="buffer_hours"
                type="number"
                min={0}
                defaultValue={vehicle.buffer_minutes === null ? '' : Math.round(vehicle.buffer_minutes / 60)}
                placeholder={String(Math.round(settings.default_buffer_minutes / 60))}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Asistenčná služba – telefón" name="assistance_phone" type="tel" defaultValue={assistance.phone ?? ''} placeholder={settings.assistance.phone} />
              <Field label="Poisťovňa" name="assistance_insurer" defaultValue={assistance.insurer ?? ''} placeholder={settings.assistance.insurer ?? ''} />
              <Field label="Číslo poistnej zmluvy" name="assistance_policy_number" defaultValue={assistance.policy_number ?? ''} hint="Interný údaj." />
              <Field label="Poznámka k asistencii" name="assistance_note" defaultValue={assistance.note ?? ''} />
            </div>
            {canEdit ? <SubmitButton>Uložiť podmienky</SubmitButton> : null}
          </fieldset>
        </ActionForm>
      </Section>

      <Section id="dostupnost" title="Dostupnosť" description="Blokácie (servis, STK, súkromné použitie) a obsadenosť z rezervácií. Časy sú v časovom pásme Europe/Bratislava.">
        <div className="grid gap-8 lg:grid-cols-2">
          <MonthCalendar year={year} month={month} ranges={ranges} hrefFor={(m) => `/admin/vozidla/${vehicle.id}?mesiac=${m}#dostupnost`} />
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gold">Blokácie</h3>
              {blocks.length === 0 ? <p className="text-sm text-muted2">Žiadne aktuálne ani budúce blokácie.</p> : null}
              <ul className="space-y-3">
                {blocks.map((block) => (
                  <li key={block.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-black px-3 py-2 text-sm">
                    <div>
                      <p className="text-white">
                        {formatDateTime(block.starts_at)} – {formatDateTime(block.ends_at)}
                      </p>
                      <p className="text-muted2">
                        {BLOCK_REASONS[block.reason]}
                        {block.note ? ` · ${block.note}` : ''}
                      </p>
                    </div>
                    {canEdit ? (
                      <ActionForm action={deleteBlockAction} confirm="Naozaj zrušiť túto blokáciu?">
                        <input type="hidden" name="id" value={block.id} />
                        <input type="hidden" name="vehicle_id" value={vehicle.id} />
                        <SubmitButton variant="outline" size="sm" pendingLabel="Ruším…">
                          Zrušiť
                        </SubmitButton>
                      </ActionForm>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gold">Rezervácie</h3>
              {bookings.length === 0 ? <p className="text-sm text-muted2">Žiadne aktuálne ani budúce rezervácie.</p> : null}
              <ul className="space-y-2 text-sm">
                {bookings.map((booking) => (
                  <li key={booking.id} className="rounded-lg border border-line bg-black px-3 py-2">
                    <p className="text-white">
                      {booking.number} · {STATUS_LABELS[booking.status] ?? booking.status}
                    </p>
                    <p className="text-muted2">
                      {formatDateTime(booking.pickup_at)} – {formatDateTime(booking.return_at)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {canEdit ? (
          <div className="mt-8 border-t border-line pt-6">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gold">Nová blokácia</h3>
            <ActionForm action={addBlockAction} resetOnSuccess>
              <input type="hidden" name="vehicle_id" value={vehicle.id} />
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Od" name="starts_at" type="datetime-local" required />
                <Field label="Do" name="ends_at" type="datetime-local" required />
                <div className="space-y-2">
                  <Label htmlFor="reason">Dôvod</Label>
                  <select id="reason" name="reason" defaultValue="service" className={selectClass}>
                    {Object.entries(BLOCK_REASONS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <Field label="Poznámka" name="note" />
              </div>
              <div className="mt-5">
                <SubmitButton>Pridať blokáciu</SubmitButton>
              </div>
            </ActionForm>
          </div>
        ) : null}
      </Section>

      {canEdit ? (
        <Section title="Zmazať vozidlo" description="Zmazať možno len vozidlo bez rezervácií. Vozidlo s históriou namiesto toho skryte.">
          <ActionForm action={deleteVehicleAction} confirm={`Naozaj natrvalo zmazať vozidlo ${vehicle.name} vrátane fotiek?`}>
            <input type="hidden" name="id" value={vehicle.id} />
            <SubmitButton variant="destructive" pendingLabel="Mažem…">
              Zmazať vozidlo
            </SubmitButton>
          </ActionForm>
        </Section>
      ) : null}
    </div>
  )
}
