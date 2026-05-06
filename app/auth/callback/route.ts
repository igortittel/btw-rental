import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code     = searchParams.get('code')
  const redirect = searchParams.get('redirect') ?? ''

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      await supabase.rpc('link_user_bookings', {
        p_user_id: data.user.id,
        p_email:   data.user.email,
      })

      const isAdmin = (data.user.user_metadata as Record<string, string>)?.role === 'admin'
      const defaultDest = isAdmin ? '/admin' : '/dashboard'
      const dest = redirect && redirect !== '/dashboard' ? redirect : defaultDest

      return NextResponse.redirect(`${origin}${dest}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_error`)
}
