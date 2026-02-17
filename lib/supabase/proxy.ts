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
    '/test-fire-scenarios',
    '/test-loading-states',
    '/test-network-error-import',
    '/api/verify-network-error-import',
    '/test-import-validation',
    '/test-portfolio-allocation',
    '/test-f96',
    '/test-500-error',
    '/test-500-error/render-error',
    '/api/test-500',
    '/test-empty-badge-eval',
    '/api/verify-empty-badge-eval',
    '/test-chat-timeout',
    '/api/ai/chat-test-timeout',
    '/api/verify-duplicate-holdings',
    '/test-duplicate-holdings',
    '/api/verify-duplicate-holding',
    '/test-duplicate-holding',
    '/test-schema',
    '/api/verify-schema',
    '/test-price-feed',
    '/test-session-expiry',
    '/api/verify-session-expiry',
    '/test-onboarding-validation',
    '/test-negative-validation',
    '/test-concurrent-edit',
    '/api/verify-concurrent-edit',
    '/test-file-size-limit',
    '/test-dashboard-kpis',
    '/api/verify-dashboard-kpis',
    '/test-budget-modes',
    '/test-sovereignty-gating',
    '/api/verify-feature-gating',
    '/test-freedom-time-labels',
    '/api/verify-freedom-time-labels',
    '/api/daily-expense-rate',
    '/api/badges/verify',
    '/api/badges/seed',
    '/test-badge-grid',
    '/test-holdings-list',
    '/api/verify-holdings-list',
    '/test-streak-indicator',
    '/api/verify-streak-indicator',
    '/test-next-step-engine',
    '/api/verify-next-step-engine',
    '/test-sparkline',
    '/api/verify-sparkline',
    '/test-fire-inputs',
    '/api/verify-fire-inputs',
    '/test-budget-trend',
    '/api/verify-budget-trend',
    '/test-discover-carousel',
    '/api/verify-discover-carousel',
    '/test-debt-trajectory',
    '/api/verify-debt-trajectory',
    '/test-ai-recommendations',
    '/api/verify-ai-recommendations',
    '/test-milestone-markers',
    '/api/verify-milestone-markers',
    '/test-portfolio-donut',
    '/api/verify-portfolio-donut',
    '/test-box3-optimization',
    '/api/verify-box3-optimization',
    '/test-resilience-score',
    '/api/verify-resilience-score',
    '/test-goal-progress-bar',
    '/api/verify-goal-progress-bar',
    '/test-collapsible-persistence',
    '/test-feature-visit-persistence',
    '/api/verify-feature-visit-persistence',
    '/test-back-button',
    '/api/verify-back-button',
    '/test-dismissed-next-step',
    '/api/verify-dismissed-next-step',
    '/test-chat-history',
    '/api/verify-chat-history',
    '/test-holding-edit-preservation',
    '/api/verify-holding-edit-preservation',
    '/test-spotlight-persistence',
    '/api/verify-spotlight-persistence',
    '/test-multi-tab',
    '/api/verify-multi-tab',
    '/test-budget-form-state',
    '/test-budget-form-state/interactive',
    '/api/verify-budget-form-state',
    '/test-dashboard-card-order',
    '/api/verify-dashboard-card-order',
    '/test-dismiss-persist',
    '/api/verify-direct-access-assets',
    '/test-direct-access-assets',
    '/test-direct-budgets',
    '/api/verify-direct-budgets',
    '/test-unauthenticated-redirect',
    '/api/verify-unauthenticated-redirect',
    '/test-malformed-holding-id',
    '/api/verify-malformed-holding-id',
    '/test-beheer-redirect',
    '/api/verify-beheer-admin-redirect',
    '/test-deleted-holding',
    '/api/verify-deleted-holding',
    '/test-direct-identity',
    '/api/verify-direct-identity',
    '/test-special-chars-url',
    '/api/verify-special-chars-url',
    '/test-bookmark-belasting',
    '/api/verify-bookmark-belasting',
    '/test-onboarding-redirect',
    '/api/verify-onboarding-redirect',
    '/test-holding-double-click',
    '/api/verify-holding-double-click',
    '/test-holding-rapid-delete',
    '/api/verify-holding-rapid-delete',
    '/test-badge-idempotency',
    '/api/verify-badge-idempotency',
    '/test-onboarding-double-submit',
    '/api/verify-onboarding-double-submit',
    '/test-double-dismiss',
    '/api/verify-double-dismiss',
    '/test-streak-idempotent',
    '/api/verify-streak-idempotent',
    '/test-duplicate-import',
    '/api/verify-duplicate-import',
    '/test-holding-submit-btn',
    '/api/verify-holding-submit-btn',
    '/test-cascade-delete',
    '/api/verify-cascade-delete',
    '/test-holding-cascade-delete',
    '/api/verify-holding-cascade-delete',
    '/test-user-reset-isolation',
    '/api/verify-user-reset-isolation',
    '/test-allocation-delete',
    '/api/verify-allocation-delete',
    '/test-completed-next-step',
    '/api/verify-completed-next-step',
    '/test-budget-category-delete',
    '/api/verify-budget-category-delete',
    '/test-asset-deletion-networth',
    '/api/verify-asset-deletion-networth',
    '/test-sold-out-holding',
    '/api/verify-sold-out-holding',
    '/test-debt-payoff-removal',
    '/api/verify-debt-payoff-removal',
    '/test-account-deletion-cascade',
    '/api/verify-account-deletion-cascade',
    '/test-new-user-empty-state',
    '/api/verify-new-user-empty-state',
    '/test-holding-defaults',
    '/api/verify-holding-defaults',
    '/test-budget-defaults',
    '/api/verify-budget-defaults',
    '/test-data-reset-full',
    '/api/verify-data-reset-full',
    '/test-privacy-default',
    '/api/verify-privacy-default',
    '/test-transaction-filters',
    '/api/verify-transaction-filters',
    '/test-collapsible-defaults',
    '/api/verify-collapsible-defaults',
    '/test-fire-scenario-defaults',
    '/api/verify-fire-scenario-defaults',
    '/test-format-with-freedom',
    '/api/verify-format-with-freedom',
    '/test-freedom-subtitles',
    '/api/verify-freedom-subtitles',
    '/test-kern-hero',
    '/api/verify-kern-hero',
    '/test-cash-freedom-time',
    '/api/verify-cash-freedom-time',
    '/test-belasting-freedom-time',
    '/api/verify-belasting-freedom-time',
    '/test-asset-freedom-time',
    '/api/verify-asset-freedom-time',
    '/test-budget-freedom-time',
    '/api/verify-budget-freedom-time',
    '/test-debt-freedom-time',
    '/api/verify-debt-freedom-time',
    '/api/verify-kern-unique-kpis',
    '/test-horizon-hero',
    '/api/verify-horizon-hero',
    '/test-dashboard-preview-metrics',
    '/api/verify-dashboard-preview-metrics',
    '/api/verify-philosophical-labels',
    '/test-philosophical-labels',
    '/test-wil-unique-lens',
    '/api/verify-wil-unique-lens',
    '/test-locked-default',
    '/api/verify-locked-default',
    '/test-freedom-days-disambiguation',
    '/api/verify-freedom-days-disambiguation',
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
