import { describe, expect, it } from 'vitest'
import { renderProtocolSigned, renderSettlement } from '@/lib/email/booking-emails'
import { sampleBookingEmailData } from '@/lib/email/samples'
import { DIAGRAMS } from '@/lib/protocol/diagram'
import {
  DAMAGE_VIEWS,
  defaultAccessories,
  eighthsToPercent,
  fuelLabel,
  missingAccessories,
  percentToEighths,
  protocolErrorMessage,
  protocolMissing,
  protocolTypeFromSlug,
  returnAccessories,
  type ProtocolDraft,
} from '@/lib/protocol/model'
import { depositOutcome, formatDuration, proposeSettlement, settlementLines, settlementTotal, type SettlementInput } from '@/lib/settlement'
import { zonedLocalToUtc } from '@/lib/time'

const at = (local: string) => zonedLocalToUtc(local)!

describe('fuel in eighths', () => {
  it('round-trips every eighth through whole percent', () => {
    for (let i = 0; i <= 8; i++) expect(percentToEighths(eighthsToPercent(i))).toBe(i)
    expect(eighthsToPercent(5)).toBe(63)
    expect(fuelLabel(63)).toBe('5/8 · 63 %')
    expect(fuelLabel(null)).toBe('—')
  })
})

describe('accessories', () => {
  const pickup = defaultAccessories([{ id: 'x', name: 'Detská autosedačka', quantity: 2 }])
  it('starts with everything present and appends booking extras', () => {
    expect(pickup.every((item) => item.present)).toBe(true)
    expect(pickup.at(-1)).toMatchObject({ key: 'extra:x', label: 'Detská autosedačka', quantity: 2 })
    expect(pickup.find((item) => item.key === 'keys')?.quantity).toBe(2)
  })
  it('return checklist contains only what was handed over', () => {
    const handed = pickup.map((item) => (item.key === 'spare' ? { ...item, present: false } : item))
    expect(returnAccessories(handed).some((item) => item.key === 'spare')).toBe(false)
  })
  it('reports missing items and smaller quantities', () => {
    const returned = returnAccessories(pickup).map((item) => (item.key === 'vest' ? { ...item, present: false } : item.key === 'keys' ? { ...item, quantity: 1 } : item))
    expect(missingAccessories(pickup, returned)).toEqual(['Kľúče (1 z 2)', 'Reflexná vesta'])
    expect(missingAccessories(pickup, returnAccessories(pickup))).toEqual([])
  })
})

describe('protocolMissing', () => {
  const full: ProtocolDraft = {
    handoverAt: '2026-11-09T10:05',
    odometerKm: 48210,
    fuelLevel: 100,
    chargeLevel: null,
    interior: 'clean',
    exterior: 'clean',
    accessories: [],
    note: '',
    customerName: 'Martin Kováč',
    staffName: 'Jana Horváthová',
    driverLicenseNo: '',
    idDocumentNo: '',
    damages: [],
    photos: (['front', 'rear', 'left', 'right'] as const).map((angle) => ({ angle, path: `b/p/${angle}.jpg` })),
  }
  const signed = { fuel: 'diesel', customerSigned: true, staffSigned: true }
  it('is empty for a complete protocol', () => {
    expect(protocolMissing(full, signed)).toEqual([])
  })
  it('lists every gap', () => {
    const missing = protocolMissing(
      { ...full, odometerKm: null, fuelLevel: null, photos: full.photos.slice(0, 3), damages: [{ id: 'd', view: 'left', x: 1, y: 1, kind: 'dent', description: ' ', photoPath: null }] },
      { fuel: 'diesel', customerSigned: false, staffSigned: true },
    )
    expect(missing).toEqual(['stav tachometra', 'stav paliva', 'fotka: pravý bok', 'popis nového poškodenia (1.)', 'podpis zákazníka'])
  })
  it('an electric car needs the charge, not fuel', () => {
    expect(protocolMissing({ ...full, fuelLevel: null }, { ...signed, fuel: 'electric' })).toEqual(['nabitie batérie'])
    expect(protocolMissing({ ...full, fuelLevel: null, chargeLevel: 80 }, { ...signed, fuel: 'electric' })).toEqual([])
  })
  it('refuses an odometer below the pickup value', () => {
    expect(protocolMissing(full, { ...signed, pickupOdometerKm: 48211 })).toEqual(['tachometer je nižší ako pri odovzdaní'])
  })
})

