/**
 * Creates the first `owner` account (btw@btw.sk) through the Supabase Admin API.
 *
 *   SEED_OWNER_PASSWORD=… SUPABASE_SERVICE_ROLE_KEY=… NEXT_PUBLIC_SUPABASE_URL=… npx tsx scripts/seed-owner.ts
 *
 * Idempotent: once the account is an owner, the script changes nothing (not even the
 * password). The password comes only from the environment and is never logged.
 * It also runs before every Vercel build (see "vercel-build" in package.json).
 */
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const OWNER_EMAIL = 'btw@btw.sk'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const password = process.env.SEED_OWNER_PASSWORD

  if (!url || !serviceKey || !password) {
    console.log('[seed-owner] skipped: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SEED_OWNER_PASSWORD is not set')
    return
  }
  if (password.length < 10) {
    throw new Error('[seed-owner] SEED_OWNER_PASSWORD must have at least 10 characters')
  }

  const supabase = createClient<Database>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', OWNER_EMAIL)
    .maybeSingle()
  if (profileError) throw new Error(`[seed-owner] cannot read profiles: ${profileError.message}`)

  let userId = profile?.id ?? null

  if (userId) {
    const { data: role } = await supabase.from('staff_roles').select('role').eq('user_id', userId).maybeSingle()
    if (role) {
      console.log(`[seed-owner] ${OWNER_EMAIL} already has the role "${role.role}" – nothing changed`)
      return
    }
    // The address exists (e.g. from the earlier prototype) but was never set up as
    // staff here: bootstrap it once with the seed password.
    const { error } = await supabase.auth.admin.updateUserById(userId, { password, email_confirm: true })
    if (error) throw new Error(`[seed-owner] cannot set password: ${error.message}`)
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: OWNER_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { first_name: 'BY THE WAVE', last_name: '' },
    })
    if (error || !data.user) throw new Error(`[seed-owner] cannot create user: ${error?.message}`)
    userId = data.user.id
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ type: 'staff', password_set: true })
    .eq('id', userId)
  if (updateError) throw new Error(`[seed-owner] cannot update profile: ${updateError.message}`)

  const { error: roleError } = await supabase.from('staff_roles').insert({ user_id: userId, role: 'owner' })
  if (roleError) throw new Error(`[seed-owner] cannot grant role: ${roleError.message}`)

  console.log(`[seed-owner] owner account ${OWNER_EMAIL} is ready`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
