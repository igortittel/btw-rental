/** Lower-case ASCII slug: "Mercedes-Benz E 220 d" -> "mercedes-benz-e-220-d". */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildVehicleSlug(v: { brand: string; model: string; variant?: string | null }): string {
  return slugify([v.brand, v.model, v.variant ?? ''].join(' '))
}

export function buildVehicleName(v: { brand: string; model: string; variant?: string | null }): string {
  return [v.brand, v.model, v.variant ?? '']
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
}

/** VIN as stored and shown in URLs: upper case, no surrounding whitespace. */
export function normalizeVin(vin: string): string {
  return vin.trim().toUpperCase()
}

export const VIN_PATTERN = /^[A-Z0-9]{5,20}$/

/** Canonical public path of a vehicle: /{category}/{slug}-{VIN}. */
export function vehiclePath(categorySlug: string, slug: string, vin: string): string {
  return `/${categorySlug}/${slug}-${normalizeVin(vin)}`
}

/**
 * Splits the last URL segment into its name part and VIN. The VIN is everything after
 * the last dash (VINs never contain dashes); the vehicle is always looked up by VIN.
 */
export function parseVehicleSegment(segment: string): { namePart: string; vin: string } | null {
  const index = segment.lastIndexOf('-')
  if (index <= 0 || index === segment.length - 1) return null
  return { namePart: segment.slice(0, index), vin: segment.slice(index + 1) }
}

/** Category slugs that would collide with static routes. Mirrors the DB CHECK constraint. */
export const RESERVED_SLUGS = [
  'rezervacia',
  'prihlasenie',
  'nastavit-heslo',
  'zabudnute-heslo',
  'moj-ucet',
  'admin',
  'api',
  'auth',
  'en',
  'sk',
  'images',
  'static',
  'sitemap',
  'robots',
  'favicon',
] as const

export function isReservedSlug(slug: string): boolean {
  return (RESERVED_SLUGS as readonly string[]).includes(slug)
}