describe('protocol helpers', () => {
  it('maps URL slugs', () => {
    expect(protocolTypeFromSlug('odovzdavaci')).toBe('pickup')
    expect(protocolTypeFromSlug('preberaci')).toBe('return')
    expect(protocolTypeFromSlug('pickup')).toBeNull()
  })
  it('translates database errors', () => {
    expect(protocolErrorMessage('protocol_incomplete: photos')).toContain('štyri povinné fotky')
    expect(protocolErrorMessage('odometer_below_pickup')).toContain('tachometra')
    expect(protocolErrorMessage('something else')).toBeNull()
  })
  it('has a drawing for every damage view', () => {
    for (const view of DAMAGE_VIEWS) expect(DIAGRAMS[view.key].shapes.length).toBeGreaterThan(2)
  })
})

describe('proposeSettlement', () => {
  const base: SettlementInput = {
    pickupOdometerKm: 48210,
    returnOdometerKm: 50195,
    pickupFuel: 100,
    returnFuel: 63,
    days: 5,
    kmLimitPerDay: 300,
    extraKmCents: 62,
    pickupAt: at('2026-11-09T10:00'),
    plannedReturnAt: at('2026-11-14T10:00'),
    actualReturnAt: at('2026-11-14T11:40'),
    toleranceMinutes: 59,
    ratePerDayCents: 7900,
  }
  it('charges km over limit × days', () => {
    const p = proposeSettlement(base)
    expect(p).toMatchObject({ kmDriven: 1985, kmLimit: 1500, extraKm: 485, extraKmCents: 30070, fuelDiff: -37 })
  })
  it('charges nothing within the limit', () => {
    expect(proposeSettlement({ ...base, returnOdometerKm: 49710 })).toMatchObject({ kmDriven: 1500, extraKm: 0, extraKmCents: 0 })
  })
  it('a late return beyond the tolerance starts another day', () => {
    expect(proposeSettlement(base)).toMatchObject({ lateMinutes: 100, lateDays: 1, lateCents: 7900 })
  })
  it('lateness within the tolerance is free, the boundary included', () => {
    expect(proposeSettlement({ ...base, actualReturnAt: at('2026-11-14T10:59') })).toMatchObject({ lateMinutes: 59, lateDays: 0, lateCents: 0 })
    expect(proposeSettlement({ ...base, actualReturnAt: at('2026-11-14T11:00') })).toMatchObject({ lateMinutes: 60, lateDays: 1 })
  })
  it('two days late = two daily rates; an early return costs nothing', () => {
    expect(proposeSettlement({ ...base, actualReturnAt: at('2026-11-16T09:00') })).toMatchObject({ lateDays: 2, lateCents: 15800 })
    expect(proposeSettlement({ ...base, actualReturnAt: at('2026-11-13T18:00') })).toMatchObject({ lateMinutes: 0, lateDays: 0, lateCents: 0 })
  })
  it('without a pickup protocol or a daily rate it proposes no amount', () => {
    expect(proposeSettlement({ ...base, pickupOdometerKm: null, pickupFuel: null })).toMatchObject({ kmDriven: null, extraKm: 0, fuelDiff: null })
    expect(proposeSettlement({ ...base, ratePerDayCents: null })).toMatchObject({ lateDays: 1, lateCents: 0 })
  })
})

