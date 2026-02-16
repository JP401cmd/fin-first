import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * Verification endpoint for Feature #143:
 * "Direct access to /core/budgets loads correctly"
 *
 * Tests that:
 * 1. Budget page exists at /core/budgets
 * 2. Page is a client component that fetches budget data from Supabase
 * 3. Middleware protects /core/* routes (redirects unauthenticated users to /login)
 * 4. Login page handles redirectTo parameter for post-login redirect
 * 5. App layout checks authentication and provides feature access context
 * 6. Budget page loads data via useEffect on mount (works on direct access)
 * 7. No SSR-only data fetching that would fail on direct URL access
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []
  const root = process.cwd()

  // Test 1: Budget page file exists
  const budgetPagePath = join(root, 'app', '(app)', 'core', 'budgets', 'page.tsx')
  const budgetPageExists = existsSync(budgetPagePath)
  results.push({
    name: 'Budget page exists at app/(app)/core/budgets/page.tsx',
    pass: budgetPageExists,
    detail: budgetPageExists ? 'File exists' : 'File not found',
  })

  // Test 2: Budget page is a client component (uses 'use client' directive)
  let budgetContent = ''
  if (budgetPageExists) {
    budgetContent = readFileSync(budgetPagePath, 'utf-8')
    const isClientComponent = budgetContent.startsWith("'use client'") || budgetContent.startsWith('"use client"')
    results.push({
      name: 'Budget page is a client component',
      pass: isClientComponent,
      detail: isClientComponent
        ? "'use client' directive found — page renders on client side, works on direct URL access"
        : 'Missing use client directive',
    })
  }

  // Test 3: Budget page fetches data via useEffect (not getServerSideProps)
  if (budgetContent) {
    const usesUseEffect = budgetContent.includes('useEffect')
    const usesLoadBudgets = budgetContent.includes('loadBudgets')
    const fetchesFromSupabase = budgetContent.includes("from('budgets')") || budgetContent.includes('from("budgets")')
    results.push({
      name: 'Budget page loads data via useEffect + Supabase client',
      pass: usesUseEffect && usesLoadBudgets && fetchesFromSupabase,
      detail: [
        usesUseEffect ? 'useEffect ✓' : 'useEffect ✗',
        usesLoadBudgets ? 'loadBudgets() ✓' : 'loadBudgets() ✗',
        fetchesFromSupabase ? "from('budgets') ✓" : "from('budgets') ✗",
      ].join(', '),
    })
  }

  // Test 4: Budget page has loading state (handles initial render before data)
  if (budgetContent) {
    const hasLoadingState = budgetContent.includes('loading') && budgetContent.includes('setLoading')
    const hasSpinner = budgetContent.includes('animate-spin')
    results.push({
      name: 'Budget page has loading state for initial render',
      pass: hasLoadingState && hasSpinner,
      detail: [
        hasLoadingState ? 'loading state ✓' : 'loading state ✗',
        hasSpinner ? 'spinner ✓' : 'spinner ✗',
      ].join(', '),
    })
  }

  // Test 5: Budget page has error handling
  if (budgetContent) {
    const hasErrorState = budgetContent.includes('setError') && budgetContent.includes('error')
    const hasRetryButton = budgetContent.includes('Opnieuw proberen')
    results.push({
      name: 'Budget page has error state with retry',
      pass: hasErrorState && hasRetryButton,
      detail: [
        hasErrorState ? 'error state ✓' : 'error state ✗',
        hasRetryButton ? 'retry button ✓' : 'retry button ✗',
      ].join(', '),
    })
  }

  // Test 6: Proxy middleware protects /core routes
  const proxyPath = join(root, 'lib', 'supabase', 'proxy.ts')
  const proxyExists = existsSync(proxyPath)
  let proxyContent = ''
  if (proxyExists) {
    proxyContent = readFileSync(proxyPath, 'utf-8')
    const protectsCore = proxyContent.includes("'/core'") || proxyContent.includes('"/core"')
    const redirectsToLogin = proxyContent.includes("'/login'") || proxyContent.includes('"/login"')
    const preservesRedirectTo = proxyContent.includes('redirectTo')
    results.push({
      name: 'Proxy middleware protects /core routes',
      pass: protectsCore && redirectsToLogin && preservesRedirectTo,
      detail: [
        protectsCore ? '/core protected ✓' : '/core not protected ✗',
        redirectsToLogin ? 'redirects to /login ✓' : 'no login redirect ✗',
        preservesRedirectTo ? 'preserves redirectTo ✓' : 'no redirectTo ✗',
      ].join(', '),
    })
  }

  // Test 7: Middleware sends redirectTo param when redirecting unauthenticated users
  if (proxyContent) {
    const setsRedirectTo = proxyContent.includes("searchParams.set('redirectTo', pathname)") ||
      proxyContent.includes('searchParams.set("redirectTo", pathname)')
    results.push({
      name: 'Middleware passes redirectTo=pathname when redirecting to login',
      pass: setsRedirectTo,
      detail: setsRedirectTo
        ? "Sets redirectTo=pathname for post-login redirect back to /core/budgets"
        : 'redirectTo parameter not set',
    })
  }

  // Test 8: Login page uses redirectTo for post-login navigation
  const loginPath = join(root, 'app', 'login', 'page.tsx')
  const loginExists = existsSync(loginPath)
  if (loginExists) {
    const loginContent = readFileSync(loginPath, 'utf-8')
    const readsRedirectTo = loginContent.includes('redirectTo')
    const usesRouterPush = loginContent.includes('router.push')
    const redirectsPostLogin = loginContent.includes("redirectTo && redirectTo.startsWith('/')")
    results.push({
      name: 'Login page redirects to originally requested URL after login',
      pass: readsRedirectTo && usesRouterPush && redirectsPostLogin,
      detail: [
        readsRedirectTo ? 'reads redirectTo ✓' : 'no redirectTo read ✗',
        usesRouterPush ? 'router.push ✓' : 'no router.push ✗',
        redirectsPostLogin ? 'redirect validation ✓' : 'no redirect validation ✗',
      ].join(', '),
    })
  }

  // Test 9: App layout checks auth and redirects if not authenticated
  const layoutPath = join(root, 'app', '(app)', 'layout.tsx')
  const layoutExists = existsSync(layoutPath)
  if (layoutExists) {
    const layoutContent = readFileSync(layoutPath, 'utf-8')
    const checksAuth = layoutContent.includes('getUser')
    const redirectsUnauthenticated = layoutContent.includes("redirect('/login')")
    const providesContext = layoutContent.includes('FeatureAccessProvider')
    results.push({
      name: 'App layout checks auth and provides feature access context',
      pass: checksAuth && redirectsUnauthenticated && providesContext,
      detail: [
        checksAuth ? 'getUser() ✓' : 'no getUser() ✗',
        redirectsUnauthenticated ? "redirect('/login') ✓" : 'no redirect ✗',
        providesContext ? 'FeatureAccessProvider ✓' : 'no provider ✗',
      ].join(', '),
    })
  }

  // Test 10: Budget page renders budget categories (Inkomen, Uitgaven, Sparen, Schulden)
  if (budgetContent) {
    const hasIncome = budgetContent.includes('Inkomen')
    const hasExpenses = budgetContent.includes('Uitgaven')
    const hasSavings = budgetContent.includes('Sparen')
    const hasDebt = budgetContent.includes('Schulden')
    results.push({
      name: 'Budget page renders all four budget categories',
      pass: hasIncome && hasExpenses && hasSavings && hasDebt,
      detail: [
        hasIncome ? 'Inkomen ✓' : 'Inkomen ✗',
        hasExpenses ? 'Uitgaven ✓' : 'Uitgaven ✗',
        hasSavings ? 'Sparen ✓' : 'Sparen ✗',
        hasDebt ? 'Schulden ✓' : 'Schulden ✗',
      ].join(', '),
    })
  }

  // Test 11: Budget page supports 4 view modes (works on any access pattern)
  if (budgetContent) {
    const hasTree = budgetContent.includes("'tree'") || budgetContent.includes('"tree"')
    const hasBlob = budgetContent.includes("'blob'") || budgetContent.includes('"blob"')
    const hasSankey = budgetContent.includes("'sankey'") || budgetContent.includes('"sankey"')
    const hasDonut = budgetContent.includes("'donut'") || budgetContent.includes('"donut"')
    results.push({
      name: 'Budget page supports all 4 view modes',
      pass: hasTree && hasBlob && hasSankey && hasDonut,
      detail: [
        hasTree ? 'tree ✓' : 'tree ✗',
        hasBlob ? 'blob ✓' : 'blob ✗',
        hasSankey ? 'sankey ✓' : 'sankey ✗',
        hasDonut ? 'donut ✓' : 'donut ✗',
      ].join(', '),
    })
  }

  // Test 12: Budget page auto-seeds default budgets if none exist
  if (budgetContent) {
    const hasSeedBudgets = budgetContent.includes('seedBudgets')
    const hasGetDefaultBudgets = budgetContent.includes('getDefaultBudgets')
    results.push({
      name: 'Budget page auto-seeds default budgets for new users',
      pass: hasSeedBudgets && hasGetDefaultBudgets,
      detail: [
        hasSeedBudgets ? 'seedBudgets() ✓' : 'seedBudgets() ✗',
        hasGetDefaultBudgets ? 'getDefaultBudgets() ✓' : 'getDefaultBudgets() ✗',
      ].join(', '),
    })
  }

  // Test 13: Verify runtime - unauthenticated access to /core/budgets returns redirect
  try {
    const baseUrl = `http://localhost:${process.env.PORT || 3000}`
    const response = await fetch(`${baseUrl}/core/budgets`, {
      redirect: 'manual',
      headers: { 'Accept': 'text/html' },
    })
    // Should redirect (307) to /login?redirectTo=%2Fcore%2Fbudgets
    const isRedirect = response.status === 307 || response.status === 302
    const location = response.headers.get('location') || ''
    const redirectsToLogin = location.includes('/login')
    const hasRedirectTo = location.includes('redirectTo') && (location.includes('%2Fcore%2Fbudgets') || location.includes('/core/budgets'))
    results.push({
      name: 'Runtime: unauthenticated /core/budgets redirects to login',
      pass: isRedirect && redirectsToLogin && hasRedirectTo,
      detail: `Status: ${response.status}, Location: ${location}`,
    })
  } catch (err) {
    results.push({
      name: 'Runtime: unauthenticated /core/budgets redirects to login',
      pass: false,
      detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#143: Direct access to /core/budgets loads correctly',
    summary: `${passing}/${total} checks passing`,
    allPassing: passing === total,
    results,
  })
}
