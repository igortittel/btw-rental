import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader, Section } from '@/components/admin/section'
import { requireStaff } from '@/lib/auth/session'
import { BOOKING_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/booking/status'
import { formatEuro } from '@/lib/format'
import type { PriceBreakdown } from '@/lib/pricing'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatDateTime } from '@/lib/time'

export const metadata: Metadata = { title: 'Rezervácia' }

type Name = { sk?: string; en?: string }
type Customer = {
  first_name?: string; last_name?: string; email?: string; phone?: string; date_of_birth?: string
  is_company?: boolean; company_name?: string | null; ico?: string | null; dic?: string | null; ic_dph?: string | null
  billing_address?: { street?: string; city?: string; zip?: string; country?: string }
}
type Snapshot = Partial<PriceBreakdown> & { pickup_location?: { name: Name; address: string }; return_location?: { name: Name; address: string } }

const CONSENT_LABELS: Record<string, string> = { terms: 'VOP', gdpr: 'Osobné údaje', marketing: 'Marketing', deposit: 'Depozit', km_limit: 'Limit km', license: 'Vodičský preukaz' }
const EMAIL_LABELS: Record<string, string> = { booking_received: 'Rezervácia prijatá (zákazník)', booking_admin_new: 'Nová rezervácia (BTW)' }
const EMAIL_STATUS: Record<string, string> = { queued: 'čaká', sent: 'odoslaný', delivered: 'doručený', bounced: 'vrátený', failed: 'neodoslaný' }

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[14rem_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted2">{label}</dt>
          <dd className="text-white">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

// Read-only detail (Phase 5). Status changes, editing and notes arrive in Phase 6.
export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireStaff('operator', `/admin/rezervacie/${id}`)
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const supabase = await createClient()
  const [{ data: booking }, { data: extras }, { data: consents }, { data: emails }] = await Promise.all([
    supabase.from('bookings').select('*, vehicles(name, license_plate, vin)').eq('id', id).maybeSingle(),
    supabase.from('booking_extras').select('*').eq('booking_id', id),
    supabase.from('consents').select('type, version, granted, granted_at').eq('booking_id', id).order('type'),
    supabase.from('email_log').select('id, type, recipient, status, error, created_at').eq('booking_id', id).order('created_at'),
  ])
  if (!booking) notFound()

  const customer = (booking.customer_snapshot ?? {}) as Customer
  const snapshot = (booking.price_snapshot ?? {}) as Snapshot
  const address = customer.billing_address ?? {}
  const place = (location?: { name: Name; address: string }) => (location ? `${location.name.sk ?? ''} (${location.address})` : '')

  return (
    <div>
      <PageHeader title={`Rezervácia ${booking.number}`} back={{ href: '/admin/rezervacie', label: 'Rezervácie' }} />
      <div className="space-y-4">
        <Section title="Rezervácia">
          <Rows
            rows={[
              ['Stav', BOOKING_STATUS_LABELS[booking.status]],
              ['Vozidlo', `${booking.vehicles?.name ?? ''}${booking.vehicles?.license_plate ? ` · ${booking.vehicles.license_plate}` : ''}`],
              ['Vyzdvihnutie', `${formatDateTime(booking.pickup_at)} · ${place(snapshot.pickup_location)}`],
              ['Odovzdanie', `${formatDateTime(booking.return_at)} · ${place(snapshot.return_location)}`],
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
              ['Meno', `${customer.first_name ?? ''} ${customer.last_name ?? ''}`],
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
              ['Prenájom', booking.subtotal_cents !== null ? `${booking.days} × ${formatEuro(snapshot.ratePerDayCents ?? null)} = ${formatEuro(booking.subtotal_cents)}` : 'individuálna cena – treba doplniť'],
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

        <Section title="Súhlasy">
          <Rows rows={(consents ?? []).map((consent) => [CONSENT_LABELS[consent.type] ?? consent.type, `${consent.granted ? 'udelený' : 'neudelený'} · verzia ${consent.version} · ${formatDateTime(consent.granted_at)}`])} />
        </Section>

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
      </div>
    </div>
  )
}
