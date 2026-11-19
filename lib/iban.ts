/** Removes spaces and upper-cases. */
export function normalizeIban(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

/** ISO 13616 check (length for SK/CZ, generic 15–34 otherwise, and mod-97). */
export function isValidIban(value: string): boolean {
  const iban = normalizeIban(value)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  if ((iban.startsWith('SK') || iban.startsWith('CZ')) && iban.length !== 24) return false
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const char of rearranged) {
    const digits = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55)
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97
  }
  return remainder === 1
}

/** Groups of four for display: SK31 1200 0000 1987 4263 7541. */
export function formatIban(value: string): string {
  return normalizeIban(value)
    .replace(/(.{4})/g, '$1 ')
    .trim()
}
