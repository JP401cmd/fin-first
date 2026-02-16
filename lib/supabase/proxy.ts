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
    '/test-phase-modal',
    '/test-chat',
    '/test-locked-features',
    '/test-breadcrumb',
    '/test-snapshots',
    '/test-streaks',
    '/test-next-steps',
    '/api/session-info',
    '/api/verify-budget-spending',
    '/test-budget-verify',
    '/test-empty-states',
    '/test-valuations',
    '/test-budget-alerts',
    '/api/test-budget-alerts',
    '/test-feature-visits',
    '/test-holdings',
    '/test-holding-transactions',
    '/test-debt-payoff',
    '/test-dividend-accumulation',
    '/test-freedom-card',
    '/test-data-isolation',
    '/api/verify-data-isolation',
    '/test-box3-verification',
    '/api/verify-box3',
    '/test-feature-gating',
    '/test-goal-progress',
    '/api/goals',
    '/test-holding-crud',
    '/test-asset-crud',
    '/test-debt-crud',
    '/test-holding-price-update',
    '/api/verify-csv-export',
    '/test-csv-export',
    '/api/test-schema-validation',
    '/test-user-isolation',
    '/test-budget-workflow',
    '/api/apply-migration',
    '/test-migration',
    '/test-onboarding-workflow',
    '/api/verify-onboarding',
    '/test-bank-import',
    '/test-next-step-dismiss',
    '/test-badges',
    '/test-buy-transaction',
    '/test-sell-transaction',
    '/test-phase-transition',
    '/api/verify-phase-transition',
    '/api/test-streaks',
    '/test-onboarding-reset',
    '/api/verify-onboarding-reset',
    '/test-rec-workflow',
    '/api/test-rec-workflow',
  ]

  // Protected route prefixes that require authentication
  const protectedPrefixes = [
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

  const isPublicPath =
    publicPaths.includes(pathname) || pathname.startsWith('/auth/')

  const isProtectedPath = protectedPrefixes.some(prefix =>
    pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : prefix + '/')
  )

  // Redirect authenticated users away from public auth pages to dashboard
  const authPages = ['/', '/login', '/signup', '/forgot-password', '/reset-password']
  if (user && authPages.includes(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Only redirect to login for known protected routes
  // Unknown routes pass through so Next.js can show the 404 page
  if (!user && !isPublicPath && isProtectedPath) {
    // API routes should return 401 JSON instead of redirecting to login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Niet ingelogd' },
        { status: 401 }
      )
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
