import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SettlementForm, type SettlementFormValues } from '@/components/admin/protocol/settlement-form'
import { PageHeader, Section } from '@/components/admin/section'
import { hasRole } from '@/lib/auth/roles'
import { requireStaff } from '@/lib/auth/session'
import { formatEuro } from '@/lib/format'
import { fuelLabel, percentToEighths } from '@/lib/protocol/model'
import { damageItemsOf, formatDuration } from '@/lib/settlement'
import { loadSettlementContext } from '@/lib/settlement-data'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/time'

export const metadata: Metadata = { title: 'Vyúčtovanie' }

const km = (value: number) => new Intl.NumberFormat('sk-SK').format(value)

export default async function SettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireStaff('operator', `/admin/rezervacie/${id}/vyuctovanie`)
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const context = await loadSettlementContext(await createClient(), id)
  if (!context) notFound()
  const { booking, pickup, returned, settlement, proposal, damages, remarks, ratePerDayCents } = context
  const back = { href: `/admin/rezervacie/${id}`, label: `Rezervácia ${booking.number}` }
  const customer = (booking.customer_snapshot ?? {}) as { first_name?: string; last_name?: string }

  if (!returned || !proposal) {
    return (
      <div>
        <PageHeader title="Vyúčtovanie" back={back} />
        <Section title="Zatiaľ nie je čo vyúčtovať">
          <p className="text-sm text-muted2">Návrh vyúčtovania vznikne po podpise preberacieho protokolu.</p>
          <a
            href={`/admin/rezervacie/${id}/protokol/preberaci`}
            className="mt-4 inline-flex min-h-12 items-center rounded-lg border border-gold px-5 text-[15px] font-semibold text-white hover:bg-gold/15"
          >
            Preberací protokol
          </a>
        </Section>
      </div>
    )
  }

  const stored = settlement ? Object.fromEntries(damageItemsOf(settlement.damage_items).map((item) => [item.damage_id, item.cents])) : {}
  const initial: SettlementFormValues = settlement
    ? {
        km: settlement.extra_km_cents,
        fuel: settlement.fuel_cents,
        late: settlement.late_cents,
        other: settlement.other_cents,
        otherLabel: settlement.other_label ?? '',
        note: settlement.note ?? '',
        damages: stored,
      }
    : { km: proposal.extraKmCents, fuel: 0, late: proposal.lateCents, other: 0, otherLabel: '', note: '', damages: {} }

  const before = percentToEighths(pickup?.fuel_level)
  const after = percentToEighths(returned.fuel_level)
  const explain = {
    km:
      proposal.kmDriven === null
        ? 'Chýba stav tachometra z odovzdávacieho protokolu – kilometre nad limit zadajte ručne.'
        : `${km(returned.odometer_km ?? 0)} − ${km(pickup?.odometer_km ?? 0)} = ${km(proposal.kmDriven)} km najazdených · limit ${booking.km_limit_per_day} × ${booking.days} = ${km(proposal.kmLimit)} km · nad limit ${km(proposal.extraKm)} km × ${formatEuro(booking.extra_km_cents)} = ${formatEuro(proposal.extraKmCents)}`,
    fuel:
      before === null || after === null
        ? 'Stav paliva nie je v oboch protokoloch – sumu zadajte podľa skutočnosti.'
        : `Pri odovzdaní ${fuelLabel(pickup?.fuel_level)} → pri prevzatí ${fuelLabel(returned.fuel_level)} · ${after < before ? `chýba ${before - after}/8 nádrže` : 'bez rozdielu'}. Sumu zadáva zamestnanec.`,
    late:
      proposal.lateMinutes <= 0
        ? `Plánované ${formatDateTime(booking.return_at)} · vrátené ${returned.handover_at ? formatDateTime(returned.handover_at) : '—'} · bez meškania.`
        : `Plánované ${formatDateTime(booking.return_at)} · vrátené ${formatDateTime(returned.handover_at!)} · meškanie ${formatDuration(proposal.lateMinutes)}` +
          (proposal.lateDays > 0
            ? ` → návrh ${proposal.lateDays} × ${ratePerDayCents !== null ? formatEuro(ratePerDayCents) : 'denná sadzba (individuálna cena – zadajte ručne)'} za každý začatý deň`
            : ' · v rámci tolerancie, bez poplatku'),
  }

  return (
    <div>
      <PageHeader title="Vyúčtovanie po prevzatí" back={back} />
      <div className="mb-4 rounded-xl border border-gold/50 px-4 py-3">
        <p className="flex items-center justify-between gap-3 text-[11px] font-semibold tracking-[0.12em] text-gold">
          <span>{booking.number}</span>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[10.5px] uppercase ${settlement?.approved_at ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200' : 'border-gold text-gold'}`}
          >
            {settlement?.approved_at ? 'Potvrdené' : settlement ? 'Uložený návrh' : 'Návrh'}
          </span>
        </p>
        <p className="mt-0.5 text-[17px] font-semibold text-white">
          {booking.vehicles?.name}
          {booking.vehicles?.license_plate ? ` · ${booking.vehicles.license_plate}` : ''}
        </p>
        <p className="text-[13px] text-muted2">
          {`${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim()} · {formatDateTime(booking.pickup_at)} – {formatDateTime(booking.return_at)}
        </p>
      </div>
      <p className="mb-4 text-[13px] text-muted2">
        Sumy sú s DPH. Zlato orámované pole navrhol systém z protokolov; každú sumu môžete prepísať.
        {settlement?.approved_at ? ` Potvrdené ${formatDateTime(settlement.approved_at)} – zákazník vyúčtovanie vidí vo svojom účte.` : ' Kým vyúčtovanie nepotvrdíte, zákazník ho nevidí.'}
      </p>
      <SettlementForm
        key={`${settlement?.updated_at ?? 'new'}-${settlement?.approved_at ?? ''}`}
        bookingId={id}
        initial={initial}
        damages={damages}
        explain={explain}
        remarks={remarks}
        depositCents={booking.deposit_cents}
        approved={!!settlement?.approved_at}
        canEdit={hasRole(user.role, 'manager')}
      />
      <p className="mt-6 text-[13px] text-muted2">Zápis vrátenia depozitu (dátum, spôsob) pribudne s evidenciou platieb vo Fáze 9.</p>
    </div>
  )
}
