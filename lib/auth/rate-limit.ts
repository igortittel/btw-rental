import 'server-only'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export async function getClientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
}

/**
 * Fixed-window rate limit stored in Postgres. Returns true while the caller is within
 * the limit. Fails open if the counter itself is unavailable, so an outage of the
 * limiter cannot lock everyone out.
 */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().rpc('check_rate_limit', {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    })
    if (error) {
      console.error('rate limit check failed', error.message)
      return true
    }
    return data
  } catch (e) {
    console.error('rate limit check failed', e)
    return true
  }
}
