import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'
import { env } from '@/lib/env'

/** Supabase client bound to the visitor's session cookies. Subject to RLS. */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Server Components cannot set cookies; the middleware refreshes the session.
        }
      },
    },
  })
}
