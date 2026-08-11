import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Cron-routes: headless aangeroepen, dus GEEN sessiecookie. Het echte auth-slot
 * is `CRON_SECRET` in de handler zelf (fail-closed in productie). Zónder een
 * entry hier 401't de `/api/`-protected-prefix de cron VÓÓR die check draait —
 * en dan draait de taak nooit, zonder spoor in `job_runs`.
 *
 * Deze lijst MOET gelijk zijn aan de `crons`-lijst in `vercel.json`. Dat stond
 * er eerder alleen als comment; sinds ADR 0102 bewaakt `proxy.cron-paths.test.ts`
 * het, omdat een vergeten entry een taak stil onbereikbaar maakt.
 */
export const CRON_PUBLIC_PATHS: readonly string[] = [
  '/api/snapshots/cron',
  '/api/holdings/refresh-prices/cron',
  '/api/cron/retention', // AVG-retentie (Arch F3, ADR 0059)
  '/api/cron/user-reports-notion-sync', // retry van gemiste Notion-pushes (meldingen)
  '/api/web-vitals/retention/cron', // web_vitals-retentie (feature 885)
  '/api/news-ingest/cron', // dagelijkse nieuws-ingest
  '/api/briefing/email/cron', // wekelijkse briefing-mail
  // Meldingen-sweep (ADR 0102). Wordt ÓÓK van buiten aangeroepen door de
  // externe dead man's switch — juist die aanroep heeft nooit een sessie.
  '/api/cron/alerts-sweep',
]

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

  // Alleen echt-publieke (uitgelogd bereikbare) paden. Matching is EXACT
  // (publicPaths.includes), plus de prefix-regel voor /auth/ verderop. Voeg hier
  // NOOIT een productie-API toe die eigen auth heeft: dan omzeilt-ie de
  // middleware-401 en leunt de beveiliging op één self-check (fragiel). Zie de
  // Arch F4-sanering: /api/goals(+/history), /api/dividends, /api/portfolio-
  // allocation en /api/daily-expense-rate zijn hier bewust WEGgehaald — ze zijn
  // ingelogde app-surfaces en 401'en zelf al zonder sessie.
  const publicPaths = [
    // --- Publieke pagina's (uitgelogd bereikbaar) ---
    '/',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    // --- Publieke API's / infra ---
    '/api/health',
    '/api/schema-check',
    '/api/dev-login',
    '/api/session-info',
    // Vrijheidscheck — publieke lead-gen-funnel (ADR 0022). De wizard, het
    // rapport en de submit-API zijn bewust publiek; /check/activeren en
    // /api/check/activate blijven achter auth (conversie ná inloggen). /check
    // staat daarom EXACT (geen prefix-regel), zodat de sub-paden auth-gated blijven.
    '/check',
    '/check/rapport',
    '/api/check/submit',
    // Leaked-password-check (ADR 0057): bewust publiek — signup gebeurt uitgelogd,
    // dus de check moet zonder sessie bij de HIBP-proxy kunnen. Zonder deze entry
    // geeft de /api/-protected-prefix een 401 vóór de handler, waardoor de check
    // fail-open stil uitgeschakeld wordt op de belangrijkste flow (registratie).
    '/api/auth/password-check',
    // Web-vitals / RUM-ingest (feature 884): bewust publiek en sessie-optioneel —
    // de reporter is in de ROOT-layout gemount en beacon't óók pre-auth (uitgelogd
    // / vóór hydratatie). De handler leidt user_id uitsluitend uit de geverifieerde
    // JWT af (null voor anoniem) en schrijft via de service-role. Zonder deze entry
    // 401't de /api/-protected-prefix de logged-out beacons VÓÓR de handler, waardoor
    // anonieme/pre-auth RUM stil verloren gaat (de fire-and-forget beacon negeert de 401).
    '/api/web-vitals',
    // --- Cron-routes (Arch F4-besluit AC#2): zie CRON_PUBLIC_PATHS hierboven,
    // dat is de single source en wordt tegen vercel.json bewaakt. ---
    ...CRON_PUBLIC_PATHS,
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
