import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { BookingNoteForm, BookingQuickActions, CancelBookingForm, ResolveChangeForm, StatusWithoutProtocol } from '@/components/admin/booking-actions'
import { PageHeader, Section } from '@/components/admin/section'
import { PaymentsPanel } from '@/components/admin/payments-panel'
import { DocumentsPanel } from '@/components/admin/documents-panel'
import { loadBlacklist, matchBlacklist } from '@/lib/customers/blacklist'
import { variableSymbol } from '@/lib/payment'
import { hasRole } from '@/lib/auth/roles'
import { requireStaff } from '@/lib/auth/session'
import { canTransition, isEditable } from '@/lib/booking-status'
import { describeBookingChange, type ChangeableBooking } from '@/lib/booking/change'
import { cancellationQuote } from '@/lib/cancellation'
import { latestSigned, draftOf } from '@/lib/protocol/load'
import { PROTOCOL_SLUG, PROTOCOL_TITLE, type ProtocolType } from '@/lib/protocol/model'
import { getSettings } from '@/lib/settings'
import { BOOKING_STATUS_LABELS, PAYMENT_METHOD_LABELS, STATUS_BADGE_CLASS } from '@/lib/booking/status'
import { formatEuro } from '@/lib/format'
import type { PriceBreakdown } from '@/lib/pricing'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatDateTime, utcToZonedLocal } from '@/lib/time'

export const metadata: Metadata = { title: 'Rezervácia' }

type Name = { sk?: string; en?: string }
type Customer = {
  first_name?: string; last_name?: string; email?: string; phone?: string; date_of_birth?: string
  is_company?: boolean; company_name?: string | null; ico?: string | null; dic?: string | null; ic_dph?: string | null
  billing_address?: { street?: string; city?: string; zip?: string; country?: string }
}
type Snapshot = Partial<PriceBreakdown> & { delivery_outside_city?: boolean } & { pickup_location?: { name: Name; address: string }; return_location?: { name: Name; address: string } }

