'use client'

import { useState, type ReactNode } from 'react'
import { recordPaymentAction, refundRentalAction, returnDepositAction, undoPaymentAction } from '@/app/admin/rezervacie/payment-actions'
import { ActionForm, Field, SubmitButton, selectClass } from '@/components/admin/ui'
import { DateField, SELECT_CHEVRON_STYLE } from '@/components/ui/date-field'
import { Label } from '@/components/ui/label'
import { centsToInput, formatEuro } from '@/lib/format'
import {
  DEPOSIT_STATUS_LABELS,
  RENTAL_PAYMENT_LABELS,
  depositOutstandingCents,
  depositOverpaidCents,
  rentalOutstandingCents,
  rentalOverpaidCents,
  type DepositStatus,
  type PaymentKind,
  type PaymentState,
  type RentalPaymentStatus,
  type UndoKind,
} from '@/lib/payment'
import { formatIban } from '@/lib/iban'

type Method = 'transfer' | 'terminal' | 'cash'
const METHOD_LABELS: Record<Method, string> = { transfer: 'Prevodom', terminal: 'Terminálom', cash: 'V hotovosti' }
const RETURN_METHOD_LABELS: Record<Method, string> = { transfer: 'Prevodom na účet zákazníka', terminal: 'Na kartu cez terminál', cash: 'V hotovosti' }

export type PaymentsPanelProps = {
  id: string
  bookingStatus: string
  canManage: boolean
  today: string
  variableSymbol: string
  totalCents: number | null
  depositCents: number
  rental: {
    status: RentalPaymentStatus
    method: Method
    paidCents: number | null
    paidAt: string | null
    paidBy: string | null
    refundedCents: number | null
    refundedAt: string | null
    refundMethod: Method | null
    refundNote: string | null
  }
  deposit: {
    status: DepositStatus
    method: Method
    receivedCents: number | null
    receivedAt: string | null
    receivedBy: string | null
    returnedCents: number | null
    returnedAt: string | null
    returnMethod: Method | null
    returnNote: string | null
    returnedBy: string | null
  }
  /** Approved settlement total, null when there is none (yet). */
  settlementCents: number | null
  settlementApproved: boolean
  refundIban: string | null
  /** Formatted dates for display (server-side, Europe/Bratislava). */
  dates: { rentalPaid?: string; rentalRefunded?: string; depositReceived?: string; depositReturned?: string }
}

const badge = (tone: 'ok' | 'warn' | 'muted' | 'gold') =>
  `rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
    tone === 'ok'
      ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
      : tone === 'warn'
        ? 'border-red-400/50 bg-red-500/10 text-red-200'
        : tone === 'gold'
          ? 'border-gold bg-gold/15 text-white'
          : 'border-line bg-white/5 text-muted2'
  }`