describe('settlement display', () => {
  const row = {
    km_driven: 1985,
    extra_km: 485,
    extra_km_cents: 30070,
    fuel_diff: -37,
    fuel_cents: 4500,
    damage_cents: 18000,
    damage_items: [
      { damage_id: 'a', label: 'Preliačina · Pravý bok', cents: 18000 },
      { damage_id: 'b', label: 'Škrabanec', cents: 0 },
    ],
    late_minutes: 100,
    late_cents: 7900,
    other_cents: 0,
    other_label: null,
  }
  it('lists charged items only', () => {
    expect(settlementLines(row)).toEqual([
      { label: 'Kilometre nad limit', detail: '485 km', cents: 30070 },
      { label: 'Palivo', cents: 4500 },
      { label: 'Poškodenie', detail: 'Preliačina · Pravý bok', cents: 18000 },
      { label: 'Meškanie pri vrátení', detail: '1 h 40 min', cents: 7900 },
    ])
    expect(settlementLines({ ...row, other_cents: 1500, other_label: 'Reflexná vesta' }, 'en').at(-1)).toEqual({ label: 'Reflexná vesta', cents: 1500 })
  })
  it('totals and the deposit', () => {
    expect(settlementTotal({ extraKmCents: 30070, fuelCents: 4500, damageCents: 18000, lateCents: 7900, otherCents: 0 })).toBe(60470)
    expect(depositOutcome(100000, 60470)).toEqual({ refundCents: 39530, dueCents: 0 })
    expect(depositOutcome(100000, 125000)).toEqual({ refundCents: 0, dueCents: 25000 })
  })
  it('formats durations', () => {
    expect(formatDuration(100)).toBe('1 h 40 min')
    expect(formatDuration(25)).toBe('25 min')
    expect(formatDuration(1560)).toBe('1 d 2 h')
  })
})

describe('emails 8 and 10', () => {
  const common = {
    handoverAt: '14. 6. 2027 10:05',
    odometer: '48 210 km',
    fuel: '8/8 · 100 %',
    newDamages: 0,
    hasAttachment: true,
    accountUrl: 'https://rental.btw.sk/moj-ucet',
    assistancePhone: '+421900000000',
  }
  it('pickup protocol: subject, return term, assistance', async () => {
    const email = await renderProtocolSigned({ ...common, booking: sampleBookingEmailData('sk'), type: 'pickup' })
    expect(email.subject).toBe('Odovzdávací protokol k rezervácii BTW-2027-0042 – BY THE WAVE')
    expect(email.text).toContain('nájdete v prílohe')
    expect(email.text).toContain('48 210 km')
    expect(email.text).toContain('+421900000000')
  })
  it('return protocol: new damages and the settlement note, English variant', async () => {
    const sk = await renderProtocolSigned({ ...common, booking: sampleBookingEmailData('sk'), type: 'return', newDamages: 1, hasAttachment: false })
    expect(sk.subject).toContain('Preberací protokol')
    expect(sk.text).toContain('Vyúčtovanie prenájmu')
    expect(sk.text).not.toContain('v prílohe')
    const en = await renderProtocolSigned({ ...common, booking: sampleBookingEmailData('en'), type: 'return' })
    expect(en.subject).toBe('Return report for booking BTW-2027-0042 – BY THE WAVE')
    expect(en.text).toContain('none')
  })
  it('settlement: items, total and refund; clean return', async () => {
    const booking = sampleBookingEmailData('sk')
    const email = await renderSettlement({
      booking,
      lines: [{ label: 'Kilometre nad limit', detail: '485 km', amount: '300,70 €' }],
      total: '300,70 €',
      hasCharges: true,
      deposit: '1 000 €',
      refund: '699,30 €',
      due: null,
      note: 'Ďakujeme.',
      accountUrl: 'https://rental.btw.sk/moj-ucet',
    })
    expect(email.subject).toBe('Vyúčtovanie prenájmu BTW-2027-0042 – BY THE WAVE')
    for (const part of ['Kilometre nad limit (485 km)', '300,70 €', 'Vrátime vám', '699,30 €', 'Ďakujeme.']) expect(email.text).toContain(part)
    const clean = await renderSettlement({ booking, lines: [], total: '0 €', hasCharges: false, deposit: '1 000 €', refund: '1 000 €', due: null, note: null, accountUrl: 'x' })
    expect(clean.text).toContain('nič nedoúčtovávame')
    expect(clean.text).not.toContain('Doúčtovanie spolu')
  })
})
