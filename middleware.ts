import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl
  const isAdmin = (user?.user_metadata as Record<string, string>)?.role === 'admin'

  const isProtected  = pathname.startsWith('/dashboard') || pathname.startsWith('/admin')
  const isAdminRoute = pathname.startsWith('/admin')
  const isAuthPage   = pathname.startsWith('/auth/login')

  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // Non-admins trying to access admin routes → their dashboard
  if (isAdminRoute && user && !isAdmin) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Already logged in visiting auth page → redirect to correct home
  if (isAuthPage && user) {
    return NextResponse.redirect(new URL(isAdmin ? '/admin' : '/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|api/auth).*)'],
}
