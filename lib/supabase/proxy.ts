import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const claims = await supabase.auth.getClaims()
  const user = claims?.data?.claims ? claims.data.claims : null

  const publicPaths = [
    '/',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/api/health',
    '/api/schema-check',
    '/api/dev-login',
    // Vrijheidscheck — publieke lead-gen-funnel (ADR 0022). De wizard, het
    // rapport en de twee anonieme API's zijn bewust publiek; /check/activeren en
    // /api/check/activate blijven achter auth (conversie ná inloggen).
    '/check',
    '/check/rapport',
    '/api/check/submit',
    '/api/session-info',
    // NB (allowlist-opschoning, aparte kaart): onderstaande API-routes stammen
    // uit het harness-tijdperk en zijn hierdoor publiek (geen middleware-401).
    // De routes zelf checken auth; of ze uit deze lijst kunnen is de scope van
    // de aparte allowlist-kaart — hier bewust ongemoeid gelaten.
    '/api/goals',
    '/api/portfolio-allocation',
    '/api/daily-expense-rate',
    '/api/snapshots/cron',
    '/api/holdings/refresh-prices/cron',
    '/api/goals/history',
    '/api/dividends',
  ]

  // Protected route prefixes that require authentication
  const protectedPrefixes = [
    '/overzicht',
    '/toekomst',
    '/mijn',
    '/dashboard',
    '/core',
    '/will',
    '/horizon',
    '/identity',
    '/beheer',
    '/onboarding',
    '/api/',
  ]

  const { pathname } = request.nextUrl

  // De dev-only feature-verificatie-harness (`/test-*`, `/api/verify-*`,
  // `/api/test-*`) is fysiek uit `app/` verwijderd (Arch F4). De vroegere
  // runtime prod-404-check hier is daarmee overbodig: de routes bestaan niet
  // meer, dus Next geeft zelf 404. Voeg zulke routes nooit opnieuw toe onder
  // `app/` — het in-app regressieframework (lib/regression-tests) test tegen
  // echte productie-routes.

  const isPublicPath =
    publicPaths.includes(pathname) || pathname.startsWith('/auth/')

  const isProtectedPath = protectedPrefixes.some(prefix =>
    pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : prefix + '/')
  )

  // Redirect authenticated users away from public auth pages to the app.
  // /reset-password hoort hier NIET bij: de recovery-link logt de gebruiker in
  // via /auth/callback en moet daarna op /reset-password kunnen landen.
  const authPages = ['/', '/login', '/signup', '/forgot-password']
  if (user && authPages.includes(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/overzicht'
    return NextResponse.redirect(url)
  }

  // Only redirect to login for known protected routes
  // Unknown routes pass through so Next.js can show the 404 page
  if (!user && !isPublicPath && isProtectedPath) {
    // Check if request had auth cookies (expired session vs never logged in)
    const hadSession = request.cookies.getAll().some(c => c.name.startsWith('sb-'))

    // API routes should return 401 JSON instead of redirecting to login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Niet ingelogd', sessionExpired: hadSession },
        { status: 401, headers: { 'X-Session-Expired': hadSession ? 'true' : 'false' } }
      )
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    if (hadSession) {
      url.searchParams.set('expired', '1')
    }
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
