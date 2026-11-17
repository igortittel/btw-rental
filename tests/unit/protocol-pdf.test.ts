import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderProtocolPdf, type ProtocolPdfData } from '@/lib/pdf/protocol-pdf'

// 1 × 1 px placeholder image
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
export const samplePdfData: ProtocolPdfData = {
  type: 'return', bookingNumber: 'BTW-2026-0142', version: 1, supersedesVersion: null,
  company: { name: 'BY THE WAVE, s.r.o.', address: 'Trenčianska 56/A, 821 09 Bratislava', ids: ['IČO: 12345678'] },
  customer: { name: 'Ľubomír Ďurčanský', lines: ['Mlynská 12, 811 05 Bratislava', 'VP: SK 4512 8876', 'tel.: +421 900 123 456'] },
  vehicle: { name: 'Mercedes-Benz E 220 d', plate: 'BT003TW', vin: 'TESTBTW0000000003' }, term: '9. 11. 2026 10:00 – 14. 11. 2026 10:00',
  state: [
    { label: 'Dátum a čas', pickup: '9. 11. 2026 10:05', value: '14. 11. 2026 11:40', diff: 'meškanie 1 h 40 min' },
    { label: 'Tachometer', pickup: '48 210 km', value: '50 195 km', diff: '1 985 km (limit 1 500 km)' },
    { label: 'Palivo', pickup: '8/8 · 100 %', value: '5/8 · 63 %', diff: '−3/8' },
    { label: 'Čistota interiéru', pickup: 'Čisté', value: 'Mierne znečistené' },
  ],
  accessories: [{ label: 'Osvedčenie o evidencii', present: true, missing: false }, { label: 'Kľúče – 2 ks', present: true, missing: false }, { label: 'Reflexná vesta', present: false, missing: true }],
  damages: [
    { no: 1, view: 'left', x: 63, y: 62, kind: 'scratch', description: 'zadné dvere, cca 8 cm', isNew: false },
    { no: 2, view: 'front', x: 30, y: 74, kind: 'scuff', description: 'predný nárazník vľavo dole', isNew: false },
    { no: 3, view: 'right', x: 30, y: 60, kind: 'dent', description: 'predný blatník, priemer cca 4 cm – žltý šíp ťahá ňu', isNew: true },
  ],
  photos: ['Spredu', 'Zozadu', 'Ľavý bok', 'Pravý bok', 'Interiér'].map((label) => ({ label, image: { data: png, format: 'png' as const } })),
  damagePhotos: [{ no: 3, image: { data: png, format: 'png' } }],
  note: 'Vozidlo vrátené s meškaním, zákazník volal vopred.', kmLimitPerDay: 300, extraKmPrice: '0,62 €', signedAt: '14. 11. 2026 11:52',
  customerName: 'Ľubomír Ďurčanský', staffName: 'Jana Horváthová', customerSignature: { data: png, format: 'png' }, staffSignature: null,
}

describe('protocol PDF', () => {
  it('renders a multi-page PDF with embedded Montserrat (Slovak diacritics)', async () => {
    const pdf = await renderProtocolPdf(samplePdfData)
    // PDF_OUT=/path/file.pdf npm test -- protocol-pdf  → keeps the file for a visual check
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, pdf)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(20_000)
    expect(pdf.toString('latin1')).toContain('Montserrat')
  }, 30_000)

  it('renders a pickup protocol without damages, photos or signatures', async () => {
    const pdf = await renderProtocolPdf({ ...samplePdfData, type: 'pickup', damages: [], photos: [], damagePhotos: [], customerSignature: null, note: null, state: samplePdfData.state.map(({ label, value }) => ({ label, value })) })
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  }, 30_000)
})
