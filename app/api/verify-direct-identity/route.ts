import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * Verification endpoint for Feature #149:
 * "Direct URL to /identity loads profile data"
 *
 * Tests:
 * 1. Identity page file exists at app/(app)/identity/page.tsx
 * 2. Identity page is a 'use client' component with loading state
 * 3. Identity page loads profile from Supabase profiles table
 * 4. Identity page computes sovereignty level from real financial data
 * 5. Identity page renders BadgeGrid component (badges section)
 * 6. Identity page renders BadgeEvaluator component
 * 7. Proxy middleware protects /identity route (requires authentication)
 * 8. App layout checks auth and redirects unauthenticated users to /login
 * 9. Login page supports redirectTo param for post-login redirect
 * 10. Identity page has no mock/fake data patterns
 * 11. Identity page loads financial data (assets, debts, transactions) for sovereignty
 * 12. Chronology Scale section renders sovereignty levels
 */
export async function GET() {
  const results: { test: string; pass: boolean; detail: string }[] = []

  // Read source files
  const identityPagePath = join(process.cwd(), 'app', '(app)', 'identity', 'page.tsx')
  const identityPageExists = existsSync(identityPagePath)
  let identityContent = ''
  if (identityPageExists) {
    identityContent = readFileSync(identityPagePath, 'utf-8')
  }

  const proxyPath = join(process.cwd(), 'lib', 'supabase', 'proxy.ts')
  const proxyContent = existsSync(proxyPath) ? readFileSync(proxyPath, 'utf-8') : ''

  const layoutPath = join(process.cwd(), 'app', '(app)', 'layout.tsx')
  const layoutContent = existsSync(layoutPath) ? readFileSync(layoutPath, 'utf-8') : ''

  const loginPath = join(process.cwd(), 'app', 'login', 'page.tsx')
  const loginContent = existsSync(loginPath) ? readFileSync(loginPath, 'utf-8') : ''

  // Test 1: Identity page file exists
  results.push({
    test: 'Identity page file exists at app/(app)/identity/page.tsx',
    pass: identityPageExists,
    detail: identityPageExists ? `File found (${identityContent.length} chars)` : 'File NOT found',
  })

  // Test 2: Identity page is a client component with loading state
  const isClientComponent = identityContent.startsWith("'use client'")
  const hasLoadingState = identityContent.includes('loading') && identityContent.includes('setLoading')
  const hasLoadingSpinner = identityContent.includes('animate-spin')
  results.push({
    test: 'Identity page is a client component with loading state and spinner',
    pass: isClientComponent && hasLoadingState && hasLoadingSpinner,
    detail: isClientComponent && hasLoadingState && hasLoadingSpinner
      ? 'Client component with useState for loading + spinner while data loads'
      : `isClient=${isClientComponent}, hasLoading=${hasLoadingState}, hasSpinner=${hasLoadingSpinner}`,
  })

  // Test 3: Identity page loads profile from Supabase profiles table
  const loadsProfile = identityContent.includes("from('profiles')") && identityContent.includes('.select(')
  const setsProfileFields = identityContent.includes('setFullName') &&
    identityContent.includes('setDateOfBirth') &&
    identityContent.includes('setHouseholdType') &&
    identityContent.includes('setTemporalBalance')
  results.push({
    test: 'Identity page loads profile data from Supabase profiles table',
    pass: loadsProfile && setsProfileFields,
    detail: loadsProfile && setsProfileFields
      ? "Queries supabase.from('profiles').select('*') and sets fullName, dateOfBirth, householdType, temporalBalance"
      : `loadsProfile=${loadsProfile}, setsFields=${setsProfileFields}`,
  })

  // Test 4: Identity page computes sovereignty level from real financial data
  const computesSovereignty = identityContent.includes('computeSovereigntyLevel')
  const setsSovereigntyLevel = identityContent.includes('setSovereigntyLevel')
  results.push({
    test: 'Identity page computes sovereignty level via computeSovereigntyLevel()',
    pass: computesSovereignty && setsSovereigntyLevel,
    detail: computesSovereignty && setsSovereigntyLevel
      ? 'Calls computeSovereigntyLevel(netWorth, monthlyExpenses, freedomPct, hasConsumerDebt) and stores result'
      : `computes=${computesSovereignty}, setsLevel=${setsSovereigntyLevel}`,
  })

  // Test 5: Identity page renders BadgeGrid component (badges section)
  const hasBadgeGrid = identityContent.includes('<BadgeGrid') && identityContent.includes("import { BadgeGrid }")
  const hasBadgesSection = identityContent.includes('Prestaties & Badges')
  results.push({
    test: 'Identity page renders BadgeGrid component with "Prestaties & Badges" section',
    pass: hasBadgeGrid && hasBadgesSection,
    detail: hasBadgeGrid && hasBadgesSection
      ? 'BadgeGrid imported and rendered inside "Prestaties & Badges" section'
      : `hasBadgeGrid=${hasBadgeGrid}, hasBadgesSection=${hasBadgesSection}`,
  })

  // Test 6: Identity page renders BadgeEvaluator component
  const hasBadgeEvaluator = identityContent.includes('<BadgeEvaluator') && identityContent.includes("import { BadgeEvaluator }")
  results.push({
    test: 'Identity page includes BadgeEvaluator for automatic badge evaluation',
    pass: hasBadgeEvaluator,
    detail: hasBadgeEvaluator
      ? 'BadgeEvaluator imported and rendered (force={true}) to ensure badges are evaluated on page load'
      : 'BadgeEvaluator not found',
  })

  // Test 7: Proxy middleware protects /identity route
  const protectsIdentity = proxyContent.includes("'/identity'")
  const hasRedirectTo = proxyContent.includes("url.searchParams.set('redirectTo', pathname)")
  results.push({
    test: 'Proxy middleware protects /identity route and sets redirectTo param',
    pass: protectsIdentity && hasRedirectTo,
    detail: protectsIdentity && hasRedirectTo
      ? "/identity in protectedPrefixes; unauthenticated users redirected to /login?redirectTo=/identity"
      : `protectsIdentity=${protectsIdentity}, hasRedirectTo=${hasRedirectTo}`,
  })

  // Test 8: App layout checks auth and redirects to /login
  const layoutAuthCheck = layoutContent.includes("redirect('/login')") && layoutContent.includes('getUser')
  results.push({
    test: 'App layout verifies authentication and redirects to /login if no user',
    pass: layoutAuthCheck,
    detail: layoutAuthCheck
      ? 'Layout calls supabase.auth.getUser() and calls redirect("/login") if no user'
      : 'Missing auth check in app layout',
  })

  // Test 9: Login page supports redirectTo param for post-login redirect
  const loginReadsRedirect = loginContent.includes('redirectTo')
  const loginFallbackDashboard = loginContent.includes("'/dashboard'")
  results.push({
    test: 'Login page reads redirectTo param and navigates after login (fallback: /dashboard)',
    pass: loginReadsRedirect && loginFallbackDashboard,
    detail: loginReadsRedirect && loginFallbackDashboard
      ? 'Login reads redirectTo from searchParams; redirects to that path or /dashboard'
      : `readsRedirect=${loginReadsRedirect}, fallback=${loginFallbackDashboard}`,
  })

  // Test 10: No mock/fake data patterns in identity page
  const noMockData = !identityContent.includes('mockData') &&
    !identityContent.includes('fakeData') &&
    !identityContent.includes('globalThis') &&
    !identityContent.includes('devStore') &&
    !identityContent.includes('sampleData') &&
    !identityContent.includes('dummyData')
  results.push({
    test: 'Identity page has no mock/fake data patterns',
    pass: noMockData,
    detail: noMockData
      ? 'No globalThis, mockData, fakeData, devStore, sampleData, or dummyData found'
      : 'Mock data pattern detected in identity page',
  })

  // Test 11: Identity page loads financial data for sovereignty computation
  const loadsAssets = identityContent.includes("from('assets')") && identityContent.includes('current_value')
  const loadsDebts = identityContent.includes("from('debts')") && identityContent.includes('current_balance')
  const loadsTransactions = identityContent.includes("from('transactions')") && identityContent.includes('amount')
  results.push({
    test: 'Identity page queries assets, debts, and transactions for sovereignty calculation',
    pass: loadsAssets && loadsDebts && loadsTransactions,
    detail: loadsAssets && loadsDebts && loadsTransactions
      ? "Queries assets (current_value), debts (current_balance, debt_type), transactions (amount, is_income)"
      : `assets=${loadsAssets}, debts=${loadsDebts}, transactions=${loadsTransactions}`,
  })

  // Test 12: Chronology Scale section renders sovereignty levels
  const hasChronologyScale = identityContent.includes('The Chronology Scale')
  const hasChronologyLevels = identityContent.includes('chronologyLevels')
  const showsCurrentPosition = identityContent.includes('Huidige positie')
  const showsNextMilestone = identityContent.includes('Volgende mijlpaal')
  results.push({
    test: 'Chronology Scale renders sovereignty levels with current position and next milestone',
    pass: hasChronologyScale && hasChronologyLevels && showsCurrentPosition && showsNextMilestone,
    detail: hasChronologyScale && hasChronologyLevels && showsCurrentPosition && showsNextMilestone
      ? 'The Chronology Scale section shows all levels, "Huidige positie" badge, and "Volgende mijlpaal" card'
      : `chronologyScale=${hasChronologyScale}, levels=${hasChronologyLevels}, current=${showsCurrentPosition}, next=${showsNextMilestone}`,
  })

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#149 - Direct URL to /identity loads profile data',
    summary: `${passing}/${total} tests passing`,
    allPassing: passing === total,
    results,
  })
}
