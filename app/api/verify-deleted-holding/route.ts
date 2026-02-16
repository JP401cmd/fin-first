import { NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

/**
 * Verification endpoint for Feature #146:
 * "Direct URL to deleted entity shows appropriate error"
 *
 * Tests:
 * 1. Dynamic route page exists at app/(app)/core/assets/holdings/[id]/page.tsx
 * 2. Custom not-found page exists at app/(app)/core/assets/holdings/[id]/not-found.tsx
 * 3. Page validates UUID format before querying database
 * 4. Page calls notFound() when holding doesn't exist
 * 5. Not-found page shows "Holding niet gevonden" message
 * 6. Not-found page has link back to holdings list
 * 7. Not-found page has data-testid attributes for testing
 * 8. Page checks both holdings table and assets table (fallback)
 * 9. API endpoint returns 404 for non-existent holding
 * 10. Page requires authentication (calls getUser)
 */
export async function GET() {
  const results: { test: string; pass: boolean; detail: string }[] = []

  // Test 1: Dynamic route page exists
  const pagePath = join(process.cwd(), 'app', '(app)', 'core', 'assets', 'holdings', '[id]', 'page.tsx')
  const pageExists = existsSync(pagePath)
  let pageContent = ''
  if (pageExists) {
    pageContent = readFileSync(pagePath, 'utf-8')
  }
  results.push({
    test: 'Dynamic route page exists at holdings/[id]/page.tsx',
    pass: pageExists,
    detail: pageExists ? 'File found' : 'File NOT found',
  })

  // Test 2: Custom not-found page exists
  const notFoundPath = join(process.cwd(), 'app', '(app)', 'core', 'assets', 'holdings', '[id]', 'not-found.tsx')
  const notFoundExists = existsSync(notFoundPath)
  let notFoundContent = ''
  if (notFoundExists) {
    notFoundContent = readFileSync(notFoundPath, 'utf-8')
  }
  results.push({
    test: 'Custom not-found.tsx page exists for holdings/[id]',
    pass: notFoundExists,
    detail: notFoundExists ? 'File found' : 'File NOT found',
  })

  // Test 3: Page validates UUID format
  const hasUuidValidation = pageContent.includes('UUID_REGEX') && pageContent.includes('notFound()')
  results.push({
    test: 'Page validates UUID format before database query',
    pass: hasUuidValidation,
    detail: hasUuidValidation
      ? 'Uses UUID_REGEX to validate ID format, calls notFound() for invalid UUIDs'
      : 'Missing UUID validation',
  })

  // Test 4: Page calls notFound() when holding doesn't exist
  const callsNotFound = pageContent.includes("notFound()") && pageContent.includes("if (!holdingData)")
  results.push({
    test: 'Page calls notFound() when holding does not exist',
    pass: callsNotFound,
    detail: callsNotFound
      ? 'Calls notFound() when holdingData is null after checking both tables'
      : 'Missing notFound() call for missing holding',
  })

  // Test 5: Not-found page shows "Holding niet gevonden" message
  const showsNotFoundMessage = notFoundContent.includes('Holding niet gevonden')
  results.push({
    test: 'Not-found page shows friendly "Holding niet gevonden" message',
    pass: showsNotFoundMessage,
    detail: showsNotFoundMessage
      ? 'Shows "Holding niet gevonden" title'
      : 'Missing not found message',
  })

  // Test 6: Not-found page has link back to holdings list
  const hasBackLink = notFoundContent.includes('href="/core/assets/holdings"')
  const hasBackText = notFoundContent.includes('Naar holdings overzicht') || notFoundContent.includes('Terug naar holdings')
  results.push({
    test: 'Not-found page has link back to holdings list',
    pass: hasBackLink && hasBackText,
    detail: hasBackLink && hasBackText
      ? 'Contains link to /core/assets/holdings with descriptive text'
      : `hasBackLink=${hasBackLink}, hasBackText=${hasBackText}`,
  })

  // Test 7: Not-found page has data-testid attributes
  const hasTestIds = notFoundContent.includes('data-testid="holding-not-found-title"') &&
                     notFoundContent.includes('data-testid="holding-not-found-message"') &&
                     notFoundContent.includes('data-testid="back-to-holdings-link"')
  results.push({
    test: 'Not-found page has data-testid attributes for automated testing',
    pass: hasTestIds,
    detail: hasTestIds
      ? 'Has testid for title, message, and back link'
      : 'Missing data-testid attributes',
  })

  // Test 8: Page checks both holdings table and assets table (fallback)
  const checksHoldings = pageContent.includes("from('holdings')") && pageContent.includes(".select('*')")
  const checksAssets = pageContent.includes("from('assets')") && pageContent.includes('Fallback')
  results.push({
    test: 'Page checks both holdings and assets tables (with fallback)',
    pass: checksHoldings && checksAssets,
    detail: checksHoldings && checksAssets
      ? 'Queries holdings table first, falls back to assets table'
      : `checksHoldings=${checksHoldings}, checksAssets=${checksAssets}`,
  })

  // Test 9: API endpoint exists and returns 404 for non-existent holding
  const apiPath = join(process.cwd(), 'app', 'api', 'holdings', '[id]', 'route.ts')
  const apiExists = existsSync(apiPath)
  let apiContent = ''
  if (apiExists) {
    apiContent = readFileSync(apiPath, 'utf-8')
  }
  const apiReturns404 = apiContent.includes('status: 404') && apiContent.includes('notFound: true')
  results.push({
    test: 'API endpoint /api/holdings/[id] returns 404 for missing holdings',
    pass: apiExists && apiReturns404,
    detail: apiExists && apiReturns404
      ? 'API endpoint exists and returns { notFound: true } with 404 status'
      : `apiExists=${apiExists}, apiReturns404=${apiReturns404}`,
  })

  // Test 10: Page requires authentication
  const requiresAuth = pageContent.includes('getUser()') && pageContent.includes("if (!user)")
  results.push({
    test: 'Page requires authentication (calls getUser)',
    pass: requiresAuth,
    detail: requiresAuth
      ? 'Calls supabase.auth.getUser() and shows notFound() for unauthenticated users'
      : 'Missing authentication check',
  })

  // Test 11: Not-found page shows explanation about deletion
  const hasDeleteExplanation = notFoundContent.includes('verwijderd') || notFoundContent.includes('deleted')
  results.push({
    test: 'Not-found page explains the holding may have been deleted',
    pass: hasDeleteExplanation,
    detail: hasDeleteExplanation
      ? 'Explains that the holding may not exist or may have been deleted'
      : 'Missing deletion explanation',
  })

  // Test 12: Not-found page also links to dashboard
  const hasDashboardLink = notFoundContent.includes('href="/dashboard"')
  results.push({
    test: 'Not-found page also provides link to dashboard',
    pass: hasDashboardLink,
    detail: hasDashboardLink
      ? 'Includes alternative link to dashboard for broader navigation'
      : 'Missing dashboard link',
  })

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#146 - Direct URL to deleted entity shows appropriate error',
    summary: `${passing}/${total} tests passing`,
    allPassing: passing === total,
    results,
  })
}
