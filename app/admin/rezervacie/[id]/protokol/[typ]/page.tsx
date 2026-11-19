import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ProtocolWizard, type WizardReference } from '@/components/admin/protocol/protocol-wizard'
import { PageHeader, Section } from '@/components/admin/section'
import { ActionForm, SubmitButton } from '@/components/admin/ui'
import { requireStaff } from '@/lib/auth/session'
import { BOOKING_STATUS_LABELS } from '@/lib/booking/status'
import { discardProtocolDraftAction, generateProtocolPdfAction, resendProtocolEmailAction, startProtocolAction } from '@/lib/protocol/actions'
import { accessoriesOf, cleanlinessOf, draftOf, latestSigned, loadProtocols, protocolToDraft, signedMediaUrls } from '@/lib/protocol/load'
import {
  CLEANLINESS_LABEL,
  PROTOCOL_TITLE,
  defaultAccessories,
  fuelLabel,
  missingAccessories,
  protocolTypeFromSlug,
  returnAccessories,
  usesCharge,
  usesFuel,
  type DamageKind,
  type DamageView,
  type PhotoAngle,
} from '@/lib/protocol/model'
import { getSettings } from '@/lib/settings'
import { createClient } from '@/lib/supabase/server'
import { formatEuro } from '@/lib/format'
import { depositOutstandingCents, missingPayments, rentalOutstandingCents } from '@/lib/payment'
import { formatDateTime, utcToZonedLocal } from '@/lib/time'

export const metadata: Metadata = { title: 'Protokol' }
// Signing renders the PDF (photos included) inside the server action of this page.
export const maxDuration = 60

type Localized = { sk?: string; en?: string }

