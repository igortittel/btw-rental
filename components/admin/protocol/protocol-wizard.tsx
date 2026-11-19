'use client'

import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { RecordPaymentForm } from '@/components/admin/payments-panel'
import { CarDiagram } from '@/components/admin/protocol/car-diagram'
import { SignaturePad, type SignaturePadHandle } from '@/components/admin/protocol/signature-pad'
import { DateField } from '@/components/ui/date-field'
import { saveProtocolDraftAction, signProtocolAction } from '@/lib/protocol/actions'
import {
  CLEANLINESS, CLEANLINESS_LABEL, DAMAGE_KIND_LABEL, DAMAGE_KINDS, DAMAGE_VIEW_LABEL, DAMAGE_VIEWS, PHOTO_ANGLE_LABEL, PHOTO_ANGLES, PROTOCOL_TITLE,
  eighthsToPercent, fuelLabel, percentToEighths, protocolMissing, usesCharge, usesFuel,
  type Accessory, type Cleanliness, type DamageView, type DraftDamage, type DraftPhoto, type PhotoAngle, type ProtocolDraft, type ProtocolType,
} from '@/lib/protocol/model'
import { formatDuration } from '@/lib/settlement'
import { createClient } from '@/lib/supabase/client'
import { zonedLocalToUtc } from '@/lib/time'

export type WizardBooking = {
  id: string
  number: string
  vehicleName: string
  plate: string | null
  customerName: string
  term: string
  place: string
  days: number
  kmLimitPerDay: number
  /** ISO instant of the booked return. */
  plannedReturnAt: string
  toleranceMinutes: number
  /** Pickup only: payments still to be recorded before signing (Settings: require_payment_before_pickup). */
  unpaid?: { kind: 'rental' | 'deposit'; label: string; method: 'transfer' | 'terminal' | 'cash' }[]
  /** YYYY-MM-DD in Bratislava, default date of a recorded payment. */
  today?: string
}
/** The valid pickup protocol, shown for comparison while filling in the return protocol. */
export type WizardReference = {
  handoverAt: string
  odometerKm: number | null
  fuelLevel: number | null
  chargeLevel: number | null
  interior: Cleanliness
  exterior: Cleanliness
  accessories: Accessory[]
  damages: DraftDamage[]
  photos: DraftPhoto[]
}

const STEPS = ['Vozidlo a stav', 'Príslušenstvo', 'Poškodenia', 'Fotky', 'Podpisy']
const BUCKET = 'protocol-media'
const km = (value: number) => new Intl.NumberFormat('sk-SK').format(value)

const label = 'text-[11px] font-semibold uppercase tracking-[0.1em] text-muted2'
const input = 'block min-h-12 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-base text-white placeholder:text-zinc-500 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40'
const hint = 'text-[13px] text-muted2'
const chip = (on: boolean) => `min-h-12 rounded-lg border px-2 text-[13px] font-semibold transition-colors ${on ? 'border-gold bg-gold/15 text-white' : 'border-line bg-surface text-muted2'}`

/** Downscales a camera photo and re-encodes it as JPEG (the PDF renderer reads JPEG and PNG only). */
async function compressPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72))
  if (!blob) throw new Error('encode failed')
  return blob
}

function Toggle({ on, onChange, label: aria }: { on: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={aria} onClick={() => onChange(!on)} className={`relative h-8 w-[52px] shrink-0 rounded-full border transition-colors ${on ? 'border-gold bg-gold' : 'border-zinc-600 bg-black'}`}>
      <span className={`absolute left-[3px] top-[3px] h-6 w-6 rounded-full transition-transform ${on ? 'translate-x-5 bg-white' : 'bg-zinc-400'}`} />
    </button>
  )
}

function Field({ id, title, children, note }: { id?: string; title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className={`block ${label}`}>{title}</label>
      {children}
      {note ? <p className={`${hint} tabular-nums`}>{note}</p> : null}
    </div>
  )
}

