'use client'

import { useState } from 'react'
import { Feedback } from '@/components/admin/ui'
import { useFormAction } from '@/components/use-form-action'
import { centsToInput, formatEuro, parseEuroToCents } from '@/lib/format'
import { depositOutcome } from '@/lib/settlement'
import { saveSettlementAction } from '@/lib/settlement-actions'

export type SettlementFormValues = { km: number; fuel: number; late: number; other: number; otherLabel: string; note: string; damages: Record<string, number> }

const money =
  'h-12 w-28 rounded-lg border bg-black px-3 text-right text-base font-semibold tabular-nums text-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40 disabled:opacity-60'
const field =
  'block min-h-12 w-full rounded-lg border border-line bg-black px-3 text-base text-white placeholder:text-zinc-500 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40 disabled:opacity-60'

function Amount({ name, value, onChange, auto, label, locked }: { name: string; value: string; onChange: (v: string) => void; auto?: boolean; label: string; locked: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-white">
      <input
        name={name}
        aria-label={label}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        readOnly={locked}
        onChange={(e) => onChange(e.target.value)}
        className={`${money} ${auto ? 'border-gold/60' : 'border-zinc-600'} ${locked ? 'opacity-70' : ''}`}
      />
      €
    </span>
  )
}

/**
 * Settlement after the return protocol: system proposals (gold border) and amounts typed
 * by staff, with the running total and what happens to the deposit.
 */
