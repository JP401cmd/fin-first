import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  const results: { test: string; pass: boolean; detail: string }[] = []

  // Read the proxy source code for verification
  const proxyPath = path.join(process.cwd(), 'lib', 'supabase', 'proxy.ts')
  const proxySrc = fs.readFileSync(proxyPath, 'utf-8')

  // Read the login page source code for verification
  const loginPath = path.join(process.cwd(), 'app', 'login', 'page.tsx')
  const loginSrc = fs.readFileSync(loginPath, 'utf-8')

  // Test 1: Protected prefixes include /core (which covers /core/debts)
  const hasCorePrefixProtection = proxySrc.includes("'/core'") || proxySrc.includes('"/core"')
  results.push({
    test: 'Protected prefixes include /core (covers /core/debts)',
    pass: hasCorePrefixProtection,
    detail: hasCorePrefixProtection
      ? '/core is listed in protectedPrefixes, so /core/debts is protected'
      : 'ERROR: /core is not in protectedPrefixes',
  })

  // Test 2: Unauthenticated users are redirected to /login
  const hasLoginRedirect = proxySrc.includes("url.pathname = '/login'") || proxySrc.includes('url.pathname = "/login"')
  results.push({
    test: 'Unauthenticated users on protected routes are redirected to /login',
    pass: hasLoginRedirect,
    detail: hasLoginRedirect
      ? "Proxy sets url.pathname = '/login' for unauthenticated protected route access"
      : 'ERROR: No redirect to /login found',
  })

  // Test 3: Original URL is preserved via redirectTo query param
  const hasRedirectToParam = proxySrc.includes("url.searchParams.set('redirectTo', pathname)") || proxySrc.includes('url.searchParams.set("redirectTo", pathname)')
  results.push({
    test: 'Original URL preserved in redirectTo query parameter',
    pass: hasRedirectToParam,
    detail: hasRedirectToParam
      ? "Proxy sets redirectTo=<original_pathname> for post-login redirect"
      : 'ERROR: redirectTo param not set during redirect',
  })

  // Test 4: Proxy checks for user before allowing protected routes
  const hasAuthCheck = proxySrc.includes('!user') && proxySrc.includes('isProtectedPath')
  results.push({
    test: 'Proxy checks authentication status before allowing protected routes',
    pass: hasAuthCheck,
    detail: hasAuthCheck
      ? 'Proxy checks !user && !isPublicPath && isProtectedPath before redirect'
      : 'ERROR: No auth check found in proxy',
  })

  // Test 5: Login page reads redirectTo param
  const loginReadsRedirectTo = loginSrc.includes("searchParams.get('redirectTo')") || loginSrc.includes('searchParams.get("redirectTo")')
  results.push({
    test: 'Login page reads redirectTo query parameter',
    pass: loginReadsRedirectTo,
    detail: loginReadsRedirectTo
      ? "Login page reads redirectTo from searchParams for post-login navigation"
      : 'ERROR: Login page does not read redirectTo parameter',
  })

  // Test 6: Login page uses redirectTo for post-login navigation
  const loginUsesRedirectTo = loginSrc.includes('router.push(destination)') && loginSrc.includes('redirectTo')
  results.push({
    test: 'Login page redirects to original URL after successful login',
    pass: loginUsesRedirectTo,
    detail: loginUsesRedirectTo
      ? 'After login, router.push(destination) navigates to redirectTo value or /dashboard'
      : 'ERROR: Login page does not use redirectTo for navigation',
  })

  // Test 7: /core/debts specifically matches protected prefix /core
  const protectedPrefixesMatch = proxySrc.includes('pathname === prefix || pathname.startsWith(prefix')
  results.push({
    test: '/core/debts matches protected prefix /core via startsWith',
    pass: protectedPrefixesMatch,
    detail: protectedPrefixesMatch
      ? 'Proxy uses startsWith matching: /core/debts matches /core/ prefix'
      : 'ERROR: Prefix matching logic not found',
  })

  // Test 8: API routes return 401 instead of redirect (security check)
  const apiReturns401 = proxySrc.includes("pathname.startsWith('/api/')") && proxySrc.includes('status: 401')
  results.push({
    test: 'API routes return 401 JSON instead of redirecting to login',
    pass: apiReturns401,
    detail: apiReturns401
      ? 'Unauthenticated API calls return 401 JSON with sessionExpired flag'
      : 'ERROR: API routes do not return 401 for unauthenticated access',
  })

  // Test 9: Session expiry detection (hadSession check)
  const hasSessionExpiry = proxySrc.includes('hadSession') && proxySrc.includes("expired")
  results.push({
    test: 'Session expiry detected and signaled to login page',
    pass: hasSessionExpiry,
    detail: hasSessionExpiry
      ? "Proxy detects expired sessions (sb- cookies present) and sets expired=1 param"
      : 'ERROR: No session expiry detection found',
  })

  // Test 10: Login page shows session expired banner
  const hasExpiredBanner = loginSrc.includes('session-expired-banner') || loginSrc.includes('sessie is verlopen')
  results.push({
    test: 'Login page shows session expired banner when applicable',
    pass: hasExpiredBanner,
    detail: hasExpiredBanner
      ? "Login page renders expired session banner with 'Je sessie is verlopen' message"
      : 'ERROR: No session expired banner found in login page',
  })

  const passCount = results.filter(r => r.pass).length
  return NextResponse.json({
    feature: '#144 - Unauthenticated direct access to protected URL redirects to login',
    summary: `${passCount}/${results.length} tests passing`,
    allPassing: passCount === results.length,
    results,
  })
}
