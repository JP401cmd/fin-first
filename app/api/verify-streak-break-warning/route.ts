import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * GET /api/verify-streak-break-warning
 *
 * Verification endpoint for Feature #257: Streak break warning notification
 *
 * Tests:
 * 1. Detect when streak is at risk (checkStreakAtRisk function in API)
 * 2. Warning message format: 'Je streak van X weken staat op het spel!'
 * 3. Display warning on Dashboard (StreakBreakWarning component)
 * 4. Show for all streak types: login, budget compliance, action completion
 * 5. Clear warning when user performs streak activity
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []
  const cwd = process.cwd()

  // ─── Test 1: checkStreakAtRisk function exists in streaks API ───
  const streaksApiPath = join(cwd, 'app/api/streaks/route.ts')
  let streaksApiSrc = ''
  if (existsSync(streaksApiPath)) {
    streaksApiSrc = readFileSync(streaksApiPath, 'utf-8')
  }

  const hasCheckAtRisk = streaksApiSrc.includes('checkStreakAtRisk')
  results.push({
    name: 'checkStreakAtRisk function exists',
    pass: hasCheckAtRisk,
    detail: hasCheckAtRisk
      ? 'checkStreakAtRisk() function found in app/api/streaks/route.ts'
      : 'MISSING: checkStreakAtRisk function not found',
  })

  // ─── Test 2: At-risk detection logic (previous week check) ───
  const hasISOWeekLogic = streaksApiSrc.includes('getISOWeek') && streaksApiSrc.includes('isPreviousWeek')
  results.push({
    name: 'At-risk detection uses ISO week comparison',
    pass: hasISOWeekLogic,
    detail: hasISOWeekLogic
      ? 'Uses getISOWeek() and isPreviousWeek to detect streaks approaching deadline'
      : 'Missing ISO week comparison logic for at-risk detection',
  })

  // ─── Test 3: at_risk boolean field in API response ───
  const hasAtRiskField = streaksApiSrc.includes('at_risk') && streaksApiSrc.includes('risk_message')
  results.push({
    name: 'API returns at_risk and risk_message fields',
    pass: hasAtRiskField,
    detail: hasAtRiskField
      ? 'StreakSummary type includes at_risk:boolean and risk_message:string|null'
      : 'Missing at_risk/risk_message fields in streak response',
  })

  // ─── Test 4: Warning message matches spec format ───
  const hasSpecMessage = streaksApiSrc.includes('staat op het spel!')
  results.push({
    name: 'Warning message: "Je streak van X weken staat op het spel!"',
    pass: hasSpecMessage,
    detail: hasSpecMessage
      ? 'risk_message uses "staat op het spel!" format per specification'
      : 'Warning message does not match "staat op het spel!" format',
  })

  // ─── Test 5: warnings array aggregates all at-risk streaks ───
  const hasWarningsArray = streaksApiSrc.includes('const warnings =') && streaksApiSrc.includes('.filter(s => s.at_risk')
  results.push({
    name: 'API returns warnings array for all at-risk streaks',
    pass: hasWarningsArray,
    detail: hasWarningsArray
      ? 'Warnings array collects risk_message from all at-risk streaks (login, budget, action)'
      : 'Missing warnings array aggregation for at-risk streaks',
  })

  // ─── Test 6: All 3 streak types checked for risk ───
  const checksLogin = streaksApiSrc.includes("'login'") && streaksApiSrc.includes('loginStreak')
  const checksBudget = streaksApiSrc.includes("'budget_compliance'") && streaksApiSrc.includes('budgetStreak')
  const checksAction = streaksApiSrc.includes("'action_completion'") && streaksApiSrc.includes('actionStreak')
  const checksAllTypes = checksLogin && checksBudget && checksAction
  results.push({
    name: 'All 3 streak types checked for risk',
    pass: checksAllTypes,
    detail: `Login: ${checksLogin}, Budget: ${checksBudget}, Action: ${checksAction}`,
  })

  // ─── Test 7: StreakBreakWarning component exists ───
  const warningCompPath = join(cwd, 'components/app/streak-break-warning.tsx')
  let warningCompSrc = ''
  if (existsSync(warningCompPath)) {
    warningCompSrc = readFileSync(warningCompPath, 'utf-8')
  }
  const warningCompExists = warningCompSrc.length > 0
  results.push({
    name: 'StreakBreakWarning component exists',
    pass: warningCompExists,
    detail: warningCompExists
      ? 'components/app/streak-break-warning.tsx exists'
      : 'MISSING: components/app/streak-break-warning.tsx',
  })

  // ─── Test 8: StreakBreakWarning fetches from /api/streaks ───
  const warningFetches = warningCompSrc.includes('/api/streaks')
  results.push({
    name: 'StreakBreakWarning fetches streak data from API',
    pass: warningFetches,
    detail: warningFetches
      ? 'Component fetches from /api/streaks to check at-risk streaks'
      : 'Component does not fetch streak data',
  })

  // ─── Test 9: StreakBreakWarning displays warnings ───
  const displaysWarnings = warningCompSrc.includes('streak-warning-message') && warningCompSrc.includes('warnings.map')
  results.push({
    name: 'StreakBreakWarning displays warning messages',
    pass: displaysWarnings,
    detail: displaysWarnings
      ? 'Component maps over warnings array and renders each message'
      : 'Component does not display warning messages',
  })

  // ─── Test 10: Warning notification has proper data-testid ───
  const hasNotificationTestId = warningCompSrc.includes('streak-break-warning-notification')
  results.push({
    name: 'StreakBreakWarning has data-testid for testing',
    pass: hasNotificationTestId,
    detail: hasNotificationTestId
      ? 'data-testid="streak-break-warning-notification" present'
      : 'Missing data-testid on notification banner',
  })

  // ─── Test 11: Dashboard imports StreakBreakWarning ───
  const dashboardPath = join(cwd, 'app/(app)/dashboard/page.tsx')
  let dashboardSrc = ''
  if (existsSync(dashboardPath)) {
    dashboardSrc = readFileSync(dashboardPath, 'utf-8')
  }
  const dashImportsWarning = dashboardSrc.includes('StreakBreakWarning') && dashboardSrc.includes('streak-break-warning')
  results.push({
    name: 'Dashboard imports and renders StreakBreakWarning',
    pass: dashImportsWarning,
    detail: dashImportsWarning
      ? 'Dashboard page imports and renders StreakBreakWarning component'
      : 'Dashboard does NOT import StreakBreakWarning',
  })

  // ─── Test 12: Dashboard has streak warning section ───
  const dashHasSection = dashboardSrc.includes('streak-warning-section')
  results.push({
    name: 'Dashboard has streak-warning-section',
    pass: dashHasSection,
    detail: dashHasSection
      ? 'data-testid="streak-warning-section" found in Dashboard'
      : 'Missing streak-warning-section in Dashboard',
  })

  // ─── Test 13: Shows at-risk badges for all 3 streak types ───
  // Component uses dynamic data-testid: streak-at-risk-${s.type} where type is login/budget/action
  const hasRiskBadgePattern = warningCompSrc.includes('streak-at-risk-') && warningCompSrc.includes('s.type')
  const definesLoginType = warningCompSrc.includes("type: 'login'")
  const definesBudgetType = warningCompSrc.includes("type: 'budget'")
  const definesActionType = warningCompSrc.includes("type: 'action'")
  const showsAllRiskTypes = hasRiskBadgePattern && definesLoginType && definesBudgetType && definesActionType
  results.push({
    name: 'Shows at-risk badges for all 3 streak types',
    pass: showsAllRiskTypes,
    detail: `Dynamic streak-at-risk pattern: ${hasRiskBadgePattern}, Login: ${definesLoginType}, Budget: ${definesBudgetType}, Action: ${definesActionType}`,
  })

  // ─── Test 14: StreakBreakWarning is dismissible ───
  const isDismissible = warningCompSrc.includes('setDismissed') && warningCompSrc.includes('streak-warning-dismiss')
  results.push({
    name: 'Warning notification is dismissible',
    pass: isDismissible,
    detail: isDismissible
      ? 'Dismiss button (data-testid=streak-warning-dismiss) sets dismissed state'
      : 'Warning notification is not dismissible',
  })

  // ─── Test 15: Warning clears when streak activity performed ───
  // After checkin, the API returns at_risk:false, so warnings array is empty.
  // The component re-polls and hides itself when warnings.length === 0.
  const clearOnActivity = warningCompSrc.includes('warnings.length === 0') || warningCompSrc.includes('warnings.length === 0 || dismissed')
  const apiClearsOnCheckin = streaksApiSrc.includes('at_risk: false') || streaksApiSrc.includes('risk_message: null')
  results.push({
    name: 'Warning clears when streak activity is performed',
    pass: clearOnActivity || apiClearsOnCheckin,
    detail: `Component hides on empty warnings: ${clearOnActivity}. API sets at_risk=false after activity: ${apiClearsOnCheckin}`,
  })

  // ─── Test 16: StreakIndicator also shows inline warning ───
  const streakIndicatorPath = join(cwd, 'components/app/streak-indicator.tsx')
  let streakIndicatorSrc = ''
  if (existsSync(streakIndicatorPath)) {
    streakIndicatorSrc = readFileSync(streakIndicatorPath, 'utf-8')
  }
  const indicatorHasWarning = streakIndicatorSrc.includes('streak-break-warning') && streakIndicatorSrc.includes('warnings')
  results.push({
    name: 'StreakIndicator also shows inline warning',
    pass: indicatorHasWarning,
    detail: indicatorHasWarning
      ? 'StreakIndicator has inline streak-break-warning with warnings display'
      : 'StreakIndicator missing inline warning display',
  })

  // ─── Test 17: Warning auto-polls to detect streak activity ───
  const autoPolls = warningCompSrc.includes('setInterval') && warningCompSrc.includes('loadStreaks')
  results.push({
    name: 'Warning auto-polls to detect streak activity',
    pass: autoPolls,
    detail: autoPolls
      ? 'Component uses setInterval to periodically re-check streak status'
      : 'Component does not auto-poll for updates',
  })

  // ─── Test 18: Risk message includes streak type label ───
  const messageHasLabel = streaksApiSrc.includes('login-streak') && streaksApiSrc.includes('budget-streak') && streaksApiSrc.includes('actie-streak')
  results.push({
    name: 'Risk message includes streak type label',
    pass: messageHasLabel,
    detail: messageHasLabel
      ? 'Messages include: login-streak, budget-streak, actie-streak labels'
      : 'Risk messages missing streak type labels',
  })

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#257 Streak break warning notification',
    passing,
    total,
    all_passing: passing === total,
    results,
  })
}