export function SettlementForm({
  bookingId,
  initial,
  damages,
  explain,
  remarks,
  depositCents,
  approved,
  canEdit,
}: {
  bookingId: string
  initial: SettlementFormValues
  damages: { id: string; no: number; label: string }[]
  /** Explanations under each item, already formatted. */
  explain: { km: string; fuel: string; late: string }
  remarks: string[]
  depositCents: number
  approved: boolean
  canEdit: boolean
}) {
  const { state, pending, onSubmit } = useFormAction(saveSettlementAction, {})
  const [values, setValues] = useState(() => ({
    km: centsToInput(initial.km) || '0',
    fuel: centsToInput(initial.fuel) || '0',
    late: centsToInput(initial.late) || '0',
    other: centsToInput(initial.other) || '0',
    damages: Object.fromEntries(damages.map((d) => [d.id, centsToInput(initial.damages[d.id] ?? 0) || '0'])) as Record<string, string>,
  }))
  const locked = approved || !canEdit || pending
  const cents = (raw: string) => {
    const parsed = parseEuroToCents(raw)
    return parsed === null || Number.isNaN(parsed) ? 0 : parsed
  }
  const damageTotal = damages.reduce((sum, d) => sum + cents(values.damages[d.id] ?? ''), 0)
  const total = cents(values.km) + cents(values.fuel) + damageTotal + cents(values.late) + cents(values.other)
  const { refundCents, dueCents } = depositOutcome(depositCents, total)

  const item = 'grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 border-b border-line bg-surface px-3 py-3.5 last:border-0'
  const why = 'col-span-2 text-[13px] tabular-nums text-muted2'

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="space-y-5">
      <input type="hidden" name="bookingId" value={bookingId} />
      <div className="overflow-hidden rounded-xl border border-line">
        <div className={item}>
          <h3 className="text-[15px] font-semibold text-white">Kilometre nad limit</h3>
          <Amount locked={locked} name="km" label="Kilometre nad limit" auto value={values.km} onChange={(km) => setValues((v) => ({ ...v, km }))} />
          <p className={why}>{explain.km}</p>
        </div>
        <div className={item}>
          <h3 className="text-[15px] font-semibold text-white">Palivo</h3>
          <Amount locked={locked} name="fuel" label="Palivo" value={values.fuel} onChange={(fuel) => setValues((v) => ({ ...v, fuel }))} />
          <p className={why}>{explain.fuel}</p>
        </div>
        <div className={item}>
          <h3 className="text-[15px] font-semibold text-white">Nové poškodenia</h3>
          <strong className="pr-5 text-base tabular-nums text-white">{formatEuro(damageTotal)}</strong>
          {damages.length === 0 ? <p className={why}>Preberací protokol neobsahuje nové poškodenia.</p> : null}
          {damages.map((damage) => (
            <div key={damage.id} className="col-span-2 flex items-center justify-between gap-3 pt-1 text-sm text-white">
              <span className="min-w-0">
                <span className="mr-1.5 rounded-full border border-red-400 bg-red-500/10 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-red-300">č. {damage.no}</span>
                {damage.label}
              </span>
              <Amount
                locked={locked}
                name={`damage_${damage.id}`}
                label={`Suma za poškodenie č. ${damage.no}`}
                value={values.damages[damage.id] ?? ''}
                onChange={(next) => setValues((v) => ({ ...v, damages: { ...v.damages, [damage.id]: next } }))}
              />
            </div>
          ))}
        </div>
        <div className={item}>
          <h3 className="text-[15px] font-semibold text-white">Meškanie</h3>
          <Amount locked={locked} name="late" label="Meškanie" auto value={values.late} onChange={(late) => setValues((v) => ({ ...v, late }))} />
          <p className={why}>{explain.late}</p>
        </div>
        <div className={item}>
          <h3 className="text-[15px] font-semibold text-white">Iné</h3>
          <Amount locked={locked} name="other" label="Iné" value={values.other} onChange={(other) => setValues((v) => ({ ...v, other }))} />
          <div className="col-span-2 space-y-1.5">
            <input
              name="otherLabel"
              aria-label="Popis položky Iné"
              defaultValue={initial.otherLabel}
              maxLength={200}
              readOnly={locked}
              placeholder="napr. chýbajúca reflexná vesta, čistenie interiéru"
              className={field}
            />
            {remarks.length > 0 ? (
              <p className="text-[13px] text-muted2">
                <span className="font-semibold text-red-300">Z protokolu:</span> {remarks.join(' · ')}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="settlement-note" className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted2">
          Poznámka pre zákazníka
        </label>
        <textarea id="settlement-note" name="note" defaultValue={initial.note} maxLength={2000} readOnly={locked} placeholder="Zobrazí sa vo vyúčtovaní" className={`${field} min-h-24 py-3`} />
      </div>

      <dl className="space-y-2 rounded-xl border border-gold/50 px-3 py-3.5 text-sm tabular-nums">
        <div className="flex justify-between gap-3 text-lg font-bold">
          <dt className="text-white">Doúčtovanie spolu</dt>
          <dd className="text-gold">{formatEuro(total)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-gold/40 pt-2">
          <dt className="text-muted2">Depozit</dt>
          <dd className="font-semibold text-white">{formatEuro(depositCents)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted2">{dueCents > 0 ? 'Doplatok nad rámec depozitu' : 'Na vrátenie zákazníkovi'}</dt>
          <dd className={`font-semibold ${dueCents > 0 ? 'text-red-300' : 'text-emerald-300'}`}>{formatEuro(dueCents > 0 ? dueCents : refundCents)}</dd>
        </div>
      </dl>

      <Feedback state={state} />

      {!canEdit ? (
        <p className="text-sm text-muted2">Vyúčtovanie upravuje a potvrdzuje manažér alebo majiteľ.</p>
      ) : approved ? (
        <button type="submit" name="intent" value="reopen" disabled={pending} className="min-h-12 rounded-lg border border-gold/60 px-5 text-[15px] font-semibold text-gold disabled:opacity-50">
          Otvoriť na úpravu
        </button>
      ) : (
        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 -mx-4 flex gap-2.5 border-t border-line bg-[#111111]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:bottom-0">
          <button type="submit" name="intent" value="save" disabled={pending} className="min-h-[50px] rounded-lg border border-gold/60 px-5 text-[15px] font-semibold text-gold disabled:opacity-50">
            Uložiť návrh
          </button>
          <button
            type="submit"
            name="intent"
            value="approve"
            disabled={pending}
            className="min-h-[50px] flex-1 rounded-lg bg-gold px-5 text-[15px] font-semibold text-white transition-colors hover:bg-gold-hover disabled:opacity-50"
          >
            {pending ? 'Ukladám…' : 'Potvrdiť vyúčtovanie'}
          </button>
        </div>
      )}
    </form>
  )
}