const CONSENT_LABELS: Record<string, string> = { terms: 'VOP', gdpr: 'Osobné údaje', marketing: 'Marketing', deposit: 'Depozit', km_limit: 'Limit km', license: 'Vodičský preukaz' }
const EMAIL_LABELS: Record<string, string> = {
  booking_received: 'Rezervácia prijatá (zákazník)',
  booking_admin_new: 'Nová rezervácia (BTW)',
  booking_confirmed: 'Rezervácia potvrdená (zákazník)',
  booking_cancelled: 'Rezervácia zrušená (zákazník)',
  booking_cancelled_admin: 'Rezervácia zrušená (BTW)',
  booking_change_requested: 'Úprava od zákazníka (BTW)',
  booking_change_approved: 'Úprava schválená (zákazník)',
  booking_change_rejected: 'Úprava zamietnutá (zákazník)',
  protocol_pickup: 'Odovzdávací protokol (zákazník)',
  protocol_return: 'Preberací protokol (zákazník)',
  settlement_approved: 'Vyúčtovanie (zákazník)',
  document_available: 'Doklad k dispozícii (zákazník)',
  pickup_reminder: 'Pripomienka vyzdvihnutia (automaticky)',
  return_reminder: 'Pripomienka vrátenia (automaticky)',
  review_request: 'Poďakovanie a recenzia (automaticky)',
}
const EMAIL_STATUS: Record<string, string> = { queued: 'čaká', sent: 'odoslaný', delivered: 'doručený', bounced: 'vrátený', failed: 'neodoslaný' }

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[14rem_1fr] sm:gap-y-2">
      {/* Index keys: labels repeat (e.g. the same e-mail sent twice), and duplicate keys break the page refresh after an action. */}
      {rows.map(([label, value], index) => (
        <div key={index} className="contents">
          <dt className="text-muted2">{label}</dt>
          <dd className="mb-2 break-words text-white sm:mb-0">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

// Everything about one booking: status changes, cancellation, notes, history, emails.
export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireStaff('operator', `/admin/rezervacie/${id}`)
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const supabase = await createClient()
  const [{ data: booking }, { data: extras }, { data: consents }, { data: emails }, { data: history }, { data: notes }, settings, { data: protocols }, { data: settlement }] = await Promise.all([
    supabase.from('bookings').select('*, vehicles(name, license_plate, vin)').eq('id', id).maybeSingle(),
    supabase.from('booking_extras').select('*').eq('booking_id', id),
    supabase.from('consents').select('type, version, granted, granted_at').eq('booking_id', id).order('type'),
    supabase.from('email_log').select('id, type, recipient, status, error, created_at').eq('booking_id', id).order('created_at'),
    supabase.from('booking_status_history').select('id, from_status, to_status, note, created_at, changed_by').eq('booking_id', id).order('created_at'),
    supabase.from('booking_notes').select('id, body, created_at, author_id').eq('booking_id', id).order('created_at', { ascending: false }),
    getSettings(supabase),
    supabase.from('handover_protocols').select('id, type, version, signed_at, pdf_path').eq('booking_id', id),
    supabase.from('settlements').select('total_cents, approved_at').eq('booking_id', id).maybeSingle(),
  ])
  if (!booking) notFound()

  const customer = (booking.customer_snapshot ?? {}) as Customer
  const snapshot = (booking.price_snapshot ?? {}) as Snapshot
  const address = customer.billing_address ?? {}
  const place = (location?: { name: Name; address: string }) => (location ? `${location.name.sk ?? ''} (${location.address})` : '')

  // Names of the people in the history and notes (staff can read profiles).
  const personIds = [...new Set([...(history ?? []).map((h) => h.changed_by), ...(notes ?? []).map((n) => n.author_id), booking.rental_paid_marked_by, booking.deposit_received_marked_by, booking.deposit_returned_marked_by].filter((v): v is string => !!v))]
  const { data: people } = personIds.length > 0 ? await supabase.from('profiles').select('id, first_name, last_name, type').in('id', personIds) : { data: [] }
  const personName = (personId: string | null) => {
    if (!personId) return 'systém'
    if (personId === booking.customer_id) return 'zákazník'
    const person = (people ?? []).find((p) => p.id === personId)
    return person ? `${person.first_name} ${person.last_name}`.trim() || 'zamestnanec' : 'zamestnanec'
  }
  const [{ data: customerProfile }, { data: documents }, blacklist] = await Promise.all([
    supabase.from('profiles').select('refund_iban').eq('id', booking.customer_id).maybeSingle(),
    supabase.from('documents').select('id, type, number, amount_cents, issued_at, uploaded_by, emailed_at').eq('booking_id', id).order('created_at'),
    loadBlacklist(supabase),
  ])
  const blacklistHits = matchBlacklist(blacklist, { customerId: booking.customer_id, email: customer.email, phone: customer.phone })
  const uploaderIds = [...new Set((documents ?? []).map((d) => d.uploaded_by).filter((v): v is string => !!v && !personIds.includes(v)))]
  const { data: uploaders } = uploaderIds.length > 0 ? await supabase.from('profiles').select('id, first_name, last_name').in('id', uploaderIds) : { data: [] }
  const uploaderName = (uid: string | null) => {
    if (!uid) return null
    const extra = (uploaders ?? []).find((p) => p.id === uid)
    return extra ? `${extra.first_name} ${extra.last_name}`.trim() : personName(uid)
  }
  const day = (value: string | null) => (value ? formatDate(value) : undefined)
  const quote = cancellationQuote(new Date(booking.pickup_at), booking.total_cents, settings.cancellation_tiers)
  const canEdit = hasRole(user.role, 'manager') && isEditable(booking.status)

  // A change requested by the customer: what differs, and whether the new term is free.
  const pending = booking.status === 'modified' ? (booking.pending_change as { booking?: ChangeableBooking & { vehicle_id: string }; extras?: { name_snapshot: unknown; quantity: number }[]; requested_at?: string } | null) : null
  const changes = pending?.booking ? describeBookingChange(booking, extras ?? [], pending.booking, pending.extras ?? []) : []
  let collision = false
  if (pending?.booking) {
    const { data: free } = await supabase.rpc('is_vehicle_available', { p_vehicle_id: pending.booking.vehicle_id, p_pickup_at: pending.booking.pickup_at, p_return_at: pending.booking.return_at, p_exclude_booking_id: booking.id })
    collision = free === false
  }

  return (
    <div>
      <PageHeader title={`Rezervácia ${booking.number}`} back={{ href: '/admin/rezervacie', label: 'Rezervácie' }} />
      <div className="space-y-4">
        {blacklistHits.map((hit) => (
          <p key={hit.profileId} role="alert" className="rounded-xl border border-red-400/60 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            <strong>Problémový zákazník (blacklist)</strong>
            {hit.via === 'account' ? '' : hit.via === 'email' ? ` – rovnaký e-mail ako ${hit.name}` : ` – rovnaký telefón ako ${hit.name}`}
            {hit.note ? `: ${hit.note}` : '.'}{' '}
            <a href={`/admin/zakaznici/${hit.profileId}`} className="font-semibold text-white underline underline-offset-4">
              Detail zákazníka
            </a>
          </p>
        ))}
        <div className="rounded-xl border border-gold/60 bg-surface p-4">
          <p className="mb-3 flex flex-wrap items-center gap-3 text-sm text-white">
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[booking.status]}`}>{BOOKING_STATUS_LABELS[booking.status]}</span>
            {booking.cancelled_at ? <span className="text-muted2">zrušená {formatDateTime(booking.cancelled_at)}</span> : null}
          </p>
          <BookingQuickActions id={booking.id} number={booking.number} status={booking.status} cancelHref="#storno" detailHref={`/admin/rezervacie/${booking.id}`} />
          {canEdit ? (
            <Link href={`/admin/rezervacie/${booking.id}/upravit`} className="mt-2 flex h-11 items-center justify-center rounded-lg border border-gold px-4 text-sm font-semibold text-white transition-colors hover:bg-gold/15">
              Upraviť rezerváciu{booking.total_cents === null ? ' a doplniť cenu' : ''}
            </Link>
          ) : null}
          {booking.status === 'cancelled' ? (
            <p className="mt-3 text-sm text-white">
              Storno poplatok: <strong>{booking.cancellation_fee_cents ? formatEuro(booking.cancellation_fee_cents) : 'bez poplatku'}</strong>
              {booking.cancellation_reason ? <span className="text-muted2"> · {booking.cancellation_reason}</span> : null}
            </p>
          ) : null}
        </div>
        {booking.status === 'confirmed' || booking.status === 'active' || booking.status === 'completed' || (protocols ?? []).length > 0 ? (
          <Section id="protokoly" title="Protokoly a vyúčtovanie">
            <ul className="divide-y divide-line">
              {(['pickup', 'return'] as ProtocolType[]).map((type) => {
                const signedProtocol = latestSigned(protocols ?? [], type)
                const draft = draftOf(protocols ?? [], type)
                const canStart = type === 'pickup' ? booking.status === 'confirmed' || booking.status === 'active' : booking.status === 'active' || booking.status === 'completed'
                const href = `/admin/rezervacie/${booking.id}/protokol/${PROTOCOL_SLUG[type]}`
                return (
                  <li key={type} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold text-white">{PROTOCOL_TITLE[type]}</p>
                      <p className="text-muted2">
                        {draft ? `rozpracovaný${draft.version > 1 ? ` (oprava, verzia ${draft.version})` : ''}` : signedProtocol ? `podpísaný ${formatDateTime(signedProtocol.signed_at!)}${signedProtocol.version > 1 ? ` · verzia ${signedProtocol.version}` : ''}` : canStart ? 'zatiaľ nevyplnený' : type === 'pickup' ? 'vypĺňa sa pri potvrdenej rezervácii' : 'vypĺňa sa pri vrátení vozidla'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {signedProtocol?.pdf_path ? (
                        <a href={`/api/protocols/${signedProtocol.id}/pdf`} target="_blank" rel="noopener" className="flex h-11 items-center rounded-lg border border-gold/60 px-4 text-sm font-semibold text-gold hover:bg-gold/10">
                          PDF
                        </a>
                      ) : null}
                      {draft || signedProtocol || canStart ? (
                        <Link href={href} prefetch={false} className={`flex h-11 items-center rounded-lg px-4 text-sm font-semibold ${draft || !signedProtocol ? 'bg-gold text-white hover:bg-gold-hover' : 'border border-gold text-white hover:bg-gold/15'}`}>
                          {draft ? 'Pokračovať' : signedProtocol ? 'Otvoriť' : 'Vyplniť'}
                        </Link>
                      ) : null}
                    </div>
                  </li>
                )
              })}
              {latestSigned(protocols ?? [], 'return') ? (
                <li className="flex flex-wrap items-center justify-between gap-3 py-3 last:pb-0">
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-white">Vyúčtovanie</p>
                    <p className="text-muted2">
                      {settlement?.approved_at ? `potvrdené ${formatDateTime(settlement.approved_at)} · doúčtovanie ${formatEuro(settlement.total_cents ?? 0)}` : settlement ? 'uložený návrh – čaká na potvrdenie' : 'návrh čaká na kontrolu a potvrdenie'}
                    </p>
                  </div>
                  <Link href={`/admin/rezervacie/${booking.id}/vyuctovanie`} prefetch={false} className={`flex h-11 items-center rounded-lg px-4 text-sm font-semibold ${settlement?.approved_at ? 'border border-gold text-white hover:bg-gold/15' : 'bg-gold text-white hover:bg-gold-hover'}`}>
                    {settlement?.approved_at ? 'Otvoriť' : 'Skontrolovať'}
                  </Link>
                </li>
              ) : null}
            </ul>
            {(booking.status === 'confirmed' && !latestSigned(protocols ?? [], 'pickup')) || (booking.status === 'active' && !latestSigned(protocols ?? [], 'return')) ? (
              <div className="mt-3 border-t border-line pt-2">
                <StatusWithoutProtocol id={booking.id} to={booking.status === 'confirmed' ? 'active' : 'completed'} />
              </div>
            ) : null}
          </Section>
        ) : null}
        {pending ? (
          <Section id="uprava" title="Úprava od zákazníka" description={`Rezervácia platí v pôvodnom znení, kým nerozhodnete.${pending.requested_at ? ` Žiadosť: ${formatDateTime(pending.requested_at)}.` : ''}`}>
            {collision ? (
              <p role="alert" className="mb-4 rounded-lg border border-red-400/60 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                Navrhovaný termín koliduje s inou potvrdenou rezerváciou alebo blokáciou. Úpravu nie je možné schváliť.
              </p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted2">
                  <tr>
                    <th scope="col" className="py-2 pr-4 font-semibold" />
                    <th scope="col" className="py-2 pr-4 font-semibold">Pôvodne</th>
                    <th scope="col" className="py-2 font-semibold">Navrhované</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {changes.map((change) => (
                    <tr key={change.label} className="align-top">
                      <th scope="row" className="py-2 pr-4 font-normal text-muted2">{change.label}</th>
                      <td className="py-2 pr-4 text-muted2">{change.before}</td>
                      <td className="py-2 font-semibold text-white">{change.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <ResolveChangeForm id={booking.id} collision={collision} />
            </div>
          </Section>
        ) : null}
        {snapshot.delivery_outside_city ? (
          <p className="rounded-xl border border-amber-400/60 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            Zákazník žiada pristavenie mimo Bratislavy. Kontaktujte ho a dohodnite podmienky pred potvrdením; prípadný poplatok zatiaľ nie je v cene.
          </p>
        ) : null}
        <Section title="Rezervácia">
          <Rows
            rows={[
              ['Vozidlo', `${booking.vehicles?.name ?? ''}${booking.vehicles?.license_plate ? ` · ${booking.vehicles.license_plate}` : ''}`],
              ['Vyzdvihnutie', `${formatDateTime(booking.pickup_at)} · ${booking.pickup_custom_address ? `pristavenie: ${booking.pickup_custom_address}` : place(snapshot.pickup_location)}`],
              ['Odovzdanie', `${formatDateTime(booking.return_at)} · ${booking.return_custom_address ? `prevzatie: ${booking.return_custom_address}` : place(snapshot.return_location)}`],
              ['Počet dní', String(booking.days)],
              ['Cesta do zahraničia', booking.abroad_trip ? booking.abroad_countries || 'áno' : 'nie'],
              ['Poznámka zákazníka', booking.customer_note],
              ['Vytvorené', `${formatDateTime(booking.created_at)} · jazyk ${booking.locale.toUpperCase()}`],
            ]}
          />
        </Section>

        <Section title="Zákazník">
          <Rows
            rows={[
              ['Meno', <a key="n" href={`/admin/zakaznici/${booking.customer_id}`} className="text-gold hover:underline">{`${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() || 'zákazník'}</a>],
              ['E-mail', customer.email ? <a href={`mailto:${customer.email}`} className="text-gold hover:underline">{customer.email}</a> : ''],
              ['Telefón', customer.phone ? <a href={`tel:${customer.phone}`} className="text-gold hover:underline">{customer.phone}</a> : ''],
              ['Dátum narodenia', customer.date_of_birth ? formatDate(`${customer.date_of_birth}T12:00:00Z`) : ''],
              ...(customer.is_company ? ([['Firma', [customer.company_name, customer.ico ? `IČO ${customer.ico}` : null, customer.dic ? `DIČ ${customer.dic}` : null, customer.ic_dph ? `IČ DPH ${customer.ic_dph}` : null].filter(Boolean).join(' · ')]] as [string, string][]) : []),
              ['Fakturačná adresa', [address.street, [address.zip, address.city].filter(Boolean).join(' '), address.country].filter(Boolean).join(', ')],
            ]}
          />
        </Section>

        <Section title="Cena a platba" description="Hodnoty uložené v čase rezervácie – neskoršie zmeny cenníka ich nemenia.">
          <Rows
            rows={[
              ['Prenájom', booking.subtotal_cents === null ? 'individuálna cena – treba doplniť' : snapshot.ratePerDayCents ? `${booking.days} × ${formatEuro(snapshot.ratePerDayCents)} = ${formatEuro(booking.subtotal_cents)}` : `${formatEuro(booking.subtotal_cents)} (cena určená ručne)`],
              ...(booking.price_override_reason ? ([['Dôvod úpravy ceny', booking.price_override_reason]] as [string, string][]) : []),
              ...((extras ?? []).map((extra) => [
                `${(extra.name_snapshot as Name).sk ?? ''}${extra.quantity > 1 ? ` (${extra.quantity} ks)` : ''}`,
                `${formatEuro(extra.total_cents)} · ${formatEuro(extra.unit_price_cents)} ${extra.pricing_type === 'per_day' ? '/ deň' : '/ prenájom'}`,
              ]) as [string, string][]),
              ...(snapshot.pickupSurchargeCents ? ([['Príplatok za miesto vyzdvihnutia', formatEuro(snapshot.pickupSurchargeCents)]] as [string, string][]) : []),
              ...(snapshot.returnSurchargeCents ? ([['Príplatok za miesto odovzdania', formatEuro(snapshot.returnSurchargeCents)]] as [string, string][]) : []),
              ['Spolu s DPH', booking.total_cents !== null ? <strong>{formatEuro(booking.total_cents)}</strong> : 'individuálna cena'],
              ...(booking.total_cents !== null ? ([['Základ / DPH', `${formatEuro(snapshot.netCents ?? null)} / ${formatEuro(snapshot.vatCents ?? null)} (${Number(booking.vat_rate)} %)`]] as [string, string][]) : []),
              ['Platba prenájmu', PAYMENT_METHOD_LABELS[booking.rental_payment_method]],
              ['Depozit', `${formatEuro(booking.deposit_cents)} · ${PAYMENT_METHOD_LABELS[booking.deposit_payment_method]}`],
              ['Limit km', `${booking.km_limit_per_day} km / deň, nad limit ${formatEuro(booking.extra_km_cents)} / km`],
            ]}
          />
        </Section>

        <Section id="platby" title="Platby" description="Prenájom a depozit sú dve samostatné platby. Prijatie aj vrátenie sa zapíše s dátumom a menom zamestnanca.">
          <PaymentsPanel
            id={booking.id}
            bookingStatus={booking.status}
            canManage={hasRole(user.role, 'manager')}
            today={utcToZonedLocal(new Date()).slice(0, 10)}
            variableSymbol={variableSymbol(booking.number)}
            totalCents={booking.total_cents}
            depositCents={booking.deposit_cents}
            rental={{
              status: booking.rental_payment_status,
              method: booking.rental_payment_method,
              paidAt: booking.rental_paid_at,
              paidBy: booking.rental_paid_marked_by ? personName(booking.rental_paid_marked_by) : null,
              refundedCents: booking.rental_refunded_cents,
              refundedAt: booking.rental_refunded_at,
              refundMethod: booking.rental_refund_method,
              refundNote: booking.rental_refund_note,
            }}
            deposit={{
              status: booking.deposit_status,
              method: booking.deposit_payment_method,
              receivedAt: booking.deposit_received_at,
              receivedBy: booking.deposit_received_marked_by ? personName(booking.deposit_received_marked_by) : null,
              returnedCents: booking.deposit_returned_cents,
              returnedAt: booking.deposit_returned_at,
              returnMethod: booking.deposit_return_method,
              returnNote: booking.deposit_return_note,
              returnedBy: booking.deposit_returned_marked_by ? personName(booking.deposit_returned_marked_by) : null,
            }}
            settlementCents={settlement?.total_cents ?? null}
            settlementApproved={!!settlement?.approved_at}
            refundIban={customerProfile?.refund_iban ?? null}
            dates={{ rentalPaid: day(booking.rental_paid_at), rentalRefunded: day(booking.rental_refunded_at), depositReceived: day(booking.deposit_received_at), depositReturned: day(booking.deposit_returned_at) }}
          />
        </Section>

        <Section id="doklady" title="Doklady" description="Faktúry vystavuje BTW v iKros; sem sa nahrá PDF. Zákazník doklad uvidí v Mojom účte.">
          <DocumentsPanel
            bookingId={booking.id}
            canManage={hasRole(user.role, 'manager')}
            hasEmail={!!customer.email}
            today={utcToZonedLocal(new Date()).slice(0, 10)}
            documents={(documents ?? []).map((doc) => ({
              id: doc.id,
              type: doc.type,
              number: doc.number,
              amount: doc.amount_cents === null ? null : formatEuro(doc.amount_cents),
              issuedAt: doc.issued_at ? formatDate(`${doc.issued_at}T12:00:00Z`) : null,
              uploadedBy: uploaderName(doc.uploaded_by),
              emailedAt: doc.emailed_at ? formatDateTime(doc.emailed_at) : null,
            }))}
          />
        </Section>

        <Section title="Interné poznámky" description="Vidia ich len zamestnanci.">
          <BookingNoteForm id={booking.id} />
          {(notes ?? []).length > 0 ? (
            <ul className="mt-4 space-y-3 border-t border-line pt-4">
              {(notes ?? []).map((note) => (
                <li key={note.id} className="text-sm">
                  <p className="whitespace-pre-line text-white">{note.body}</p>
                  <p className="mt-1 text-xs text-muted2">
                    {personName(note.author_id)} · {formatDateTime(note.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </Section>

        <Section title="História stavov">
          <ol className="space-y-2 text-sm">
            {(history ?? []).map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-x-3 text-white">
                <span className="text-muted2">{formatDateTime(entry.created_at)}</span>
                <span>
                  {entry.from_status ? `${BOOKING_STATUS_LABELS[entry.from_status]} → ` : ''}
                  <strong>{BOOKING_STATUS_LABELS[entry.to_status]}</strong>
                </span>
                <span className="text-muted2">
                  {personName(entry.changed_by)}
                  {entry.note ? ` · ${entry.note}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </Section>

        {(consents ?? []).length > 0 ? (
        <Section title="Súhlasy">
          <Rows rows={(consents ?? []).map((consent) => [CONSENT_LABELS[consent.type] ?? consent.type, `${consent.granted ? 'udelený' : 'neudelený'} · verzia ${consent.version} · ${formatDateTime(consent.granted_at)}`])} />
        </Section>
        ) : null}

        <Section title="E-maily">
          {(emails ?? []).length === 0 ? (
            <p className="text-sm text-muted2">K rezervácii zatiaľ nie je žiadny záznam o e-maile.</p>
          ) : (
            <Rows
              rows={(emails ?? []).map((email) => [
                EMAIL_LABELS[email.type] ?? email.type,
                `${email.recipient} · ${EMAIL_STATUS[email.status] ?? email.status}${email.error === 'email_not_configured' ? ' (odosielanie nie je nastavené)' : email.error ? ` (${email.error})` : ''} · ${formatDateTime(email.created_at)}`,
              ])}
            />
          )}
        </Section>

        {canTransition(booking.status, 'cancelled') ? (
          <Section id="storno" title="Zrušenie rezervácie">
            <CancelBookingForm id={booking.id} number={booking.number} quote={quote} hasPrice={booking.total_cents !== null} />
          </Section>
        ) : null}
      </div>
    </div>
  )
}