export function ProtocolWizard({
  protocolId, type, version, booking, fuel, initial, initialUrls, reference,
}: {
  protocolId: string
  type: ProtocolType
  version: number
  booking: WizardBooking
  /** Fuel type of the vehicle: decides between the fuel gauge and the battery charge. */
  fuel: string
  initial: ProtocolDraft
  /** Signed URLs of the files already stored (draft and reference). */
  initialUrls: Record<string, string>
  reference: WizardReference | null
}) {
  const isReturn = type === 'return'
  const [draft, setDraft] = useState(initial)
  const [step, setStep] = useState(0)
  const [view, setView] = useState<DamageView>('left')
  const [selected, setSelected] = useState<string | null>(null)
  const [showReference, setShowReference] = useState(true)
  const [urls, setUrls] = useState(initialUrls)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [signed, setSigned] = useState({ customer: false, staff: false })
  const customerPad = useRef<SignaturePadHandle>(null)
  const staffPad = useRef<SignaturePadHandle>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const fileTarget = useRef<{ kind: 'angle'; angle: PhotoAngle; replace?: string } | { kind: 'damage'; id: string } | null>(null)
  const top = useRef<HTMLDivElement>(null)

  // ── saving: debounced, serialised, always the latest draft ──
  const latest = useRef(draft)
  useLayoutEffect(() => {
    latest.current = draft
  })
  const dirty = useRef(false)
  const chain = useRef<Promise<void>>(Promise.resolve())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    chain.current = chain.current.then(async () => {
      if (!dirty.current) return
      dirty.current = false
      setSaveState('saving')
      const result = await saveProtocolDraftAction(protocolId, latest.current).catch(() => ({ error: 'Uloženie sa nepodarilo. Skontrolujte pripojenie.' }))
      if ('error' in result && result.error) {
        dirty.current = true
        setSaveState('error')
        setError(result.error)
      } else {
        setSaveState('saved')
        setError(null)
      }
    })
    return chain.current
  }, [protocolId])
  const update = useCallback(
    (change: (current: ProtocolDraft) => ProtocolDraft, immediately = false) => {
      setDraft(change)
      dirty.current = true
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, immediately ? 50 : 1500)
    },
    [flush],
  )
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  // Leaving the page with unsaved changes: ask the browser to warn.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const goTo = (next: number) => {
    setStep(Math.max(0, Math.min(STEPS.length - 1, next)))
    setSelected(null)
    // The signature pads live on the last step only; leaving it discards what was drawn.
    setSigned({ customer: false, staff: false })
    void flush()
    top.current?.scrollIntoView({ block: 'start' })
  }

  // ── derived ──
  const numbered = useMemo(() => {
    const referenceDamages = reference?.damages ?? []
    const all = [...referenceDamages.map((d) => ({ ...d, isNew: false, own: false })), ...draft.damages.map((d) => ({ ...d, isNew: isReturn, own: true }))]
    return all.map((d, index) => ({ ...d, no: index + 1 }))
  }, [reference?.damages, draft.damages, isReturn])
  const selectedDamage = numbered.find((d) => d.id === selected) ?? null
  const missing = protocolMissing(draft, { fuel, pickupOdometerKm: reference?.odometerKm, customerSigned: signed.customer, staffSigned: signed.staff, unpaid: (booking.unpaid ?? []).map((u) => u.kind) })
  const kmAllowed = booking.kmLimitPerDay * booking.days
  const driven = reference?.odometerKm != null && draft.odometerKm !== null ? draft.odometerKm - reference.odometerKm : null
  const handover = zonedLocalToUtc(draft.handoverAt)
  const lateMinutes = isReturn && handover ? Math.round((handover.getTime() - new Date(booking.plannedReturnAt).getTime()) / 60000) : 0
  const [datePart, timePart] = draft.handoverAt.split('T')

  // ── files ──
  const pickFile = (target: NonNullable<typeof fileTarget.current>) => {
    fileTarget.current = target
    fileInput.current?.click()
  }
  const onFile = async (file: File | undefined) => {
    const target = fileTarget.current
    if (!file || !target) return
    setBusy(target.kind === 'angle' ? target.angle : target.id)
    setError(null)
    try {
      const blob = await compressPhoto(file)
      const path = `${booking.id}/${protocolId}/${crypto.randomUUID()}.jpg`
      const supabase = createClient()
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
      if (uploadError) throw uploadError
      setUrls((current) => ({ ...current, [path]: URL.createObjectURL(blob) }))
      if (target.kind === 'angle') {
        update((d) => ({ ...d, photos: [...d.photos.filter((p) => p.path !== target.replace), { angle: target.angle, path }] }), true)
      } else {
        update((d) => ({ ...d, damages: d.damages.map((damage) => (damage.id === target.id ? { ...damage, photoPath: path } : damage)) }), true)
      }
    } catch {
      setError('Fotku sa nepodarilo nahrať. Skontrolujte pripojenie a skúste to znova.')
    } finally {
      setBusy(null)
    }
  }

  const sign = async () => {
    if (missing.length > 0 || busy) return
    setBusy('sign')
    setError(null)
    try {
      await flush()
      const supabase = createClient()
      const upload = async (pad: SignaturePadHandle | null, who: string) => {
        const blob = await pad?.toBlob()
        if (!blob) throw new Error('signature')
        const path = `${booking.id}/${protocolId}/podpis-${who}-${crypto.randomUUID()}.png`
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/png' })
        if (uploadError) throw uploadError
        return path
      }
      const [customer, staff] = await Promise.all([upload(customerPad.current, 'zakaznik'), upload(staffPad.current, 'zamestnanec')])
      const result = await signProtocolAction(protocolId, latest.current, { customer, staff })
      if (result.error) {
        setError(result.error)
      } else if (result.redirectTo) {
        dirty.current = false
        window.location.assign(result.redirectTo)
        return
      }
    } catch {
      setError('Protokol sa nepodarilo podpísať. Skontrolujte pripojenie a skúste to znova.')
    }
    setBusy(null)
  }

  // ── steps ──
  let body: ReactNode = null
  if (step === 0) {
    const fuelEighths = percentToEighths(draft.fuelLevel)
    const refEighths = percentToEighths(reference?.fuelLevel)
    body = (
      <>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            id="protocol-date"
            title={`Dátum a čas ${isReturn ? 'prevzatia' : 'odovzdania'}`}
            note={isReturn ? (
              <>
                Plánované vrátenie {booking.term.split(' – ')[1]}
                {lateMinutes > 0 ? <span className={lateMinutes > booking.toleranceMinutes ? 'font-semibold text-red-300' : ''}> · meškanie {formatDuration(lateMinutes)}</span> : null}
              </>
            ) : undefined}
          >
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <DateField id="protocol-date" value={datePart} onChange={(e) => e.target.value && update((d) => ({ ...d, handoverAt: `${e.target.value}T${timePart}` }))} className={input} />
              <input type="time" aria-label="Čas" value={timePart} onChange={(e) => e.target.value && update((d) => ({ ...d, handoverAt: `${datePart}T${e.target.value}` }))} className={`${input} appearance-none [color-scheme:dark]`} />
            </div>
          </Field>
          <Field
            id="protocol-km"
            title="Stav tachometra (km)"
            note={
              reference?.odometerKm != null ? (
                <>
                  Pri odovzdaní <strong className="text-white">{km(reference.odometerKm)} km</strong>
                  {driven !== null ? (
                    <>
                      {' '}· najazdené <strong className="text-white">{km(driven)} km</strong> · limit {km(kmAllowed)} km ·{' '}
                      {driven < 0 ? <span className="font-semibold text-red-300">menej ako pri odovzdaní</span> : driven > kmAllowed ? <span className="font-semibold text-red-300">nad limit {km(driven - kmAllowed)} km</span> : <span className="font-semibold text-emerald-300">v limite</span>}
                    </>
                  ) : null}
                </>
              ) : (
                `Limit: ${booking.kmLimitPerDay} km / deň · ${km(kmAllowed)} km na ${booking.days} ${booking.days === 1 ? 'deň' : booking.days < 5 ? 'dni' : 'dní'}`
              )
            }
          >
            <input
              id="protocol-km"
              inputMode="numeric"
              autoComplete="off"
              value={draft.odometerKm ?? ''}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 7)
                update((d) => ({ ...d, odometerKm: digits === '' ? null : Number(digits) }))
              }}
              className={`${input} text-2xl font-semibold tabular-nums`}
            />
          </Field>
        </div>

        {usesFuel(fuel) ? (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className={label}>Stav paliva</span>
              <strong className="text-sm text-white">{fuelLabel(draft.fuelLevel)}</strong>
            </div>
            <div className="grid grid-cols-8 gap-1" role="group" aria-label="Stav paliva v osminách">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
                const on = fuelEighths !== null && i <= fuelEighths
                const wasHere = isReturn && refEighths !== null && i <= refEighths && !on
                return (
                  <button
                    key={i}
                    type="button"
                    aria-label={`${i}/8`}
                    aria-pressed={on}
                    onClick={() => update((d) => ({ ...d, fuelLevel: eighthsToPercent(fuelEighths === i ? i - 1 : i) }))}
                    className={`h-12 rounded-md border ${on ? 'border-gold bg-gold' : 'border-line bg-surface'} ${wasHere ? 'shadow-[inset_0_-4px_0_#666]' : ''}`}
                  />
                )
              })}
            </div>
            <div className="flex justify-between text-xs text-muted2">
              <span>prázdna</span>
              {isReturn && reference?.fuelLevel != null ? (
                <span>
                  Pri odovzdaní <strong className="text-white">{fuelLabel(reference.fuelLevel)}</strong>
                  {fuelEighths !== null && refEighths !== null ? (
                    fuelEighths < refEighths ? <span className="font-semibold text-red-300"> · chýba {refEighths - fuelEighths}/8</span> : <span className="font-semibold text-emerald-300"> · bez rozdielu</span>
                  ) : null}
                </span>
              ) : null}
              <span>plná</span>
            </div>
          </div>
        ) : null}

        {usesCharge(fuel) ? (
          <Field id="protocol-charge" title="Nabitie batérie (%)" note={isReturn && reference?.chargeLevel != null ? `Pri odovzdaní ${reference.chargeLevel} %` : undefined}>
            <div className="flex items-center gap-4">
              <input id="protocol-charge" type="range" min={0} max={100} step={5} value={draft.chargeLevel ?? 0} onChange={(e) => update((d) => ({ ...d, chargeLevel: Number(e.target.value) }))} className="h-12 w-full accent-[#B88746]" />
              <strong className="w-14 text-right text-lg tabular-nums text-white">{draft.chargeLevel === null ? '—' : `${draft.chargeLevel} %`}</strong>
            </div>
          </Field>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          {(['interior', 'exterior'] as const).map((part) => (
            <div key={part} className="space-y-1.5">
              <span className={label}>Čistota {part === 'interior' ? 'interiéru' : 'exteriéru'}</span>
              <div className="grid grid-cols-3 gap-1.5">
                {CLEANLINESS.map((option) => (
                  <button key={option.key} type="button" aria-pressed={draft[part] === option.key} onClick={() => update((d) => ({ ...d, [part]: option.key }))} className={chip(draft[part] === option.key)}>
                    {option.label}
                  </button>
                ))}
              </div>
              {reference ? <p className={hint}>Pri odovzdaní: <strong className="text-white">{CLEANLINESS_LABEL[reference[part]]}</strong></p> : null}
            </div>
          ))}
        </div>

        {!isReturn ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="protocol-license" title="Číslo vodičského preukazu" note="Voliteľné, uvedie sa v protokole.">
              <input id="protocol-license" value={draft.driverLicenseNo} maxLength={60} autoComplete="off" onChange={(e) => update((d) => ({ ...d, driverLicenseNo: e.target.value }))} className={input} />
            </Field>
            <Field id="protocol-document" title="Číslo OP / pasu" note="Voliteľné.">
              <input id="protocol-document" value={draft.idDocumentNo} maxLength={60} autoComplete="off" onChange={(e) => update((d) => ({ ...d, idDocumentNo: e.target.value }))} className={input} />
            </Field>
          </div>
        ) : null}
      </>
    )
  } else if (step === 1) {
    const setItem = (key: string, change: Partial<Accessory>) => update((d) => ({ ...d, accessories: d.accessories.map((item) => (item.key === key ? { ...item, ...change } : item)) }))
    body = (
      <>
        <p className={hint}>{isReturn ? 'Vypnite, čo zákazník nevrátil. Chýbajúce položky sa zvýraznia a uvidíte ich vo vyúčtovaní.' : 'Všetko je predvolene označené. Vypnite, čo sa s vozidlom neodovzdáva.'}</p>
        {draft.accessories.length === 0 ? <p className={hint}>Pri odovzdaní nebolo zaznamenané žiadne príslušenstvo.</p> : null}
        <ul className="overflow-hidden rounded-xl border border-line">
          {draft.accessories.map((item) => {
            const before = reference?.accessories.find((r) => r.key === item.key)
            const short = isReturn && (!item.present || (before?.quantity !== undefined && (item.quantity ?? 0) < before.quantity))
            return (
              <li key={item.key} className={`flex min-h-14 items-center gap-3 border-b border-line px-3 py-2 last:border-0 ${short ? 'bg-red-500/10' : 'bg-surface'}`}>
                <div className="min-w-0 flex-1 text-[15px] text-white">
                  {item.label}
                  {item.hint ? <span className="block text-xs text-muted2">{item.hint}</span> : null}
                  {short ? <span className="block text-xs font-semibold text-red-300">{before?.quantity !== undefined ? `odovzdané ${before.quantity} ks, vrátené ${item.present ? (item.quantity ?? 0) : 0}` : 'odovzdané, nevrátené'}</span> : null}
                </div>
                {item.quantity !== undefined ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" aria-label={`${item.label}: menej`} onClick={() => setItem(item.key, { quantity: Math.max(0, (item.quantity ?? 0) - 1), present: (item.quantity ?? 0) - 1 > 0 })} className="h-10 w-10 rounded-lg border border-zinc-600 bg-black text-lg text-white">−</button>
                    <strong className="w-5 text-center tabular-nums text-white">{item.quantity}</strong>
                    <button type="button" aria-label={`${item.label}: viac`} onClick={() => setItem(item.key, { quantity: Math.min(before?.quantity ?? 9, (item.quantity ?? 0) + 1), present: true })} className="h-10 w-10 rounded-lg border border-zinc-600 bg-black text-lg text-white">+</button>
                  </div>
                ) : (
                  <Toggle on={item.present} onChange={(present) => setItem(item.key, { present })} label={item.label} />
                )}
              </li>
            )
          })}
        </ul>
      </>
    )
  } else if (step === 2) {
    const visible = numbered.filter((d) => d.view === view && (d.own || showReference))
    const count = (key: DamageView) => numbered.filter((d) => d.view === key).length
    const setDamage = (id: string, change: Partial<DraftDamage>) => update((d) => ({ ...d, damages: d.damages.map((damage) => (damage.id === id ? { ...damage, ...change } : damage)) }))
    body = (
      <>
        <p className={hint}>
          Ťuknite na miesto na schéme a pridajte značku.
          {isReturn && reference ? <> Sivé značky sú z odovzdávacieho protokolu, <strong className="text-red-300">červené sú nové</strong>.</> : null}
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {DAMAGE_VIEWS.map((option) => (
            <button key={option.key} type="button" aria-pressed={view === option.key} onClick={() => { setView(option.key); setSelected(null) }} className={`shrink-0 rounded-lg border px-3 py-2.5 text-[13px] font-semibold ${view === option.key ? 'border-gold text-white' : 'border-line text-muted2'}`}>
              {option.label}
              {count(option.key) ? <span className="ml-1.5 text-gold">{count(option.key)}</span> : null}
            </button>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-[1.25fr_1fr] md:items-start">
          <div className="space-y-3">
            <div
              className="relative cursor-crosshair touch-manipulation rounded-xl border border-line bg-surface text-zinc-400"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('button')) return
                const rect = event.currentTarget.getBoundingClientRect()
                const id = crypto.randomUUID()
                const x = Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10
                const y = Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10
                update((d) => ({ ...d, damages: [...d.damages, { id, view, x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)), kind: 'scratch', description: '', photoPath: null }] }))
                setSelected(id)
              }}
            >
              <CarDiagram view={view} className="block h-auto w-full" />
              {visible.map((damage) => (
                <button
                  key={damage.id}
                  type="button"
                  aria-label={`Poškodenie ${damage.no}`}
                  onClick={() => setSelected(damage.id)}
                  style={{ left: `${damage.x}%`, top: `${damage.y}%` }}
                  className={`absolute grid h-[30px] w-[30px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-[13px] font-bold ${damage.isNew ? 'border-red-500 bg-red-500 text-white shadow-[0_0_0_5px_rgba(239,68,68,0.2)]' : 'border-zinc-400 bg-[#111] text-white'} ${selected === damage.id ? 'outline outline-2 outline-offset-[3px] outline-gold' : ''}`}
                >
                  {damage.no}
                </button>
              ))}
            </div>
            {isReturn && reference ? (
              <div className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-surface px-3">
                <span className="flex-1 text-[15px] text-white">Zobraziť stav pri odovzdaní</span>
                <Toggle on={showReference} onChange={setShowReference} label="Zobraziť stav pri odovzdaní" />
              </div>
            ) : null}
            {selectedDamage ? (
              <div className="space-y-3 rounded-xl border border-gold/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-[15px] text-white">Poškodenie č. {selectedDamage.no} · {DAMAGE_VIEW_LABEL[selectedDamage.view]}</strong>
                  {selectedDamage.isNew ? <NewBadge /> : null}
                </div>
                {selectedDamage.own ? (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {DAMAGE_KINDS.map((kind) => (
                        <button key={kind.key} type="button" aria-pressed={selectedDamage.kind === kind.key} onClick={() => setDamage(selectedDamage.id, { kind: kind.key })} className={`rounded-full border px-3 py-2 text-[13px] font-semibold ${selectedDamage.kind === kind.key ? 'border-gold bg-gold/15 text-white' : 'border-line bg-surface text-muted2'}`}>
                          {kind.label}
                        </button>
                      ))}
                    </div>
                    <Field id="damage-description" title="Popis">
                      <input id="damage-description" value={selectedDamage.description} maxLength={500} placeholder="napr. zadné dvere, cca 8 cm" onChange={(e) => setDamage(selectedDamage.id, { description: e.target.value })} className={input} />
                    </Field>
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedDamage.photoPath && urls[selectedDamage.photoPath] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={urls[selectedDamage.photoPath]} alt="" className="h-12 w-16 rounded-md object-cover" />
                      ) : null}
                      <button type="button" disabled={!!busy} onClick={() => pickFile({ kind: 'damage', id: selectedDamage.id })} className="min-h-11 rounded-lg border border-gold/60 px-3 text-[13px] font-semibold text-gold disabled:opacity-50">
                        {busy === selectedDamage.id ? 'Nahrávam…' : selectedDamage.photoPath ? 'Odfotiť znova' : 'Odfotiť detail'}
                      </button>
                      <button type="button" onClick={() => { update((d) => ({ ...d, damages: d.damages.filter((damage) => damage.id !== selectedDamage.id) })); setSelected(null) }} className="min-h-11 rounded-lg border border-red-400/60 px-3 text-[13px] font-semibold text-red-200">
                        Odstrániť značku
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted2">
                    {DAMAGE_KIND_LABEL[selectedDamage.kind]}
                    {selectedDamage.description ? ` · ${selectedDamage.description}` : ''} · zaznamenané pri odovzdaní, nedá sa meniť.
                    {selectedDamage.photoPath && urls[selectedDamage.photoPath] ? (
                      <>
                        {' '}
                        <a href={urls[selectedDamage.photoPath]} target="_blank" rel="noopener" className="text-gold underline underline-offset-4">Fotka</a>
                      </>
                    ) : null}
                  </p>
                )}
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <span className={label}>Zoznam ({numbered.length})</span>
            <ul className="overflow-hidden rounded-xl border border-line">
              {numbered.length === 0 ? <li className="bg-surface px-3 py-4 text-sm text-muted2">Bez poškodení</li> : null}
              {numbered.map((damage) => (
                <li key={damage.id} className="border-b border-line last:border-0">
                  <button type="button" onClick={() => { setView(damage.view); setSelected(damage.id) }} className="flex w-full items-center gap-2.5 bg-surface px-3 py-2.5 text-left">
                    <span className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border-2 text-xs font-bold text-white ${damage.isNew ? 'border-red-500 bg-red-500' : 'border-zinc-400'}`}>{damage.no}</span>
                    <span className="min-w-0 flex-1 text-sm text-white">
                      {DAMAGE_KIND_LABEL[damage.kind]}
                      {damage.description ? ` · ${damage.description}` : damage.own ? <span className="text-red-300"> · chýba popis</span> : ''}
                      <span className="block text-xs text-muted2">
                        {DAMAGE_VIEW_LABEL[damage.view]}
                        {!damage.own ? ' · z odovzdávacieho protokolu' : ''}
                      </span>
                    </span>
                    {damage.isNew ? <NewBadge /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </>
    )
  } else if (step === 3) {
    const done = PHOTO_ANGLES.filter((angle) => angle.required && draft.photos.some((p) => p.angle === angle.key)).length
    const tiles: { angle: PhotoAngle; photo: DraftPhoto | null; required: boolean }[] = [
      ...PHOTO_ANGLES.filter((angle) => angle.key !== 'other').map((angle) => ({ angle: angle.key, photo: draft.photos.find((p) => p.angle === angle.key) ?? null, required: angle.required })),
      ...draft.photos.filter((p) => p.angle === 'other').map((photo) => ({ angle: 'other' as const, photo, required: false })),
      { angle: 'other', photo: null, required: false },
    ]
    body = (
      <>
        <p className={hint}>Povinné sú štyri uhly ({done}/4). Ťuknutím sa otvorí fotoaparát; fotka sa pred nahratím zmenší.</p>
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {tiles.map((tile, index) => {
            const before = reference?.photos.find((p) => p.angle === tile.angle && tile.angle !== 'other')
            const src = tile.photo ? urls[tile.photo.path] : null
            return (
              <li key={tile.photo?.path ?? `${tile.angle}-${index}`} className="space-y-1">
                <div className={`relative aspect-[4/3] overflow-hidden rounded-xl border bg-surface ${tile.photo ? 'border-line' : tile.required ? 'border-dashed border-gold/60' : 'border-dashed border-zinc-600'}`}>
                  <button type="button" disabled={!!busy} onClick={() => pickFile({ kind: 'angle', angle: tile.angle, replace: tile.photo?.path })} className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted2">
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt={PHOTO_ANGLE_LABEL[tile.angle]} className="absolute inset-0 h-full w-full object-cover" />
                    ) : busy === tile.angle && !tile.photo ? (
                      <span className="text-white">Nahrávam…</span>
                    ) : (
                      <>
                        <span className="text-2xl leading-none text-gold" aria-hidden>＋</span>
                        <strong className="text-[13px] text-white">{tile.angle === 'other' ? 'Ďalšia fotka' : PHOTO_ANGLE_LABEL[tile.angle]}</strong>
                        <span>{tile.required ? 'povinná' : 'voliteľná'}</span>
                      </>
                    )}
                    {tile.photo ? <span className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 text-left text-[11px] font-semibold text-white">{PHOTO_ANGLE_LABEL[tile.angle]} · odfotiť znova</span> : null}
                  </button>
                  {tile.photo ? (
                    <button type="button" aria-label={`Odstrániť fotku: ${PHOTO_ANGLE_LABEL[tile.angle]}`} onClick={() => update((d) => ({ ...d, photos: d.photos.filter((p) => p.path !== tile.photo!.path) }), true)} className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-full bg-black/70 text-lg text-white">
                      ×
                    </button>
                  ) : null}
                </div>
                {before && urls[before.path] ? (
                  <a href={urls[before.path]} target="_blank" rel="noopener" className="block text-xs text-gold underline underline-offset-4">Fotka pri odovzdaní</a>
                ) : null}
              </li>
            )
          })}
        </ul>
      </>
    )
  } else {
    const newCount = numbered.filter((d) => d.isNew).length
    body = (
      <>
        <dl className="overflow-hidden rounded-xl border border-line text-sm">
          {(
            [
              ['Tachometer', draft.odometerKm === null ? '—' : `${km(draft.odometerKm)} km${driven !== null ? ` · najazdené ${km(driven)} km` : ''}`],
              ...(usesFuel(fuel) ? [['Palivo', fuelLabel(draft.fuelLevel)]] : []),
              ...(usesCharge(fuel) ? [['Nabitie', draft.chargeLevel === null ? '—' : `${draft.chargeLevel} %`]] : []),
              ['Čistota', `int. ${CLEANLINESS_LABEL[draft.interior].toLowerCase()} · ext. ${CLEANLINESS_LABEL[draft.exterior].toLowerCase()}`],
              ['Poškodenia', `${numbered.length}${isReturn ? ` · z toho nové ${newCount}` : ''}`],
              ['Fotky', String(draft.photos.length)],
            ] as [string, string][]
          ).map(([name, value]) => (
            <div key={name} className="flex justify-between gap-3 border-b border-line px-3 py-2.5 last:border-0">
              <dt className="text-muted2">{name}</dt>
              <dd className="text-right font-semibold text-white">{value}</dd>
            </div>
          ))}
        </dl>
        <Field id="protocol-note" title="Poznámka">
          <textarea id="protocol-note" value={draft.note} maxLength={4000} placeholder="Voliteľné" onChange={(e) => update((d) => ({ ...d, note: e.target.value }))} className={`${input} min-h-24 py-3`} />
        </Field>
        <p className={hint}>
          Zákazník podpisom potvrdzuje, že vozidlo {isReturn ? 'vrátil' : 'prevzal'} v stave uvedenom v tomto protokole. Pred podpisom mu ukážte zoznam poškodení.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              ['customer', 'Zákazník', customerPad, 'customerName'],
              ['staff', 'Zamestnanec BTW', staffPad, 'staffName'],
            ] as const
          ).map(([who, title, pad, nameKey]) => (
            <div key={who} className="min-w-0 space-y-3 rounded-xl border border-line bg-surface p-3">
              <div className="flex items-center justify-between">
                <span className={label}>{title}</span>
                <button type="button" onClick={() => pad.current?.clear()} className="min-h-9 text-[13px] font-semibold text-gold underline underline-offset-4">Vymazať</button>
              </div>
              <SignaturePad ref={pad} label={`Podpis: ${title}`} onChange={(value) => setSigned((current) => (current[who] === value ? current : { ...current, [who]: value }))} />
              <Field id={`protocol-${who}-name`} title="Meno podpisujúceho">
                <input id={`protocol-${who}-name`} value={draft[nameKey]} maxLength={200} onChange={(e) => update((d) => ({ ...d, [nameKey]: e.target.value }))} className={input} />
              </Field>
            </div>
          ))}
        </div>
        {(booking.unpaid ?? []).length > 0 ? (
          <div className="space-y-3 rounded-xl border border-amber-400/70 bg-amber-400/10 p-3">
            <p className="text-sm text-white">
              <strong>Pred odovzdaním treba zaznamenať platby.</strong> Ak zákazník platí teraz (terminál, hotovosť), zaznamenajte to tu.
            </p>
            {(booking.unpaid ?? []).map((u) => (
              <div key={u.kind} className="space-y-2 border-t border-amber-400/30 pt-3">
                <p className="text-sm font-semibold text-white">{u.label}</p>
                <RecordPaymentForm id={booking.id} kind={u.kind} method={u.method} today={booking.today ?? ''} />
              </div>
            ))}
          </div>
        ) : null}
        {missing.length > 0 ? (
          <div className="rounded-xl border border-red-400/70 bg-red-500/10 px-3 py-2.5 text-sm text-white">
            <strong>Pred uzavretím ešte chýba:</strong>
            <ul className="mt-1 list-disc pl-5">
              {missing.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ) : (
          <p className={hint}>Všetko je vyplnené. Po uzavretí sa protokol uzamkne, vytvorí sa PDF a zákazník ho dostane e-mailom.</p>
        )}
      </>
    )
  }

  const last = step === STEPS.length - 1
  return (
    <div ref={top} className="scroll-mt-20">
      <div className="mb-4 rounded-xl border border-gold/50 px-4 py-3">
        <p className="flex items-center justify-between gap-3 text-[11px] font-semibold tracking-[0.12em] text-gold">
          <span>{booking.number} · {PROTOCOL_TITLE[type].toUpperCase()}{version > 1 ? ` · VERZIA ${version}` : ''}</span>
          <span className="font-normal normal-case tracking-normal text-muted2" role="status">{saveState === 'saving' ? 'Ukladám…' : saveState === 'saved' ? 'Uložené' : saveState === 'error' ? 'Neuložené' : ''}</span>
        </p>
        <p className="mt-0.5 text-[17px] font-semibold text-white">
          {booking.vehicleName} {booking.plate ? <span className="ml-1 rounded border border-zinc-600 px-1.5 text-xs tracking-wider">{booking.plate}</span> : null}
        </p>
        <p className="text-[13px] text-muted2">{booking.customerName} · {booking.term}</p>
        <p className="text-[13px] text-muted2">{booking.place}</p>
      </div>

      <ol className="mb-5 flex gap-1">
        {STEPS.map((name, index) => (
          <li key={name} className="min-w-0 flex-1">
            <button type="button" onClick={() => goTo(index)} aria-current={index === step ? 'step' : undefined} className="block w-full text-left">
              <span className={`block h-[3px] rounded-full ${index === step ? 'bg-gold' : index < step ? 'bg-gold/50' : 'bg-line'}`} />
              <span className={`mt-1.5 block truncate text-[11px] font-semibold ${index === step ? 'text-white' : 'text-muted2'} ${index === step ? '' : 'max-md:sr-only'}`}>{index + 1}. {name}</span>
            </button>
          </li>
        ))}
      </ol>

      <h2 className="mb-3 text-lg font-semibold text-white">{step === 4 ? 'Kontrola a podpisy' : STEPS[step]}</h2>
      <div className="space-y-5">{body}</div>

      {error ? <p role="alert" className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 -mx-4 mt-6 flex gap-2.5 border-t border-line bg-[#111111]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:bottom-0">
        {step > 0 ? (
          <button type="button" onClick={() => goTo(step - 1)} className="min-h-[50px] rounded-lg border border-gold/60 px-5 text-[15px] font-semibold text-gold">Späť</button>
        ) : null}
        {last ? (
          <button type="button" onClick={sign} disabled={missing.length > 0 || !!busy} className="min-h-[50px] flex-1 rounded-lg bg-gold px-5 text-[15px] font-semibold text-white transition-colors hover:bg-gold-hover disabled:opacity-45">
            {busy === 'sign' ? 'Podpisujem a vytváram PDF…' : 'Podpísať a uzavrieť'}
          </button>
        ) : (
          <button type="button" onClick={() => goTo(step + 1)} className="min-h-[50px] flex-1 rounded-lg bg-gold px-5 text-[15px] font-semibold text-white transition-colors hover:bg-gold-hover">
            Ďalej · {STEPS[step + 1]}
          </button>
        )}
      </div>

      <input ref={fileInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
    </div>
  )
}

function NewBadge() {
  return <span className="shrink-0 rounded-full border border-red-400 bg-red-500/10 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-red-300">Nové</span>
}
