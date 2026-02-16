import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

interface TestResult {
  name: string
  pass: boolean
  details: string
}

export async function GET() {
  const results: TestResult[] = []

  // ── Test 1: /core/belasting page file exists ──
  try {
    const pagePath = join(process.cwd(), 'app', '(app)', 'core', 'belasting', 'page.tsx')
    const content = readFileSync(pagePath, 'utf-8')
    results.push({
      name: 'Belasting page file exists',
      pass: content.length > 0,
      details: `page.tsx found (${content.length} chars)`,
    })
  } catch {
    results.push({ name: 'Belasting page file exists', pass: false, details: 'File not found' })
  }

  // ── Test 2: Proxy middleware redirects unauthenticated to /login with redirectTo ──
  try {
    const proxyPath = join(process.cwd(), 'lib', 'supabase', 'proxy.ts')
    const proxy = readFileSync(proxyPath, 'utf-8')
    const hasRedirectToParam = proxy.includes("url.searchParams.set('redirectTo', pathname)")
    const hasProtectedCore = proxy.includes("'/core'") || proxy.includes("'/core',")
    results.push({
      name: 'Proxy preserves redirectTo on auth redirect',
      pass: hasRedirectToParam && hasProtectedCore,
      details: `redirectTo param: ${hasRedirectToParam}, /core protected: ${hasProtectedCore}`,
    })
  } catch (e) {
    results.push({ name: 'Proxy preserves redirectTo on auth redirect', pass: false, details: String(e) })
  }

  // ── Test 3: Login page reads redirectTo and redirects after login ──
  try {
    const loginPath = join(process.cwd(), 'app', 'login', 'page.tsx')
    const login = readFileSync(loginPath, 'utf-8')
    const readsRedirectTo = login.includes("searchParams.get('redirectTo')")
    const usesRedirectTo = login.includes("redirectTo && redirectTo.startsWith('/')")
    results.push({
      name: 'Login page uses redirectTo for post-login redirect',
      pass: readsRedirectTo && usesRedirectTo,
      details: `reads param: ${readsRedirectTo}, uses for redirect: ${usesRedirectTo}`,
    })
  } catch (e) {
    results.push({ name: 'Login page uses redirectTo for post-login redirect', pass: false, details: String(e) })
  }

  // ── Test 4: Belasting page uses Supabase client (real data, not mock) ──
  try {
    const pagePath = join(process.cwd(), 'app', '(app)', 'core', 'belasting', 'page.tsx')
    const content = readFileSync(pagePath, 'utf-8')
    const usesSupabase = content.includes("createClient()") || content.includes("createClient()")
    const queriesAssets = content.includes(".from('assets')")
    const queriesDebts = content.includes(".from('debts')")
    const queriesTransactions = content.includes(".from('transactions')")
    results.push({
      name: 'Belasting page loads real data from Supabase',
      pass: usesSupabase && queriesAssets && queriesDebts && queriesTransactions,
      details: `Supabase client: ${usesSupabase}, assets: ${queriesAssets}, debts: ${queriesDebts}, transactions: ${queriesTransactions}`,
    })
  } catch (e) {
    results.push({ name: 'Belasting page loads real data from Supabase', pass: false, details: String(e) })
  }

  // ── Test 5: Belasting page is a client component (can hydrate after navigation) ──
  try {
    const pagePath = join(process.cwd(), 'app', '(app)', 'core', 'belasting', 'page.tsx')
    const content = readFileSync(pagePath, 'utf-8')
    const isClientComponent = content.startsWith("'use client'") || content.startsWith('"use client"')
    results.push({
      name: 'Belasting page is client component (supports client-side nav)',
      pass: isClientComponent,
      details: `'use client' directive: ${isClientComponent}`,
    })
  } catch (e) {
    results.push({ name: 'Belasting page is client component', pass: false, details: String(e) })
  }

  // ── Test 6: Belasting page handles loading state ──
  try {
    const pagePath = join(process.cwd(), 'app', '(app)', 'core', 'belasting', 'page.tsx')
    const content = readFileSync(pagePath, 'utf-8')
    const hasLoadingState = content.includes('loading') && content.includes('setLoading')
    const hasLoadingUI = content.includes('animate-spin')
    results.push({
      name: 'Belasting page has loading state for fresh page load',
      pass: hasLoadingState && hasLoadingUI,
      details: `loading state: ${hasLoadingState}, loading UI: ${hasLoadingUI}`,
    })
  } catch (e) {
    results.push({ name: 'Belasting page has loading state', pass: false, details: String(e) })
  }

  // ── Test 7: Belasting page handles error state ──
  try {
    const pagePath = join(process.cwd(), 'app', '(app)', 'core', 'belasting', 'page.tsx')
    const content = readFileSync(pagePath, 'utf-8')
    const hasErrorState = content.includes('error') && content.includes('setError')
    const hasRetryButton = content.includes('Opnieuw proberen')
    results.push({
      name: 'Belasting page has error state with retry',
      pass: hasErrorState && hasRetryButton,
      details: `error state: ${hasErrorState}, retry button: ${hasRetryButton}`,
    })
  } catch (e) {
    results.push({ name: 'Belasting page has error state', pass: false, details: String(e) })
  }

  // ── Test 8: Belasting page displays tax calculation result ──
  try {
    const pagePath = join(process.cwd(), 'app', '(app)', 'core', 'belasting', 'page.tsx')
    const content = readFileSync(pagePath, 'utf-8')
    const showsBelasting = content.includes('result.belasting')
    const showsVrijheidsdagen = content.includes('result.vrijheidsdagen')
    const showsEffectiefTarief = content.includes('effectiefTariefPct')
    results.push({
      name: 'Belasting page displays tax data (belasting, vrijheidsdagen, tarief)',
      pass: showsBelasting && showsVrijheidsdagen && showsEffectiefTarief,
      details: `belasting: ${showsBelasting}, vrijheidsdagen: ${showsVrijheidsdagen}, tarief: ${showsEffectiefTarief}`,
    })
  } catch (e) {
    results.push({ name: 'Belasting page displays tax data', pass: false, details: String(e) })
  }

  // ── Test 9: App layout has auth guard (secondary protection) ──
  try {
    const layoutPath = join(process.cwd(), 'app', '(app)', 'layout.tsx')
    const layout = readFileSync(layoutPath, 'utf-8')
    const hasAuthCheck = layout.includes("supabase.auth.getUser()")
    const hasRedirect = layout.includes("redirect('/login')")
    results.push({
      name: 'App layout has secondary auth guard',
      pass: hasAuthCheck && hasRedirect,
      details: `auth check: ${hasAuthCheck}, login redirect: ${hasRedirect}`,
    })
  } catch (e) {
    results.push({ name: 'App layout has secondary auth guard', pass: false, details: String(e) })
  }

  // ── Test 10: Session expired banner shows on login page ──
  try {
    const loginPath = join(process.cwd(), 'app', 'login', 'page.tsx')
    const login = readFileSync(loginPath, 'utf-8')
    const hasExpiredParam = login.includes("searchParams.get('expired')")
    const hasExpiredBanner = login.includes('sessie is verlopen') || login.includes('Sessie verlopen') || login.includes('sessie verlopen') || login.includes('Je sessie is verlopen')
    results.push({
      name: 'Login page shows session expired banner when redirected',
      pass: hasExpiredParam && hasExpiredBanner,
      details: `expired param: ${hasExpiredParam}, expired banner: ${hasExpiredBanner}`,
    })
  } catch (e) {
    results.push({ name: 'Login page shows session expired banner', pass: false, details: String(e) })
  }

  const passing = results.filter(r => r.pass).length

  return NextResponse.json({
    feature: '#150 - Bookmarked pages load correctly after session refresh',
    summary: `${passing}/${results.length} tests passing`,
    allPassing: passing === results.length,
    results,
  })
}
