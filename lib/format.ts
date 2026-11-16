/** Formats integer cents as euros in Slovak notation, e.g. 7900 -> "79 €", 62 -> "0,62 €". */
export function formatEuro(cents: number | null | undefined, locale = 'sk'): string {
  if (cents === null || cents === undefined) return '—'
  return new Intl.NumberFormat(locale === 'en' ? 'en-IE' : 'sk-SK', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

/** Value for an <input> holding euros: 7900 -> "79", 62 -> "0,62", null -> "". */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ''
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace('.', ',')
}

/**
 * Parses a euro amount typed by a person ("79", "79,5", "0.62", "1 000,00 €") into
 * integer cents. Returns null for empty input and NaN for anything that is not a
 * non-negative amount with at most two decimals.
 */
export function parseEuroToCents(input: string | null | undefined): number | null {
  const raw = (input ?? '').replace(/[\s €]/g, '')
  if (raw === '') return null
  if (!/^\d+([.,]\d{1,2})?$/.test(raw)) return Number.NaN
  const [whole, fraction = ''] = raw.split(/[.,]/)
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}
