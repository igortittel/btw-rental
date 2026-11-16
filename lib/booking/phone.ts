import { PHONE_PREFIXES } from '@/lib/booking/countries'

/** Splits "+421900123456" into the dial code and the national number; null when the prefix is not one we offer. */
export function splitPhone(phone: string | null | undefined): { phonePrefix: string; phoneNumber: string } | null {
  if (!phone) return null
  const prefix = [...PHONE_PREFIXES].sort((a, b) => b.dial.length - a.dial.length).find((p) => phone.startsWith(p.dial))
  return prefix ? { phonePrefix: prefix.dial, phoneNumber: phone.slice(prefix.dial.length) } : null
}
