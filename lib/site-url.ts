import 'server-only'
import { headers } from 'next/headers'

const PRODUCTION_HOST = 'rental.btw.sk'

function allowedHosts(): Set<string> {
  const hosts = new Set<string>([PRODUCTION_HOST])
  for (const value of [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
  ]) {
    if (!value) continue
    try {
      hosts.add(new URL(value.includes('://') ? value : `https://${value}`).host)
    } catch {
      // ignore malformed values
    }
  }
  return hosts
}

function fallbackOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured && process.env.VERCEL_ENV !== 'preview') return configured.replace(/\/$/, '')
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_BRANCH_URL) {
    return `https://${process.env.VERCEL_BRANCH_URL}`
  }
  return configured?.replace(/\/$/, '') || `https://${PRODUCTION_HOST}`
}

/**
 * Origin used in emailed links. The request host is used only when it is one of our
 * own hosts – a forged Host header must never end up in a password link.
 */
export async function getSiteOrigin(): Promise<string> {
  try {
    const h = await headers()
    const host = h.get('x-forwarded-host') ?? h.get('host')
    if (host) {
      const isLocal = process.env.NODE_ENV !== 'production' && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
      if (isLocal) return `http://${host}`
      if (allowedHosts().has(host)) return `https://${host}`
    }
  } catch {
    // not in a request scope
  }
  return fallbackOrigin()
}

/** Configured origin without looking at the request (background jobs such as the cron). */
export function getConfiguredOrigin(): string {
  return fallbackOrigin()
}
