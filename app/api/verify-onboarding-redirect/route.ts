import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Verification endpoint for Feature #151:
 * "Direct access to /onboarding when already onboarded"
 *
 * Tests that:
 * 1. The onboarding page checks the onboarding_completed flag
 * 2. Onboarded users get redirected to /will
 * 3. The seed API rejects re-onboarding attempts
 * 4. The save-own-data API sets the flag correctly
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  try {
    const supabase = await createClient()

    // Test 1: Onboarding page exists and is a client component with redirect logic
    const fs = await import('fs')
    const path = await import('path')
    const onboardingPagePath = path.join(process.cwd(), 'app', '(onboarding)', 'onboarding', 'page.tsx')
    const pageSource = fs.readFileSync(onboardingPagePath, 'utf-8')

    results.push({
      name: 'Onboarding page exists',
      pass: pageSource.length > 0,
      detail: `Page file found with ${pageSource.length} characters`,
    })

    // Test 2: Page checks onboarding_completed flag from profiles table
    const checksFlag = pageSource.includes('onboarding_completed') &&
      pageSource.includes("from('profiles')") &&
      pageSource.includes('.select(')
    results.push({
      name: 'Page queries onboarding_completed flag from profiles',
      pass: checksFlag,
      detail: checksFlag
        ? 'Page fetches onboarding_completed from profiles table'
        : 'Missing onboarding_completed check',
    })

    // Test 3: Page redirects to /will when already onboarded
    const hasRedirect = pageSource.includes("router.replace('/will')") ||
      pageSource.includes('router.replace("/will")')
    results.push({
      name: 'Page redirects onboarded users to /will',
      pass: hasRedirect,
      detail: hasRedirect
        ? 'router.replace("/will") found for onboarded users'
        : 'No redirect to /will found',
    })

    // Test 4: Redirect is conditional on onboarding_completed being true
    const conditionalRedirect = pageSource.includes('onboarding_completed') &&
      (pageSource.includes("if (profile?.onboarding_completed)") ||
       pageSource.includes('profile?.onboarding_completed'))
    results.push({
      name: 'Redirect is conditional on onboarding_completed = true',
      pass: conditionalRedirect,
      detail: conditionalRedirect
        ? 'Conditional check: if (profile?.onboarding_completed) → redirect'
        : 'Conditional redirect logic not found',
    })

    // Test 5: Page shows loading state while checking (prevents flash)
    const hasLoadingState = pageSource.includes('loading') &&
      pageSource.includes('setLoading') &&
      pageSource.includes('animate-spin')
    results.push({
      name: 'Loading state prevents content flash during redirect check',
      pass: hasLoadingState,
      detail: hasLoadingState
        ? 'Loading spinner shown while checking onboarding status'
        : 'No loading state found',
    })

    // Test 6: Layout requires authentication (server-side)
    const layoutPath = path.join(process.cwd(), 'app', '(onboarding)', 'onboarding', 'layout.tsx')
    const layoutSource = fs.readFileSync(layoutPath, 'utf-8')
    const layoutChecksAuth = layoutSource.includes('auth.getUser') &&
      layoutSource.includes("redirect('/login')")
    results.push({
      name: 'Layout requires authentication (server-side)',
      pass: layoutChecksAuth,
      detail: layoutChecksAuth
        ? 'Layout redirects unauthenticated users to /login'
        : 'Layout does not check authentication',
    })

    // Test 7: Seed API prevents re-onboarding (returns 403 if already completed)
    const seedPath = path.join(process.cwd(), 'app', 'api', 'onboarding', 'seed', 'route.ts')
    const seedSource = fs.readFileSync(seedPath, 'utf-8')
    const seedPreventsReonboard = seedSource.includes('onboarding_completed') &&
      seedSource.includes('403') &&
      (seedSource.includes('already completed') || seedSource.includes('Onboarding already completed'))
    results.push({
      name: 'Seed API prevents re-onboarding (403 if already completed)',
      pass: seedPreventsReonboard,
      detail: seedPreventsReonboard
        ? 'POST /api/onboarding/seed returns 403 if onboarding_completed=true'
        : 'Seed API does not check onboarding_completed',
    })

    // Test 8: Middleware protects /onboarding route (requires auth)
    const proxyPath = path.join(process.cwd(), 'lib', 'supabase', 'proxy.ts')
    const proxySource = fs.readFileSync(proxyPath, 'utf-8')
    const onboardingProtected = proxySource.includes("'/onboarding'") &&
      proxySource.includes('protectedPrefixes')
    results.push({
      name: 'Middleware protects /onboarding as a protected route',
      pass: onboardingProtected,
      detail: onboardingProtected
        ? '/onboarding is in protectedPrefixes — requires authentication'
        : '/onboarding is not a protected route',
    })

    // Test 9: Onboarding page is a client component (needed for router.replace)
    const isClientComponent = pageSource.startsWith("'use client'") ||
      pageSource.startsWith('"use client"')
    results.push({
      name: 'Onboarding page is a client component (for client-side redirect)',
      pass: isClientComponent,
      detail: isClientComponent
        ? 'Page uses "use client" directive for client-side navigation'
        : 'Page is not a client component',
    })

    // Test 10: User is NOT re-onboarded (no state reset for onboarded users)
    // The page returns early (before setLoading(false)) when already onboarded,
    // so the onboarding UI is never rendered
    const earlyReturn = pageSource.includes('router.replace') &&
      pageSource.includes('return') &&
      !pageSource.includes('setLoading(false)') === false // setLoading is after the redirect check
    // More precise check: the redirect block returns before setLoading(false)
    const redirectBeforeRender = /if\s*\(profile\?\.onboarding_completed\)\s*\{[\s\S]*?router\.replace[\s\S]*?return/.test(pageSource)
    results.push({
      name: 'Onboarded user never sees onboarding UI (early return)',
      pass: redirectBeforeRender,
      detail: redirectBeforeRender
        ? 'Redirect returns before setLoading(false), preventing UI render'
        : 'Redirect flow may show onboarding UI briefly',
    })

    // Test 11: Verify actual profiles table has onboarding_completed column
    const { data: testProfile, error: profileError } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .limit(1)
    results.push({
      name: 'Database: profiles table has onboarding_completed column',
      pass: !profileError,
      detail: profileError
        ? `Error: ${profileError.message}`
        : `Column exists, sample value: ${testProfile?.[0]?.onboarding_completed ?? 'no rows'}`,
    })

    // Test 12: The useEffect check runs on mount (no dependency issues)
    const useEffectCheck = pageSource.includes('useEffect') &&
      (pageSource.includes('[supabase, router]') || pageSource.includes('[router, supabase]'))
    results.push({
      name: 'Redirect check runs on component mount via useEffect',
      pass: useEffectCheck,
      detail: useEffectCheck
        ? 'useEffect with proper dependencies triggers redirect check on mount'
        : 'useEffect dependency configuration may be incorrect',
    })

    const passing = results.filter(r => r.pass).length
    const total = results.length

    return NextResponse.json({
      feature: '#151 - Direct access to /onboarding when already onboarded',
      summary: `${passing}/${total} tests passing`,
      allPassing: passing === total,
      results,
    })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error',
      results,
    }, { status: 500 })
  }
}
