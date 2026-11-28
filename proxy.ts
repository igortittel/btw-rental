import { NextRequest, NextResponse } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { createServerClient } from '@supabase/ssr'
import { routing } from '@/i18n/routing'
import { buildCsp, createNonce } from '@/lib/csp'

const handleI18nRouting = createIntlMiddleware(routing)

const PROTECTED = /^\/(?:en\/)?moj-ucet(?:\/|$)/

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // Per-request nonce for the Content-Security-Policy: passed to Next.js in the request headers
  // (it marks its scripts with it) and sent to the browser in the response.
  const nonce = createNonce()
  const csp = buildCsp(nonce, { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!, dev: process.env.NODE_ENV === 'development' })
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp)
  const forwarded = new NextRequest(request, { headers: requestHeaders })

  // next-intl copies the request headers into its rewrite, so the nonce reaches the page.
  // (/admin is a 301 to admin.btw.sk in next.config.mjs and never reaches this proxy.)
  const response = handleI18nRouting(forwarded)
  response.headers.set('Content-Security-Policy', csp)

  // Refresh the Supabase session cookie. Authorisation itself (roles) is checked in
  // the layouts and server actions against the database, not here.
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && PROTECTED.test(pathname)) {
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
