import 'server-only'
import { createHash } from 'node:crypto'

/**
 * Leaked-password check against Have I Been Pwned (Pwned Passwords range API).
 * k-anonymity: only the first 5 hex characters of the SHA-1 hash leave the server, never
 * the password or its full hash; the response is padded so its size reveals nothing.
 * Stand-in for Supabase's "Leaked password protection", which this plan does not offer.
 * Fails open: if the service is slow or down, the password is accepted.
 */
export async function isPwnedPassword(password: string, timeoutMs = 3000): Promise<boolean> {
  const hash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase()
  const prefix = hash.slice(0, 5)
  const suffix = hash.slice(5)
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'btw-rental' },
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    })
    if (!response.ok) return false
    return pwnedCount(await response.text(), suffix) > 0
  } catch (e) {
    console.error('pwned password check failed', e instanceof Error ? e.message : e)
    return false
  }
}

/** Count for `suffix` in a range response (`SUFFIX:COUNT` lines; padding lines have count 0). */
export function pwnedCount(body: string, suffix: string): number {
  for (const line of body.split('\n')) {
    const [candidate, count] = line.trim().split(':')
    if (candidate?.toUpperCase() === suffix.toUpperCase()) return Number.parseInt(count ?? '0', 10) || 0
  }
  return 0
}
