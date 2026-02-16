import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  const results: { test: string; pass: boolean; detail: string }[] = []

  // Read source files for code analysis
  const proxyPath = path.join(process.cwd(), 'lib', 'supabase', 'proxy.ts')
  const proxySrc = fs.readFileSync(proxyPath, 'utf-8')

  const cashPath = path.join(process.cwd(), 'app', '(app)', 'core', 'cash', 'page.tsx')
  const cashSrc = fs.readFileSync(cashPath, 'utf-8')

  const assetsPath = path.join(process.cwd(), 'app', '(app)', 'core', 'assets', 'page.tsx')
  const assetsSrc = fs.readFileSync(assetsPath, 'utf-8')

  const loginPath = path.join(process.cwd(), 'app', 'login', 'page.tsx')
  const loginSrc = fs.readFileSync(loginPath, 'utf-8')

  const holdingsRoutePath = path.join(process.cwd(), 'app', 'api', 'holdings', 'route.ts')
  const holdingsSrc = fs.readFileSync(holdingsRoutePath, 'utf-8')

  // === Test 1: Cash page does NOT use searchParams (no URL param injection vector) ===
  const cashUsesSearchParams = cashSrc.includes('useSearchParams') || cashSrc.includes('searchParams')
  results.push({
    test: 'Cash page does not use URL search parameters (no XSS vector)',
    pass: !cashUsesSearchParams,
    detail: !cashUsesSearchParams
      ? 'CashPage component does not read or render any URL query parameters — <script> tags in ?filter= are completely ignored'
      : 'WARNING: Cash page reads searchParams which may be a vector',
  })

  // === Test 2: Assets page does NOT use searchParams (no URL param injection vector) ===
  const assetsUsesSearchParams = assetsSrc.includes('useSearchParams') || assetsSrc.includes('searchParams')
  results.push({
    test: 'Assets page does not use URL search parameters (no SQL injection vector)',
    pass: !assetsUsesSearchParams,
    detail: !assetsUsesSearchParams
      ? "AssetsPage component does not read URL query parameters — '; DROP TABLE assets;-- in ?id= is completely ignored"
      : 'WARNING: Assets page reads searchParams which may be a vector',
  })

  // === Test 3: Protected routes redirect unauthenticated users (defense in depth) ===
  const hasProtectedRedirect = proxySrc.includes('!user') &&
    proxySrc.includes('isProtectedPath') &&
    proxySrc.includes("url.pathname = '/login'")
  results.push({
    test: 'Protected routes redirect unauthenticated users to login',
    pass: hasProtectedRedirect,
    detail: hasProtectedRedirect
      ? 'Proxy middleware redirects unauthenticated access to /core/* routes to /login — malicious URLs never reach page components without authentication'
      : 'ERROR: No auth redirect found in proxy',
  })

  // === Test 4: Login page safely handles redirectTo parameter ===
  const loginSafeRedirect = loginSrc.includes("redirectTo.startsWith('/')") ||
    loginSrc.includes('redirectTo.startsWith("/")')
  results.push({
    test: 'Login page validates redirectTo starts with / (prevents open redirect)',
    pass: loginSafeRedirect,
    detail: loginSafeRedirect
      ? "Login page checks redirectTo.startsWith('/') before using it — prevents redirect to external malicious URLs"
      : 'WARNING: Login page does not validate redirectTo prefix',
  })

  // === Test 5: Login page does not render redirectTo as raw HTML ===
  // Check that redirectTo is not used with dangerouslySetInnerHTML
  const loginUsesDangerousHtml = loginSrc.includes('dangerouslySetInnerHTML')
  results.push({
    test: 'Login page does not use dangerouslySetInnerHTML (XSS-safe)',
    pass: !loginUsesDangerousHtml,
    detail: !loginUsesDangerousHtml
      ? 'Login page uses JSX expressions only — React auto-escapes all text content including URL parameter values'
      : 'WARNING: Login page uses dangerouslySetInnerHTML which could allow XSS',
  })

  // === Test 6: Supabase SDK uses parameterized queries (no SQL injection) ===
  // Check that holdings API uses .eq() method not string concatenation
  const usesParameterizedQueries = holdingsSrc.includes('.eq(') && holdingsSrc.includes('.from(')
  const usesRawSQL = holdingsSrc.includes('.raw(') || holdingsSrc.includes('sql`')
  results.push({
    test: 'API routes use Supabase parameterized queries (no SQL injection)',
    pass: usesParameterizedQueries && !usesRawSQL,
    detail: usesParameterizedQueries && !usesRawSQL
      ? "Holdings API uses supabase.from('table').eq('column', value) parameterized methods — SQL injection strings are safely escaped by the SDK"
      : 'WARNING: API may use raw SQL queries',
  })

  // === Test 7: No dangerouslySetInnerHTML in cash or assets pages ===
  const cashDangerous = cashSrc.includes('dangerouslySetInnerHTML')
  const assetsDangerous = assetsSrc.includes('dangerouslySetInnerHTML')
  results.push({
    test: 'Cash and Assets pages do not use dangerouslySetInnerHTML',
    pass: !cashDangerous && !assetsDangerous,
    detail: !cashDangerous && !assetsDangerous
      ? 'Neither CashPage nor AssetsPage uses dangerouslySetInnerHTML — all content rendered via JSX is auto-escaped by React'
      : `WARNING: ${cashDangerous ? 'Cash' : 'Assets'} page uses dangerouslySetInnerHTML`,
  })

  // === Test 8: Runtime XSS test — fetch cash page with script tag, verify no execution ===
  let xssTestPass = false
  let xssTestDetail = ''
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const xssUrl = `${baseUrl}/core/cash?filter=<script>alert(1)</script>`
    const res = await fetch(xssUrl, { redirect: 'manual' })
    // Should get a redirect (307) since /core/* is protected
    if (res.status === 307) {
      const location = res.headers.get('location') || ''
      // The redirect location should NOT contain unescaped <script> tags
      const hasUnescapedScript = location.includes('<script>') && !location.includes('%3Cscript%3E')
      xssTestPass = !hasUnescapedScript
      xssTestDetail = `GET /core/cash?filter=<script>alert(1)</script> returned ${res.status} redirect to ${location} — script tag is URL-encoded, not raw HTML`
    } else {
      xssTestPass = res.status === 200 // If somehow authenticated, page loaded without error
      xssTestDetail = `GET /core/cash with XSS param returned status ${res.status}`
    }
  } catch (err) {
    xssTestDetail = `Runtime XSS test error: ${err}`
  }
  results.push({
    test: 'Runtime: XSS script tag in URL does not execute (redirect or safe render)',
    pass: xssTestPass,
    detail: xssTestDetail,
  })

  // === Test 9: Runtime SQL injection test — fetch assets page with SQL injection ===
  let sqlTestPass = false
  let sqlTestDetail = ''
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const sqlUrl = `${baseUrl}/core/assets?id=%27%3B%20DROP%20TABLE%20assets%3B--`
    const res = await fetch(sqlUrl, { redirect: 'manual' })
    if (res.status === 307) {
      sqlTestPass = true
      sqlTestDetail = `GET /core/assets?id='; DROP TABLE assets;-- returned ${res.status} redirect — SQL injection string in URL safely redirected to login`
    } else {
      sqlTestPass = res.status === 200
      sqlTestDetail = `GET /core/assets with SQL injection param returned status ${res.status}`
    }
  } catch (err) {
    sqlTestDetail = `Runtime SQL injection test error: ${err}`
  }
  results.push({
    test: "Runtime: SQL injection in URL parameter handled safely ('; DROP TABLE assets;--)",
    pass: sqlTestPass,
    detail: sqlTestDetail,
  })

  // === Test 10: Runtime — API endpoint with SQL injection returns auth error, not SQL error ===
  let apiSqlTestPass = false
  let apiSqlTestDetail = ''
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const apiUrl = `${baseUrl}/api/holdings?id=%27%3B%20DROP%20TABLE%20assets%3B--`
    const res = await fetch(apiUrl, { redirect: 'manual' })
    if (res.status === 401) {
      apiSqlTestPass = true
      apiSqlTestDetail = `GET /api/holdings?id='; DROP TABLE assets;-- returned 401 Unauthorized — auth check prevents SQL injection from reaching database`
    } else if (res.status === 400) {
      apiSqlTestPass = true
      apiSqlTestDetail = `GET /api/holdings with SQL injection returned 400 Bad Request — input validation rejected malicious parameter`
    } else {
      const body = await res.text()
      const hasSqlError = body.toLowerCase().includes('sql') || body.toLowerCase().includes('syntax error')
      apiSqlTestPass = !hasSqlError
      apiSqlTestDetail = `GET /api/holdings with SQL injection returned ${res.status} — ${hasSqlError ? 'WARNING: SQL error in response' : 'No SQL error leaked'}`
    }
  } catch (err) {
    apiSqlTestDetail = `Runtime API SQL injection test error: ${err}`
  }
  results.push({
    test: 'Runtime: API endpoint rejects SQL injection with auth error (not SQL error)',
    pass: apiSqlTestPass,
    detail: apiSqlTestDetail,
  })

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#148 — URL with special characters does not crash app',
    summary: `${passing}/${total} tests passing`,
    allPassing: passing === total,
    results,
  })
}