export default async function ProtocolPage({ params }: { params: Promise<{ id: string; typ: string }> }) {
  const { id, typ } = await params
  const type = protocolTypeFromSlug(typ)
  if (!type || !/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const user = await requireStaff('operator', `/admin/rezervacie/${id}/protokol/${typ}`)

  const supabase = await createClient()
  const [{ data: booking }, { data: extras }, protocols, settings] = await Promise.all([
    supabase.from('bookings').select('*, vehicles(name, license_plate, fuel)').eq('id', id).maybeSingle(),
    supabase.from('booking_extras').select('id, name_snapshot, quantity').eq('booking_id', id),
    loadProtocols(supabase, id),
    getSettings(supabase),
  ])
  if (!booking) notFound()

  const title = PROTOCOL_TITLE[type]
  const back = { href: `/admin/rezervacie/${id}`, label: `Rezervácia ${booking.number}` }
  const customer = (booking.customer_snapshot ?? {}) as { first_name?: string; last_name?: string }
  const customerName = `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim()
  const snapshot = (booking.price_snapshot ?? {}) as { pickup_location?: { address: string }; return_location?: { address: string } }
  const place = (type === 'pickup' ? (booking.pickup_custom_address ?? snapshot.pickup_location?.address) : (booking.return_custom_address ?? snapshot.return_location?.address)) ?? ''
  const fuel = booking.vehicles?.fuel ?? 'diesel'

  const draft = draftOf(protocols, type)
  const signed = latestSigned(protocols, type)
  const pickup = latestSigned(protocols, 'pickup')

  // ───────── filling in ─────────
  if (draft) {
    const referenceRow = type === 'return' ? pickup : null
    const urls = await signedMediaUrls(supabase, [
      ...draft.photos.map((p) => p.storage_path),
      ...draft.damages.map((d) => d.photo_path),
      ...(referenceRow?.photos ?? []).map((p) => p.storage_path),
      ...(referenceRow?.damages ?? []).map((d) => d.photo_path),
    ])
    const reference: WizardReference | null = referenceRow
      ? {
          handoverAt: referenceRow.handover_at ? formatDateTime(referenceRow.handover_at) : '',
          odometerKm: referenceRow.odometer_km,
          fuelLevel: referenceRow.fuel_level,
          chargeLevel: referenceRow.charge_level,
          ...cleanlinessOf(referenceRow),
          accessories: accessoriesOf(referenceRow),
          damages: referenceRow.damages.map((d) => ({
            id: d.id,
            view: d.view as DamageView,
            x: Number(d.x),
            y: Number(d.y),
            kind: d.kind as DamageKind,
            description: d.description,
            photoPath: d.photo_path,
          })),
          photos: referenceRow.photos.map((p) => ({ angle: p.angle as PhotoAngle, path: p.storage_path })),
        }
      : null
    const initial = protocolToDraft(draft, {
      accessories: reference
        ? returnAccessories(reference.accessories)
        : defaultAccessories((extras ?? []).map((extra) => ({ id: extra.id, name: (extra.name_snapshot as Localized).sk ?? '', quantity: extra.quantity }))),
      customerName,
      staffName: `${user.firstName} ${user.lastName}`.trim(),
    })
    return (
      <div>
        <PageHeader title={title} back={back} />
        {draft.supersedes_id ? (
          <p className="mb-4 rounded-lg border border-amber-400/60 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            Opravná verzia {draft.version}. Po podpise nahradí verziu {draft.version - 1}; pôvodná ostáva uložená. Stav rezervácie sa nemení.
          </p>
        ) : null}
        <ProtocolWizard
          key={draft.id}
          protocolId={draft.id}
          type={type}
          version={draft.version}
          fuel={fuel}
          initial={initial}
          initialUrls={urls}
          reference={reference}
          booking={{
            id: booking.id,
            number: booking.number,
            vehicleName: booking.vehicles?.name ?? '',
            plate: booking.vehicles?.license_plate ?? null,
            customerName,
            term: `${formatDateTime(booking.pickup_at)} – ${formatDateTime(booking.return_at)}`,
            place,
            days: booking.days,
            kmLimitPerDay: booking.km_limit_per_day,
            plannedReturnAt: booking.return_at,
            toleranceMinutes: settings.return_tolerance_minutes,
            unpaid:
              type === 'pickup' && !draft.supersedes_id && settings.require_payment_before_pickup
                ? missingPayments(booking).map((kind) =>
                    kind === 'rental'
                      ? {
                          kind,
                          label: `${booking.rental_payment_status === 'unpaid' ? 'Prenájom' : 'Doplatok prenájmu'} ${formatEuro(rentalOutstandingCents(booking))}`,
                          method: booking.rental_payment_method,
                        }
                      : {
                          kind,
                          label: `${booking.deposit_status === 'pending' ? 'Depozit' : 'Doplatok depozitu'} ${formatEuro(depositOutstandingCents(booking))}`,
                          method: booking.deposit_payment_method,
                        },
                  )
                : [],
            today: utcToZonedLocal(new Date()).slice(0, 10),
          }}
        />
        <div className="mt-10 border-t border-line pt-4">
          <ActionForm action={discardProtocolDraftAction} confirm="Zahodiť rozpracovaný protokol? Vyplnené údaje a fotky sa zmažú.">
            <input type="hidden" name="protocolId" value={draft.id} />
            <SubmitButton variant="ghost" className="text-red-200" pendingLabel="Mažem…">
              Zahodiť rozpracovaný protokol
            </SubmitButton>
          </ActionForm>
        </div>
      </div>
    )
  }

  // ───────── signed ─────────
  if (signed) {
    const versions = protocols.filter((p) => p.type === type && p.signed_at).sort((a, b) => b.version - a.version)
    const clean = cleanlinessOf(signed)
    const notReturned = type === 'return' && pickup ? missingAccessories(accessoriesOf(pickup), accessoriesOf(signed)) : []
    const rows: [string, string][] = [
      [type === 'pickup' ? 'Odovzdané' : 'Prevzaté', signed.handover_at ? formatDateTime(signed.handover_at) : '—'],
      [
        'Tachometer',
        signed.odometer_km === null
          ? '—'
          : `${new Intl.NumberFormat('sk-SK').format(signed.odometer_km)} km${type === 'return' && pickup?.odometer_km != null ? ` · najazdené ${new Intl.NumberFormat('sk-SK').format(signed.odometer_km - pickup.odometer_km)} km` : ''}`,
      ],
      ...(usesFuel(fuel) ? ([['Palivo', fuelLabel(signed.fuel_level)]] as [string, string][]) : []),
      ...(usesCharge(fuel) ? ([['Nabitie batérie', signed.charge_level === null ? '—' : `${signed.charge_level} %`]] as [string, string][]) : []),
      ['Čistota', `interiér ${CLEANLINESS_LABEL[clean.interior].toLowerCase()} · exteriér ${CLEANLINESS_LABEL[clean.exterior].toLowerCase()}`],
      [type === 'return' ? 'Nové poškodenia' : 'Poškodenia', String(signed.damages.length)],
      ...(notReturned.length > 0 ? ([['Nevrátené príslušenstvo', notReturned.join(', ')]] as [string, string][]) : []),
      ['Fotky', String(signed.photos.length)],
      ['Podpísali', `${signed.signed_by_name ?? ''} · ${signed.staff_name ?? ''}`],
    ]
    const button = 'flex min-h-12 items-center justify-center rounded-lg px-5 text-[15px] font-semibold transition-colors'
    return (
      <div>
        <PageHeader title={title} back={back} />
        <div className="space-y-4">
          <div className="space-y-4 rounded-xl border border-gold/60 bg-surface p-5">
            <p className="flex flex-wrap items-center gap-2 text-sm text-white">
              <span className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-200">Podpísaný · uzamknutý</span>
              <span className="text-muted2">
                verzia {signed.version} · {formatDateTime(signed.signed_at!)} · rezervácia: {BOOKING_STATUS_LABELS[booking.status]}
              </span>
            </p>
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[12rem_1fr] sm:gap-y-2">
              {rows.map(([name, value]) => (
                <div key={name} className="contents">
                  <dt className="text-muted2">{name}</dt>
                  <dd className="mb-2 break-words text-white sm:mb-0">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-2">
              {signed.pdf_path ? (
                <a href={`/api/protocols/${signed.id}/pdf`} target="_blank" rel="noopener" className={`${button} flex-1 bg-gold text-white hover:bg-gold-hover`}>
                  Zobraziť PDF
                </a>
              ) : null}
              {type === 'return' ? (
                <a href={`/admin/rezervacie/${id}/vyuctovanie`} className={`${button} flex-1 border border-gold text-white hover:bg-gold/15`}>
                  Vyúčtovanie
                </a>
              ) : null}
            </div>
            {!signed.pdf_path ? (
              <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-3">
                <p className="mb-3 text-sm text-amber-100">Protokol je podpísaný, ale PDF sa nepodarilo vytvoriť. Zákazník ho zatiaľ nevidí.</p>
                <ActionForm action={generateProtocolPdfAction}>
                  <input type="hidden" name="protocolId" value={signed.id} />
                  <SubmitButton pendingLabel="Vytváram PDF…">Vytvoriť PDF</SubmitButton>
                </ActionForm>
              </div>
            ) : null}
          </div>

          <Section title="Ďalšie možnosti">
            <div className="space-y-5">
              <ActionForm action={resendProtocolEmailAction}>
                <input type="hidden" name="protocolId" value={signed.id} />
                <p className="mb-2 text-sm text-muted2">Zákazník dostal protokol e-mailom pri podpise. Ak e-mail neodišiel, pošlite ho znova.</p>
                <SubmitButton variant="outline" pendingLabel="Odosielam…">
                  Poslať protokol e-mailom znova
                </SubmitButton>
              </ActionForm>
              <ActionForm action={startProtocolAction} confirm="Vytvoriť opravnú verziu? Otvorí sa kópia protokolu, ktorú treba upraviť a znova podpísať so zákazníkom.">
                <input type="hidden" name="bookingId" value={id} />
                <input type="hidden" name="type" value={type} />
                <p className="mb-2 text-sm text-muted2">Podpísaný protokol sa nedá meniť. Chybu opraví len nová verzia, ktorú zákazník znova podpíše; pôvodná ostáva uložená.</p>
                <SubmitButton variant="outline" pendingLabel="Otváram…">
                  Vytvoriť opravnú verziu
                </SubmitButton>
              </ActionForm>
            </div>
          </Section>

          {versions.length > 1 ? (
            <Section title="Verzie">
              <ul className="space-y-2 text-sm text-white">
                {versions.map((version) => (
                  <li key={version.id} className="flex flex-wrap gap-x-3">
                    <span>
                      Verzia {version.version}
                      {version.id === signed.id ? ' (platná)' : ' (nahradená)'}
                    </span>
                    <span className="text-muted2">{formatDateTime(version.signed_at!)}</span>
                    {version.pdf_path ? (
                      <a href={`/api/protocols/${version.id}/pdf`} target="_blank" rel="noopener" className="text-gold underline-offset-4 hover:underline">
                        PDF
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>
    )
  }

  // ───────── not started ─────────
  const allowed = type === 'pickup' ? booking.status === 'confirmed' || booking.status === 'active' : booking.status === 'active' || booking.status === 'completed'
  return (
    <div>
      <PageHeader title={title} back={back} />
      <Section
        title={`${booking.vehicles?.name ?? ''}${booking.vehicles?.license_plate ? ` · ${booking.vehicles.license_plate}` : ''}`}
        description={`${customerName} · ${formatDateTime(booking.pickup_at)} – ${formatDateTime(booking.return_at)}`}
      >
        {allowed ? (
          <ActionForm action={startProtocolAction}>
            <input type="hidden" name="bookingId" value={id} />
            <input type="hidden" name="type" value={type} />
            <p className="mb-4 text-sm text-muted2">
              {type === 'pickup'
                ? 'Protokol vyplníte pri vozidle spolu so zákazníkom: stav, príslušenstvo, poškodenia, fotky a podpisy. Podpisom sa rezervácia zmení na Prebiehajúcu.'
                : `Pri vrátení porovnáte stav s odovzdaním${pickup ? '' : ' (odovzdávací protokol k tejto rezervácii nie je, porovnanie sa nezobrazí)'}. Podpisom sa rezervácia ukončí a pripraví sa návrh vyúčtovania.`}
            </p>
            <SubmitButton size="lg" className="w-full sm:w-auto" pendingLabel="Otváram…">
              Začať {title.toLowerCase()}
            </SubmitButton>
          </ActionForm>
        ) : (
          <p className="text-sm text-muted2">
            Rezervácia je v stave „{BOOKING_STATUS_LABELS[booking.status]}“.{' '}
            {type === 'pickup' ? 'Odovzdávací protokol sa vypĺňa pri potvrdenej rezervácii.' : 'Preberací protokol sa vypĺňa pri prebiehajúcej rezervácii.'}
          </p>
        )}
      </Section>
    </div>
  )
}
