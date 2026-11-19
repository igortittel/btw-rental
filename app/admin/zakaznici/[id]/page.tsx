import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BlacklistForm, CustomerNoteForm, DeclineDeletionForm, EraseCustomerForm, PasswordLinkForm, RefundIbanForm } from '@/components/admin/customer-forms'
import { PageHeader, Section } from '@/components/admin/section'
import { hasRole } from '@/lib/auth/roles'
import { requireStaff } from '@/lib/auth/session'
import { BOOKING_STATUS_LABELS, STATUS_BADGE_CLASS } from '@/lib/booking/status'
import { formatEuro } from '@/lib/format'
import { formatIban } from '@/lib/iban'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatDateTime } from '@/lib/time'

export const metadata: Metadata = { title: 'Zákazník' }

const CONSENT_LABELS: Record<string, string> = { terms: 'VOP', gdpr: 'Osobné údaje', marketing: 'Marketing', deposit: 'Depozit', km_limit: 'Limit km', license: 'Vodičský preukaz' }
const OPEN = ['new', 'confirmed', 'modified', 'active']

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[12rem_1fr] sm:gap-y-2">
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

/** One customer: data, bookings, consents, internal note, blacklist, password link, GDPR erasure. */
export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireStaff('operator', `/admin/zakaznici/${id}`)
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const supabase = await createClient()
  const [{ data: profile }, { data: internal }, { data: bookings }, { data: consents }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
    supabase.from('customer_internal').select('*').eq('profile_id', id).maybeSingle(),
    supabase.from('bookings').select('id, number, status, pickup_at, return_at, total_cents, vehicles(name)').eq('customer_id', id).order('pickup_at', { ascending: false }),
    supabase.from('consents').select('type, version, granted, granted_at, bookings(number)').eq('profile_id', id).order('granted_at', { ascending: false }),
  ])
  if (!profile || profile.type !== 'customer') notFound()

  const bookingIds = (bookings ?? []).map((b) => b.id)
  const { data: documents } = bookingIds.length > 0 ? await supabase.from('documents').select('booking_id').in('booking_id', bookingIds) : { data: [] }
  const docsPerBooking = (documents ?? []).reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.booking_id]: (acc[d.booking_id] ?? 0) + 1 }), {})

  const canEdit = hasRole(user.role, 'manager')
  const anonymized = !!profile.anonymized_at
  const name = `${profile.first_name} ${profile.last_name}`.trim() || 'Zákazník'
  const address = (profile.billing_address ?? {}) as { street?: string; city?: string; zip?: string; country?: string }
  const revenue = (bookings ?? []).filter((b) => ['confirmed', 'modified', 'active', 'completed'].includes(b.status)).reduce((sum, b) => sum + (b.total_cents ?? 0), 0)
  const hasOpen = (bookings ?? []).some((b) => OPEN.includes(b.status))
  const badge = 'rounded-full border px-2.5 py-0.5 text-xs font-semibold'
  // A half-finished erasure (Auth was unavailable): the sign-in account still exists.
  let authAccountLeft = false
  if (anonymized && canEdit) {
    try {
      const { data } = await createAdminClient().auth.admin.getUserById(profile.id)
      authAccountLeft = !!data.user
    } catch {
      authAccountLeft = false
    }
  }
  const deadline = profile.deletion_requested_at ? new Date(new Date(profile.deletion_requested_at).getTime() + 30 * 86_400_000) : null

  return (
    <div>
      <PageHeader title={name} back={{ href: '/admin/zakaznici', label: 'Zákazníci' }} />
      <div className="mb-4 -mt-4 flex flex-wrap gap-2">
        {anonymized ? <span className={`${badge} border-line bg-white/5 text-muted2`}>Anonymizovaný {formatDate(profile.anonymized_at!)}</span> : null}
        {profile.deletion_requested_at && !anonymized ? (
          <span className={`${badge} border-amber-400/60 bg-amber-400/10 text-amber-100`}>Žiada vymazanie od {formatDate(profile.deletion_requested_at)}</span>
        ) : null}
        {internal?.is_blacklisted ? <span className={`${badge} border-red-400/60 bg-red-500/10 text-red-200`}>Blacklist</span> : null}
        {!profile.password_set && !anonymized ? <span className={`${badge} border-line bg-white/5 text-muted2`}>Heslo zatiaľ nenastavené</span> : null}
      </div>
      {internal?.is_blacklisted && internal.blacklist_note ? (
        <p role="alert" className="mb-4 rounded-xl border border-red-400/60 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          <strong>Problémový zákazník:</strong> {internal.blacklist_note}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <Section title="Údaje">
            <Rows
              rows={[
                [
                  'E-mail',
                  profile.email ? (
                    <a key="e" href={`mailto:${profile.email}`} className="text-gold hover:underline">
                      {profile.email}
                    </a>
                  ) : (
                    ''
                  ),
                ],
                [
                  'Telefón',
                  profile.phone ? (
                    <a key="p" href={`tel:${profile.phone}`} className="text-gold hover:underline">
                      {profile.phone}
                    </a>
                  ) : (
                    ''
                  ),
                ],
                ['Dátum narodenia', profile.date_of_birth ? formatDate(`${profile.date_of_birth}T12:00:00Z`) : ''],
                ...(profile.is_company
                  ? ([
                      [
                        'Firma',
                        [profile.company_name, profile.ico ? `IČO ${profile.ico}` : null, profile.dic ? `DIČ ${profile.dic}` : null, profile.ic_dph ? `IČ DPH ${profile.ic_dph}` : null]
                          .filter(Boolean)
                          .join(' · '),
                      ],
                    ] as [string, string][])
                  : []),
                ['Fakturačná adresa', [address.street, [address.zip, address.city].filter(Boolean).join(' '), address.country].filter(Boolean).join(', ')],
                ['Účet na vrátenie', profile.refund_iban ? formatIban(profile.refund_iban) : ''],
                ['Jazyk', profile.locale === 'en' ? 'angličtina' : 'slovenčina'],
                ['Zákazníkom od', formatDate(profile.created_at)],
                ['Rezervácie / obrat', `${(bookings ?? []).length} · ${formatEuro(revenue)}`],
              ]}
            />
            {canEdit && !anonymized ? (
              <div className="mt-5 space-y-4 border-t border-line pt-4">
                <RefundIbanForm id={profile.id} iban={profile.refund_iban ? formatIban(profile.refund_iban) : ''} />
                {profile.email ? <PasswordLinkForm id={profile.id} /> : null}
              </div>
            ) : null}
          </Section>

          <Section title={`Rezervácie (${(bookings ?? []).length})`}>
            {(bookings ?? []).length === 0 ? (
              <p className="text-sm text-muted2">Žiadne rezervácie.</p>
            ) : (
              <ul className="divide-y divide-line">
                {(bookings ?? []).map((b) => (
                  <li key={b.id}>
                    <a href={`/admin/rezervacie/${b.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm text-white hover:text-gold">
                      <span>
                        <strong>{b.number}</strong> · {b.vehicles?.name}
                        <span className="block text-muted2">
                          {formatDate(b.pickup_at)} – {formatDate(b.return_at)} · {b.total_cents !== null ? formatEuro(b.total_cents) : 'individuálna cena'}
                          {docsPerBooking[b.id] ? ` · doklady: ${docsPerBooking[b.id]}` : ''}
                        </span>
                      </span>
                      <span className={`${badge} ${STATUS_BADGE_CLASS[b.status]}`}>{BOOKING_STATUS_LABELS[b.status]}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {(consents ?? []).length > 0 ? (
            <Section title="Súhlasy">
              <ul className="divide-y divide-line text-sm">
                {(consents ?? []).map((c, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-x-4 py-2">
                    <span className="text-white">{CONSENT_LABELS[c.type] ?? c.type}</span>
                    <span className="text-muted2">
                      {c.granted ? 'udelený' : 'neudelený'} · verzia {c.version} · {formatDateTime(c.granted_at)}
                      {c.bookings?.number ? ` · ${c.bookings.number}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>

        <div className="min-w-0 space-y-4">
          {!anonymized ? (
            <>
              <Section title="Interné poznámky" description="Vidia ich len zamestnanci.">
                <CustomerNoteForm id={profile.id} note={internal?.internal_note ?? ''} canEdit={canEdit} />
              </Section>
              <Section title="Blacklist" description="Upozornenie pri ďalšej rezervácii zákazníka – aj pod iným účtom s rovnakým e-mailom alebo telefónom. Rezervácia sa neblokuje.">
                <BlacklistForm id={profile.id} blacklisted={!!internal?.is_blacklisted} reason={internal?.blacklist_note ?? ''} canEdit={canEdit} />
              </Section>
            </>
          ) : null}
          <Section title="Vymazanie účtu (GDPR)">
            {anonymized ? (
              <div className="space-y-3 text-sm">
                <p className="text-white">
                  Osobné údaje boli odstránené {formatDateTime(profile.anonymized_at!)}. Rezervácie, doklady a podpísané protokoly ostávajú pre účtovníctvo (10 rokov). Záznam je v audit logu.
                </p>
                {canEdit && authAccountLeft ? (
                  <>
                    <p className="text-amber-100">Prihlasovací účet sa ešte nepodarilo zrušiť. Dokončite to:</p>
                    <EraseCustomerForm id={profile.id} name={name} hasBookings blocked={false} />
                  </>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                {profile.deletion_requested_at ? (
                  <p className="text-white">
                    Zákazník požiadal o vymazanie <strong>{formatDateTime(profile.deletion_requested_at)}</strong>. Vybaviť do <strong>{formatDate(deadline!)}</strong>.
                  </p>
                ) : (
                  <p className="text-muted2">Zákazník o vymazanie nepožiadal. Ak požiada inak (e-mailom, telefonicky), vykonajte ho tu.</p>
                )}
                {(bookings ?? []).length > 0 ? (
                  <>
                    <p className="text-white">
                      Má rezervácie, preto sa vykoná <strong>anonymizácia</strong>:
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-white">
                      <li>meno, e-mail, telefón, dátum narodenia, adresa a IBAN sa odstránia z profilu aj z údajov rezervácií</li>
                      <li>poznámky zákazníka, adresy pristavenia, interné poznámky a blacklist sa zmažú</li>
                      <li>prihlasovací účet sa zruší, súhlasy ostanú bez IP adresy</li>
                      <li>čísla rezervácií, sumy, doklady a podpísané protokoly (PDF) ostávajú – zákonná archivácia</li>
                    </ul>
                  </>
                ) : (
                  <p className="text-white">
                    Nemá žiadne rezervácie – účet sa <strong>vymaže úplne</strong>.
                  </p>
                )}
                {canEdit ? (
                  <>
                    <EraseCustomerForm id={profile.id} name={name} hasBookings={(bookings ?? []).length > 0} blocked={hasOpen} />
                    {profile.deletion_requested_at ? <DeclineDeletionForm id={profile.id} /> : null}
                  </>
                ) : (
                  <p className="text-muted2">Vykonať ho môže manažér alebo majiteľ.</p>
                )}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}
