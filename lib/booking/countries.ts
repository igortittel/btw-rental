/** Countries offered in the billing address (ISO 3166-1 alpha-2). Names come from Intl.DisplayNames. */
export const COUNTRY_CODES = [
  'SK', 'CZ', 'AT', 'HU', 'PL', 'DE', 'UA',
  'AL', 'AD', 'AU', 'BE', 'BA', 'BG', 'BR', 'CA', 'CH', 'CN', 'CY', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GE', 'GR',
  'HR', 'IE', 'IL', 'IN', 'IS', 'IT', 'JP', 'KR', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD', 'ME', 'MK', 'MT', 'NL', 'NO',
  'PT', 'RO', 'RS', 'SE', 'SI', 'SM', 'TR', 'US', 'AE', 'SA', 'QA', 'KW', 'VN', 'KZ',
] as const

export type CountryCode = (typeof COUNTRY_CODES)[number]

/** Dial codes offered next to the phone number; the first one is the default. */
export const PHONE_PREFIXES = [
  { country: 'SK', dial: '+421' },
  { country: 'CZ', dial: '+420' },
  { country: 'AT', dial: '+43' },
  { country: 'HU', dial: '+36' },
  { country: 'PL', dial: '+48' },
  { country: 'DE', dial: '+49' },
  { country: 'UA', dial: '+380' },
  { country: 'GB', dial: '+44' },
  { country: 'FR', dial: '+33' },
  { country: 'IT', dial: '+39' },
  { country: 'ES', dial: '+34' },
  { country: 'NL', dial: '+31' },
  { country: 'BE', dial: '+32' },
  { country: 'CH', dial: '+41' },
  { country: 'HR', dial: '+385' },
  { country: 'SI', dial: '+386' },
  { country: 'RO', dial: '+40' },
  { country: 'BG', dial: '+359' },
  { country: 'RS', dial: '+381' },
  { country: 'GR', dial: '+30' },
  { country: 'SE', dial: '+46' },
  { country: 'NO', dial: '+47' },
  { country: 'DK', dial: '+45' },
  { country: 'FI', dial: '+358' },
  { country: 'IE', dial: '+353' },
  { country: 'PT', dial: '+351' },
  { country: 'TR', dial: '+90' },
  { country: 'IL', dial: '+972' },
  { country: 'AE', dial: '+971' },
  { country: 'US', dial: '+1' },
  { country: 'IN', dial: '+91' },
  { country: 'CN', dial: '+86' },
  { country: 'KR', dial: '+82' },
  { country: 'JP', dial: '+81' },
  { country: 'VN', dial: '+84' },
] as const

export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale === 'en' ? 'en' : 'sk'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}
