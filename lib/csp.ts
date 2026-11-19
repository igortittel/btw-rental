/**
 * Content-Security-Policy for HTML pages, built per request with a fresh nonce (proxy.ts).
 * Next.js reads the nonce from the request's CSP header and puts it on its own scripts;
 * 'strict-dynamic' lets those scripts load further chunks (and the Turnstile widget).
 * Inline JSON-LD (type="application/ld+json") is data, not script, and needs no nonce.
 */
export function buildCsp(nonce: string, { supabaseUrl, dev }: { supabaseUrl: string; dev: boolean }): string {
  const supabase = new URL(supabaseUrl).origin
  const supabaseWs = supabase.replace(/^https:/, 'wss:')
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // 'unsafe-eval' only in development (React Refresh); never in production.
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    // React style attributes and next/image use inline styles.
    'style-src': ["'self'", "'unsafe-inline'"],
    // data: = QR code for 2FA enrolment, blob: = photo previews in the protocol.
    'img-src': ["'self'", 'data:', 'blob:', supabase],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", supabase, supabaseWs, 'https://challenges.cloudflare.com'],
    'frame-src': ["'self'", 'https://challenges.cloudflare.com'],
    'worker-src': ["'self'", 'blob:'],
    'media-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    // Same-origin framing stays allowed for the e-mail preview in /admin/emaily.
    'frame-ancestors': ["'self'"],
  }
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`)
  if (!dev) policy.push('upgrade-insecure-requests')
  return policy.join('; ')
}

/** 128-bit random nonce, base64. */
export function createNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}
