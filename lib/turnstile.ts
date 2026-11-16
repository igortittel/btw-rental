import 'server-only'

// Cloudflare Turnstile is optional: without both keys the forms rely on the honeypot,
// the minimum fill time and the rate limit.

/** Site key for the widget, or null when Turnstile is not fully configured. */
export function turnstileSiteKey(): string | null {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  return siteKey && process.env.TURNSTILE_SECRET_KEY ? siteKey : null
}

/** TRUE when the token is valid, or when Turnstile is not configured. Fails closed on errors. */
export async function verifyTurnstile(token: string | null | undefined, ip?: string): Promise<boolean> {
  if (!turnstileSiteKey()) return true
  if (!token || token.length > 4096) return false
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token })
    if (ip && ip !== 'unknown') body.set('remoteip', ip)
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(8000) })
    const result = (await response.json()) as { success?: boolean }
    return result.success === true
  } catch (e) {
    console.error('turnstile verification failed', e)
    return false
  }
}
