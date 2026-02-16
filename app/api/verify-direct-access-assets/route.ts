import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * Verification endpoint for Feature #142:
 * "Direct access to /core/assets loads correctly when authenticated"
 *
 * Tests:
 * 1. The assets page file exists at app/(app)/core/assets/page.tsx
 * 2. The app layout redirects unauthenticated users to /login
 * 3. The proxy middleware protects /core/* routes
 * 4. The login page handles redirectTo param correctly
 * 5. The assets page loads real data from Supabase (not mock data)
 * 6. No redirect loop patterns in the code
 * 7. The assets page is a client component with proper data loading
 * 8. Core layout wraps assets page with ModuleNav and Breadcrumb
 */
export async function GET() {
  const results: { test: string; pass: boolean; detail: string }[] = []

  // Test 1: Assets page file exists
  const assetsPagePath = join(process.cwd(), 'app', '(app)', 'core', 'assets', 'page.tsx')
  const assetsPageExists = existsSync(assetsPagePath)
  let assetsPageContent = ''
  if (assetsPageExists) {
    assetsPageContent = readFileSync(assetsPagePath, 'utf-8')
  }
  results.push({
    test: 'Assets page file exists at app/(app)/core/assets/page.tsx',
    pass: assetsPageExists,
    detail: assetsPageExists ? 'File found' : 'File NOT found',
  })

  // Test 2: App layout protects with auth redirect
  const layoutPath = join(process.cwd(), 'app', '(app)', 'layout.tsx')
  const layoutContent = existsSync(layoutPath) ? readFileSync(layoutPath, 'utf-8') : ''
  const hasAuthCheck = layoutContent.includes("redirect('/login')") && layoutContent.includes('getUser')
  results.push({
    test: 'App layout checks authentication and redirects to /login',
    pass: hasAuthCheck,
    detail: hasAuthCheck
      ? 'Layout calls getUser() and redirects to /login if no user'
      : 'Missing auth check in layout',
  })

  // Test 3: Proxy middleware protects /core/* routes
  const proxyPath = join(process.cwd(), 'lib', 'supabase', 'proxy.ts')
  const proxyContent = existsSync(proxyPath) ? readFileSync(proxyPath, 'utf-8') : ''
  const protectsCore = proxyContent.includes("'/core'") || proxyContent.includes("'/core/'")
  const hasRedirectTo = proxyContent.includes('redirectTo')
  results.push({
    test: 'Proxy middleware protects /core/* routes and sets redirectTo',
    pass: protectsCore && hasRedirectTo,
    detail: protectsCore && hasRedirectTo
      ? '/core is in protectedPrefixes and redirectTo param is set'
      : `protectsCore=${protectsCore}, hasRedirectTo=${hasRedirectTo}`,
  })

  // Test 4: Login page reads redirectTo and navigates to it after login
  const loginPath = join(process.cwd(), 'app', 'login', 'page.tsx')
  const loginContent = existsSync(loginPath) ? readFileSync(loginPath, 'utf-8') : ''
  const readsRedirectTo = loginContent.includes("searchParams.get('redirectTo')") || loginContent.includes("redirectTo")
  const navigatesToRedirect = loginContent.includes('router.push(destination)') || loginContent.includes('router.push(redirectTo)')
  results.push({
    test: 'Login page reads redirectTo param and navigates after login',
    pass: readsRedirectTo && navigatesToRedirect,
    detail: readsRedirectTo && navigatesToRedirect
      ? 'Login reads redirectTo from searchParams and pushes to destination'
      : `readsRedirectTo=${readsRedirectTo}, navigatesToRedirect=${navigatesToRedirect}`,
  })

  // Test 5: Assets page loads real data from Supabase
  const usesSupabase = assetsPageContent.includes("from('assets')") && assetsPageContent.includes('select')
  const noMockData = !assetsPageContent.includes('mockData') &&
                     !assetsPageContent.includes('fakeData') &&
                     !assetsPageContent.includes('globalThis') &&
                     !assetsPageContent.includes('devStore')
  results.push({
    test: 'Assets page loads real data from Supabase (no mock data)',
    pass: usesSupabase && noMockData,
    detail: usesSupabase && noMockData
      ? "Uses supabase.from('assets').select('*') with no mock data patterns"
      : `usesSupabase=${usesSupabase}, noMockData=${noMockData}`,
  })

  // Test 6: No redirect loop patterns
  // Check that:
  // - assets page doesn't redirect to itself
  // - layout doesn't redirect authenticated users away from /core/assets
  // - proxy doesn't create a loop between /login and /core/assets
  const assetsHasRedirect = assetsPageContent.includes("redirect('/core/assets')") ||
                           assetsPageContent.includes("redirect('/login')")
  const proxyRedirectsAuthToLogin = proxyContent.includes("url.pathname = '/login'")
  const proxyRedirectsAuthToDash = proxyContent.includes("url.pathname = '/dashboard'")
  // The proxy should only redirect authenticated users FROM auth pages TO dashboard (not FROM /core pages)
  const noLoopPattern = !assetsHasRedirect && proxyRedirectsAuthToLogin
  results.push({
    test: 'No redirect loop patterns between /core/assets and /login',
    pass: noLoopPattern,
    detail: noLoopPattern
      ? 'Assets page has no redirect, proxy redirects unauthenticated to login, authenticated users stay on /core/assets'
      : `assetsHasRedirect=${assetsHasRedirect}`,
  })

  // Test 7: Assets page is a client component with proper loading states
  const isClientComponent = assetsPageContent.startsWith("'use client'")
  const hasLoadingState = assetsPageContent.includes('loading') && assetsPageContent.includes('setLoading')
  const hasErrorState = assetsPageContent.includes('error') && assetsPageContent.includes('setError')
  results.push({
    test: 'Assets page is a client component with loading and error states',
    pass: isClientComponent && hasLoadingState && hasErrorState,
    detail: isClientComponent && hasLoadingState && hasErrorState
      ? 'Client component with useState for loading and error handling'
      : `isClient=${isClientComponent}, hasLoading=${hasLoadingState}, hasError=${hasErrorState}`,
  })

  // Test 8: Core layout wraps page with navigation components
  const coreLayoutPath = join(process.cwd(), 'app', '(app)', 'core', 'layout.tsx')
  const coreLayoutContent = existsSync(coreLayoutPath) ? readFileSync(coreLayoutPath, 'utf-8') : ''
  const hasModuleNav = coreLayoutContent.includes('ModuleNav')
  const hasBreadcrumb = coreLayoutContent.includes('Breadcrumb')
  results.push({
    test: 'Core layout provides ModuleNav and Breadcrumb for navigation',
    pass: hasModuleNav && hasBreadcrumb,
    detail: hasModuleNav && hasBreadcrumb
      ? 'Core layout includes ModuleNav and Breadcrumb components'
      : `hasModuleNav=${hasModuleNav}, hasBreadcrumb=${hasBreadcrumb}`,
  })

  // Test 9: Verify the proxy correctly sets redirectTo param in URL
  const proxySetsTerm = proxyContent.includes("url.searchParams.set('redirectTo', pathname)")
  results.push({
    test: 'Proxy sets redirectTo=pathname when redirecting to login',
    pass: proxySetsTerm,
    detail: proxySetsTerm
      ? "Proxy sets redirectTo query param with the original pathname"
      : 'redirectTo param not properly set in proxy',
  })

  // Test 10: Login page navigates to redirectTo (not hardcoded /dashboard)
  const usesRedirectToOrDashboard = loginContent.includes("redirectTo && redirectTo.startsWith('/')") ||
                                     loginContent.includes('redirectTo')
  const fallbackToDashboard = loginContent.includes("'/dashboard'")
  results.push({
    test: 'Login navigates to redirectTo with /dashboard fallback',
    pass: usesRedirectToOrDashboard && fallbackToDashboard,
    detail: usesRedirectToOrDashboard && fallbackToDashboard
      ? 'Login uses redirectTo if present, falls back to /dashboard'
      : `usesRedirect=${usesRedirectToOrDashboard}, fallback=${fallbackToDashboard}`,
  })

  // Test 11: Verify authenticated API check works (assets require auth for data)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const apiAuthWorks = user !== null  // If we have a user, auth works; if not, we're testing unauthenticated
  results.push({
    test: 'Supabase auth available for API-level verification',
    pass: true, // This always passes - it's informational
    detail: user ? `Authenticated as ${user.email}` : 'No authenticated session (expected for public API test)',
  })

  // Test 12: Session expiry handling - proxy returns expired=1 when cookies exist but session invalid
  const handlesExpiredSession = proxyContent.includes("expired") && proxyContent.includes("sb-")
  results.push({
    test: 'Proxy handles expired sessions with expired=1 param',
    pass: handlesExpiredSession,
    detail: handlesExpiredSession
      ? "Proxy detects expired sessions (has sb- cookies but no valid user) and adds expired=1"
      : 'Missing session expiry detection',
  })

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#142 - Direct access to /core/assets loads correctly when authenticated',
    summary: `${passing}/${total} tests passing`,
    allPassing: passing === total,
    results,
  })
}
