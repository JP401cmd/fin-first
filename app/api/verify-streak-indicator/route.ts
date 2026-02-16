import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * GET /api/verify-streak-indicator
 *
 * Verification endpoint for Feature #119: Streak indicator shows real streak count.
 * Checks that:
 * 1. StreakIndicator component exists
 * 2. It fetches from GET /api/streaks
 * 3. It renders fire emoji and count from API data
 * 4. It calls POST /api/streaks/checkin for check-in
 * 5. Dashboard page imports and renders StreakIndicator
 * 6. GET /api/streaks endpoint exists and requires auth
 * 7. POST /api/streaks/checkin endpoint exists and requires auth
 */
export async function GET(request: NextRequest) {
  const results: Record<string, boolean> = {}
  const details: Record<string, string> = {}

  // Test 1: StreakIndicator component exists
  const componentPath = join(process.cwd(), 'components/app/streak-indicator.tsx')
  const componentExists = existsSync(componentPath)
  results['streak_indicator_component_exists'] = componentExists
  details['streak_indicator_component_exists'] = componentExists
    ? 'components/app/streak-indicator.tsx exists'
    : 'MISSING: components/app/streak-indicator.tsx'

  // Test 2: Component fetches from /api/streaks
  let componentSource = ''
  if (componentExists) {
    componentSource = readFileSync(componentPath, 'utf-8')
  }
  const fetchesStreakApi = componentSource.includes('/api/streaks')
  results['fetches_streak_api'] = fetchesStreakApi
  details['fetches_streak_api'] = fetchesStreakApi
    ? 'Component fetches from /api/streaks'
    : 'Component does NOT fetch from /api/streaks'

  // Test 3: Component renders fire emoji and count
  const hasFireEmoji = componentSource.includes('🔥')
  const hasStreakCount = componentSource.includes('streak-count') || componentSource.includes('current_count')
  const rendersFireAndCount = hasFireEmoji && hasStreakCount
  results['renders_fire_emoji_and_count'] = rendersFireAndCount
  details['renders_fire_emoji_and_count'] = rendersFireAndCount
    ? 'Component renders 🔥 emoji and streak count'
    : `Fire emoji: ${hasFireEmoji}, Count display: ${hasStreakCount}`

  // Test 4: Component calls POST /api/streaks/checkin
  const callsCheckin = componentSource.includes('/api/streaks/checkin') && componentSource.includes('POST')
  results['calls_checkin_endpoint'] = callsCheckin
  details['calls_checkin_endpoint'] = callsCheckin
    ? 'Component calls POST /api/streaks/checkin'
    : 'Component does NOT call POST /api/streaks/checkin'

  // Test 5: Dashboard imports StreakIndicator
  const dashboardPath = join(process.cwd(), 'app/(app)/dashboard/page.tsx')
  let dashboardSource = ''
  if (existsSync(dashboardPath)) {
    dashboardSource = readFileSync(dashboardPath, 'utf-8')
  }
  const dashboardImportsStreak = dashboardSource.includes('StreakIndicator') && dashboardSource.includes('streak-indicator')
  results['dashboard_imports_streak_indicator'] = dashboardImportsStreak
  details['dashboard_imports_streak_indicator'] = dashboardImportsStreak
    ? 'Dashboard page imports and uses StreakIndicator'
    : 'Dashboard does NOT import StreakIndicator'

  // Derive base URL from the incoming request
  const reqUrl = new URL(request.url)
  const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`

  // Test 6: GET /api/streaks requires auth (401 for unauthenticated)
  let getStreaksAuth = false
  try {
    const res = await fetch(`${baseUrl}/api/streaks`, {
      headers: { 'Cookie': '' },
    })
    getStreaksAuth = res.status === 401
    details['get_streaks_requires_auth'] = `GET /api/streaks → ${res.status} (expect 401)`
  } catch (err) {
    details['get_streaks_requires_auth'] = `Error: ${err instanceof Error ? err.message : 'unknown'}`
  }
  results['get_streaks_requires_auth'] = getStreaksAuth

  // Test 7: POST /api/streaks/checkin requires auth (401 for unauthenticated)
  let postCheckinAuth = false
  try {
    const res = await fetch(`${baseUrl}/api/streaks/checkin`, {
      method: 'POST',
      headers: { 'Cookie': '' },
    })
    postCheckinAuth = res.status === 401
    details['post_checkin_requires_auth'] = `POST /api/streaks/checkin → ${res.status} (expect 401)`
  } catch (err) {
    details['post_checkin_requires_auth'] = `Error: ${err instanceof Error ? err.message : 'unknown'}`
  }
  results['post_checkin_requires_auth'] = postCheckinAuth

  // Test 8: Component uses 'use client' directive (required for interactivity)
  const isClientComponent = componentSource.startsWith("'use client'") || componentSource.startsWith('"use client"')
  results['is_client_component'] = isClientComponent
  details['is_client_component'] = isClientComponent
    ? 'Component is a client component (use client)'
    : 'Component is NOT a client component'

  // Test 9: Component updates streak after checkin (state update pattern)
  const updatesAfterCheckin = componentSource.includes('setStreak') && componentSource.includes('handleCheckin')
  results['updates_after_checkin'] = updatesAfterCheckin
  details['updates_after_checkin'] = updatesAfterCheckin
    ? 'Component updates streak state after checkin'
    : 'Component does NOT update after checkin'

  const allPass = Object.values(results).every(v => v)

  return NextResponse.json({
    feature: '#119 - Streak indicator shows real streak count',
    all_pass: allPass,
    results,
    details,
    summary: {
      total: Object.keys(results).length,
      passed: Object.values(results).filter(v => v).length,
      failed: Object.values(results).filter(v => !v).length,
    },
  })
}
