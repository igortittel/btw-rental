import { NextResponse, type NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { createServerClient } from '@supabase/ssr'
import { routing } from '@/i18n/routing'

const handleI18nRouting = createIntlMiddleware(routing)

const PROTECTED = /^\/(?:en\/)?moj-ucet(?:\/|$)/

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/')

  // Admin is Slovak only and lives outside the locale routing.
  const response = isAdmin ? NextResponse.next({ request }) : handleI18nRouting(request)

  // Refresh the Supabase session cookie. Authorisation itself (roles) is checked in
  // the layouts and server actions against the database, not here.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && (isAdmin || PROTECTED.test(pathname))) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.startsWith('/en/') ? '/en/prihlasenie' : '/prihlasenie'
    url.search = `?next=${encodeURIComponent(pathname + search)}`
    const redirect = NextResponse.redirect(url)
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  return response
}

export const config = {
  // Everything except API routes, Next internals and files with an extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
