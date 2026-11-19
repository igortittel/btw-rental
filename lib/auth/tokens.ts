import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/database'

export type AuthTokenPurpose = Database['public']['Enums']['auth_token_purpose']

/** First password / staff invitation: 72 h (brief). Reset of an existing password: 2 h. */
export const TOKEN_TTL_HOURS: Record<AuthTokenPurpose, number> = {
  set_password: 72,
  reset_password: 2,
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Issues a single-use token and invalidates the profile's earlier unused ones. */
export async function issueAuthToken(profileId: string, purpose: AuthTokenPurpose, createdBy?: string | null) {
  const admin = createAdminClient()
  const token = generateToken()
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS[purpose] * 3600_000)

  await admin.from('auth_tokens').update({ used_at: new Date().toISOString() }).eq('profile_id', profileId).is('used_at', null)

  const { error } = await admin.from('auth_tokens').insert({
    profile_id: profileId,
    purpose,
    token_hash: hashToken(token),
    expires_at: expiresAt.toISOString(),
    created_by: createdBy ?? null,
  })
  if (error) throw new Error(`Could not issue auth token: ${error.message}`)

  return { token, expiresAt }
}

/** Read-only validity check used to decide which form to render. */
export async function peekAuthToken(token: string) {
  if (!token || token.length > 200) return null
  const admin = createAdminClient()
  const { data } = await admin.from('auth_tokens').select('profile_id, purpose, expires_at, used_at').eq('token_hash', hashToken(token)).maybeSingle()
  if (!data || data.used_at || new Date(data.expires_at) <= new Date()) return null
  return { profileId: data.profile_id, purpose: data.purpose }
}

/** Atomically consumes the token. Returns null when it is invalid, expired or already used. */
export async function consumeAuthToken(token: string) {
  if (!token || token.length > 200) return null
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('consume_auth_token', { p_token_hash: hashToken(token) })
  if (error || !data || data.length === 0) return null
  return { profileId: data[0].profile_id, purpose: data[0].purpose }
}