function Card({ title, status, children }: { title: string; status: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-[#161616] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-bold text-white">{title}</h3>
        {status}
      </div>
      {children}
    </div>
  )
}

function Kv({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="space-y-1 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4">
          <dt className="text-muted2">{label}</dt>
          <dd className="text-right text-white">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function MethodSelect({ id, defaultValue, labels = METHOD_LABELS, label = 'Spôsob' }: { id: string; defaultValue: Method; labels?: Record<Method, string>; label?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} name="method" defaultValue={defaultValue} className={`${selectClass} h-11 appearance-none bg-no-repeat pr-9`} style={SELECT_CHEVRON_STYLE}>
        {(Object.keys(labels) as Method[]).map((m) => (
          <option key={m} value={m}>
            {labels[m]}
          </option>
        ))}
      </select>
    </div>
  )
}

function DateInput({ id, today, label }: { id: string; today: string; label: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <DateField id={id} name="date" defaultValue={today} max={today} required className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-white" />
    </div>
  )
}

/** "Mark as paid" form (rental or deposit). Used in the booking detail and the pickup protocol. */
export function RecordPaymentForm({ id, kind, method, today, onCancel }: { id: string; kind: PaymentKind; method: Method; today: string; onCancel?: () => void }) {
  return (
    <ActionForm action={recordPaymentAction} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="kind" value={kind} />
      <DateInput id={`${kind}-date`} today={today} label={kind === 'rental' ? 'Dátum prijatia platby' : 'Dátum prijatia depozitu'} />
      <MethodSelect id={`${kind}-method`} defaultValue={method} />
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <SubmitButton pendingLabel="Ukladám…">{kind === 'rental' ? 'Potvrdiť úhradu' : 'Potvrdiť prijatie'}</SubmitButton>
        {onCancel ? (
          <button type="button" onClick={onCancel} className="h-10 rounded-lg border border-gold/50 px-4 text-sm font-semibold text-gold hover:bg-gold/10">
            Zrušiť
          </button>
        ) : null}
      </div>
    </ActionForm>
  )
}

function UndoButton({ id, kind, label, confirm }: { id: string; kind: UndoKind; label: string; confirm: string }) {
  return (
    <ActionForm action={undoPaymentAction} confirm={confirm}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="kind" value={kind} />
      <button type="submit" className="min-h-11 text-sm text-muted2 underline underline-offset-4 hover:text-white">
        {label}
      </button>
    </ActionForm>
  )
}

/** Rental payment and deposit of one booking: status, recording, return, undo. */
export function PaymentsPanel(p: PaymentsPanelProps) {
  const [open, setOpen] = useState<null | 'rental' | 'deposit' | 'refund'>(null)
  const finished = p.bookingStatus === 'completed' || p.bookingStatus === 'cancelled'
  const state: PaymentState = {
    total_cents: p.totalCents,
    deposit_cents: p.depositCents,
    rental_payment_status: p.rental.status,
    deposit_status: p.deposit.status,
    rental_paid_cents: p.rental.paidCents,
    rental_refunded_cents: p.rental.refundedCents,
    deposit_received_cents: p.deposit.receivedCents,
  }
  // The price or the deposit can change after a payment (approved change, staff edit).
  const rentalDue = p.rental.status === 'unpaid' ? 0 : rentalOutstandingCents(state)
  const rentalOver = rentalOverpaidCents(state)
  const netPaid = p.rental.status === 'unpaid' ? 0 : (p.rental.paidCents ?? p.totalCents ?? 0) - (p.rental.refundedCents ?? 0)
  const depositDue = p.deposit.status === 'received' ? depositOutstandingCents(state) : 0
  const depositOver = depositOverpaidCents(state)
  const received = p.deposit.receivedCents ?? p.depositCents
  const charged = p.settlementApproved ? (p.settlementCents ?? 0) : 0
  const proposal = Math.max(0, received - charged)
  const due = Math.max(0, charged - received)
  const rentalLabel =
    rentalDue > 0 ? `Doplatok ${formatEuro(rentalDue)}` : rentalOver > 0 && p.bookingStatus !== 'cancelled' ? `Preplatok ${formatEuro(rentalOver)}` : RENTAL_PAYMENT_LABELS[p.rental.status]
  const rentalTone = rentalDue > 0 || p.rental.status === 'unpaid' ? 'warn' : rentalOver > 0 && p.bookingStatus !== 'cancelled' ? 'gold' : p.rental.status === 'paid' ? 'ok' : 'muted'
  const depositLabel = depositDue > 0 ? `Doplatiť ${formatEuro(depositDue)}` : p.deposit.status === 'received' && finished ? 'Prijatý · na vrátenie' : DEPOSIT_STATUS_LABELS[p.deposit.status]
  const depositTone = depositDue > 0 ? 'warn' : p.deposit.status === 'received' ? (finished ? 'gold' : 'ok') : p.deposit.status === 'pending' ? 'warn' : 'ok'
  const canRefund = p.canManage && netPaid > 0 && (p.bookingStatus === 'cancelled' || rentalOver > 0)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Prenájom" status={<span className={badge(rentalTone)}>{rentalLabel}</span>}>
        <Kv
          rows={[
            ['Suma', <strong key="s">{p.totalCents === null ? 'individuálna cena – nedoplnená' : formatEuro(p.totalCents)}</strong>],
            ['Spôsob', METHOD_LABELS[p.rental.method]],
            ...(p.rental.status !== 'unpaid' && netPaid !== (p.totalCents ?? 0) ? ([['Uhradené spolu', formatEuro(netPaid)]] as [string, string][]) : []),
            ...(p.rental.method === 'transfer' ? ([['Variabilný symbol', p.variableSymbol]] as [string, string][]) : []),
          ]}
        />
        {p.rental.status !== 'unpaid' ? (
          <p className="border-t border-line pt-3 text-sm text-white">
            {p.rental.paidCents !== null ? (
              <>
                Uhradené <strong>{formatEuro(p.rental.paidCents)}</strong>, posledná platba{' '}
              </>
            ) : (
              'Uhradené '
            )}
            <strong>{p.dates.rentalPaid}</strong> · {METHOD_LABELS[p.rental.method]}
            {p.rental.paidBy ? <span className="text-muted2"> · zaznamenal {p.rental.paidBy}</span> : null}
          </p>
        ) : null}
        {p.rental.status === 'refunded' || p.rental.status === 'partially_refunded' ? (
          <p className="text-sm text-white">
            Vrátené <strong>{formatEuro(p.rental.refundedCents)}</strong> dňa {p.dates.rentalRefunded}
            {p.rental.refundMethod ? ` · ${METHOD_LABELS[p.rental.refundMethod]}` : ''}
            {p.rental.refundNote ? <span className="text-muted2"> · {p.rental.refundNote}</span> : null}
          </p>
        ) : null}

        {rentalDue > 0 ? (
          <p className="rounded-lg border border-red-400/50 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            Cena sa po úhrade zmenila na {formatEuro(p.totalCents)}. Zákazník má doplatiť <strong>{formatEuro(rentalDue)}</strong>.
          </p>
        ) : null}
        {rentalOver > 0 && p.bookingStatus !== 'cancelled' ? (
          <p className="rounded-lg border border-gold/60 bg-gold/10 px-3 py-2 text-sm text-white">
            Cena sa po úhrade znížila na {formatEuro(p.totalCents)}. Zákazníkovi treba vrátiť <strong>{formatEuro(rentalOver)}</strong>.
          </p>
        ) : null}

        {(p.rental.status === 'unpaid' && p.totalCents !== null) || rentalDue > 0 ? (
          open === 'rental' ? (
            <RecordPaymentForm id={p.id} kind="rental" method={p.rental.method} today={p.today} onCancel={() => setOpen(null)} />
          ) : (
            <button type="button" onClick={() => setOpen('rental')} className="h-11 self-start rounded-lg bg-gold px-5 text-sm font-semibold text-white hover:bg-gold-hover">
              {rentalDue > 0 ? `Zaznamenať doplatok ${formatEuro(rentalDue)}` : 'Označiť ako uhradené'}
            </button>
          )
        ) : null}

        {canRefund ? (
          open === 'refund' ? (
            <ActionForm action={refundRentalAction} className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
              <input type="hidden" name="id" value={p.id} />
              <Field label="Vrátiť zákazníkovi (€)" name="amount" id="refund-amount" inputMode="decimal" defaultValue={centsToInput(p.bookingStatus === 'cancelled' ? netPaid : rentalOver)} />
              <DateInput id="refund-date" today={p.today} label="Dátum vrátenia" />
              <MethodSelect id="refund-method" defaultValue="transfer" labels={RETURN_METHOD_LABELS} />
              <Field
                label="Poznámka"
                name="note"
                id="refund-note"
                maxLength={300}
                placeholder={p.bookingStatus === 'cancelled' ? 'napr. po odpočítaní storno poplatku' : 'preplatok po zmene rezervácie'}
              />
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <SubmitButton>Zaznamenať vrátenie</SubmitButton>
                <button type="button" onClick={() => setOpen(null)} className="h-10 rounded-lg border border-gold/50 px-4 text-sm font-semibold text-gold hover:bg-gold/10">
                  Zrušiť
                </button>
              </div>
            </ActionForm>
          ) : (
            <button type="button" onClick={() => setOpen('refund')} className="h-11 self-start rounded-lg border border-gold/50 px-4 text-sm font-semibold text-gold hover:bg-gold/10">
              {rentalOver > 0 && p.bookingStatus !== 'cancelled' ? `Vrátiť preplatok ${formatEuro(rentalOver)}` : 'Zaznamenať vrátenie platby'}
            </button>
          )
        ) : null}

        {p.canManage && p.rental.status === 'paid' ? (
          <UndoButton id={p.id} kind="rental" label="Zrušiť záznam o úhrade" confirm="Zrušiť záznam o úhrade prenájmu? Platba bude opäť vedená ako neuhradená." />
        ) : null}
        {p.canManage && (p.rental.status === 'refunded' || p.rental.status === 'partially_refunded') ? (
          <UndoButton id={p.id} kind="rental_refund" label="Zrušiť záznam o vrátení" confirm="Zrušiť záznam o vrátení platby?" />
        ) : null}
      </Card>

      <Card title="Depozit" status={<span className={badge(depositTone)}>{depositLabel}</span>}>
        <Kv
          rows={[
            ['Suma', <strong key="s">{formatEuro(p.depositCents)}</strong>],
            ['Spôsob', METHOD_LABELS[p.deposit.method]],
            ...(p.deposit.receivedAt
              ? ([
                  [
                    'Prijatý',
                    `${p.deposit.receivedCents !== null ? `${formatEuro(p.deposit.receivedCents)} · ` : ''}${p.dates.depositReceived}${p.deposit.receivedBy ? ` · ${p.deposit.receivedBy}` : ''}`,
                  ],
                ] as [string, string][])
              : []),
          ]}
        />

        {depositDue > 0 ? (
          <p className="rounded-lg border border-red-400/50 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            Depozit sa zvýšil na {formatEuro(p.depositCents)}. Treba prijať ešte <strong>{formatEuro(depositDue)}</strong>.
          </p>
        ) : null}
        {depositOver > 0 && !finished ? (
          <p className="rounded-lg border border-gold/60 bg-gold/10 px-3 py-2 text-sm text-white">
            Depozit sa znížil na {formatEuro(p.depositCents)}; prijatých {formatEuro(received)} sa vráti po skončení prenájmu.
          </p>
        ) : null}
        {(p.deposit.status === 'pending' && p.depositCents > 0) || depositDue > 0 ? (
          open === 'deposit' ? (
            <RecordPaymentForm id={p.id} kind="deposit" method={p.deposit.method} today={p.today} onCancel={() => setOpen(null)} />
          ) : (
            <button type="button" onClick={() => setOpen('deposit')} className="h-11 self-start rounded-lg bg-gold px-5 text-sm font-semibold text-white hover:bg-gold-hover">
              {depositDue > 0 ? `Zaznamenať doplatok depozitu ${formatEuro(depositDue)}` : 'Depozit prijatý'}
            </button>
          )
        ) : null}

        {p.deposit.status === 'returned' || p.deposit.status === 'partially_returned' ? (
          <p className="border-t border-line pt-3 text-sm text-white">
            Vrátené <strong>{formatEuro(p.deposit.returnedCents)}</strong> dňa {p.dates.depositReturned}
            {p.deposit.returnMethod ? ` · ${RETURN_METHOD_LABELS[p.deposit.returnMethod]}` : ''}
            {p.deposit.returnedBy ? <span className="text-muted2"> · zaznamenal {p.deposit.returnedBy}</span> : null}
            {p.deposit.returnNote ? <span className="block text-muted2">{p.deposit.returnNote}</span> : null}
          </p>
        ) : null}

        {p.deposit.status === 'received' && finished ? (
          <div className="space-y-3 border-t border-line pt-3">
            {p.bookingStatus === 'completed' && !p.settlementApproved ? (
              <p className="text-sm text-muted2">Depozit sa vráti po potvrdení vyúčtovania.</p>
            ) : (
              <>
                {p.settlementApproved ? (
                  <Kv
                    rows={[
                      ['Zrážka podľa vyúčtovania', formatEuro(charged)],
                      [
                        'Na vrátenie',
                        <strong key="r" className="text-gold">
                          {formatEuro(proposal)}
                        </strong>,
                      ],
                      ...(due > 0 ? ([['Doplatok nad rámec depozitu', formatEuro(due)]] as [string, string][]) : []),
                    ]}
                  />
                ) : null}
                {due > 0 ? <p className="text-sm text-amber-100">Vyúčtovanie presahuje depozit. Doplatok vystavte ako doklad Doúčtovanie.</p> : null}
                {p.canManage ? (
                  <ActionForm action={returnDepositAction} className="grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="id" value={p.id} />
                    <Field label="Vrátiť zákazníkovi (€)" name="amount" id="return-amount" inputMode="decimal" defaultValue={centsToInput(proposal)} />
                    <DateInput id="return-date" today={p.today} label="Dátum vrátenia" />
                    <div className="sm:col-span-2">
                      <MethodSelect id="return-method" defaultValue={p.deposit.method === 'cash' ? 'cash' : 'transfer'} labels={RETURN_METHOD_LABELS} label="Spôsob vrátenia" />
                    </div>
                    <p className="text-sm text-muted2 sm:col-span-2">
                      Účet zákazníka na vrátenie:{' '}
                      {p.refundIban ? <strong className="text-white">{formatIban(p.refundIban)}</strong> : 'nezadaný (zákazník ho môže doplniť v Mojom účte, alebo ho zapíšte do poznámky)'}
                    </p>
                    <Field
                      className="sm:col-span-2"
                      label="Poznámka"
                      name="note"
                      id="return-note"
                      maxLength={300}
                      defaultValue={p.settlementApproved && charged > 0 ? `Zrážka ${formatEuro(Math.min(charged, received))} podľa vyúčtovania` : ''}
                    />
                    <div className="sm:col-span-2">
                      <SubmitButton>Zaznamenať vrátenie depozitu</SubmitButton>
                    </div>
                  </ActionForm>
                ) : (
                  <p className="text-sm text-muted2">Vrátenie depozitu zaznamená manažér.</p>
                )}
              </>
            )}
          </div>
        ) : null}

        {p.canManage && p.deposit.status === 'received' ? <UndoButton id={p.id} kind="deposit" label="Zrušiť záznam o prijatí" confirm="Zrušiť záznam o prijatí depozitu?" /> : null}
        {p.canManage && (p.deposit.status === 'returned' || p.deposit.status === 'partially_returned') ? (
          <UndoButton id={p.id} kind="deposit_return" label="Zrušiť záznam o vrátení" confirm="Zrušiť záznam o vrátení depozitu?" />
        ) : null}
      </Card>
    </div>
  )
}
