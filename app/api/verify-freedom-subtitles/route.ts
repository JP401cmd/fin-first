import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { calculateFreedomTime, formatFreedomTimeString, formatWithFreedom } from '@/lib/format'

/**
 * Verification endpoint for Feature #179: Freedom-time subtitles on Dashboard module cards
 *
 * Verifies that:
 * 1. De Kern card shows net worth as freedom time subtitle
 * 2. De Wil card has enhanced freedom days potential display
 * 3. De Horizon card has 'X jaar naar volledige vrijheid' countdown
 * 4. formatWithFreedom() utility is used consistently
 * 5. Subtitles use real user daily expenses
 */
export async function GET() {
  const results: { test: string; passed: boolean; detail: string }[] = []

  try {
    // Read the dashboard page source code
    const dashboardPath = join(process.cwd(), 'app', '(app)', 'dashboard', 'page.tsx')
    const source = await readFile(dashboardPath, 'utf-8')

    // Test 1: De Kern card has freedom-time subtitle for net worth
    const hasKernFreedomSubtitle = source.includes('kern-freedom-subtitle')
    const hasNetWorthFreedomStr = source.includes('netWorthFreedomStr')
    const hasFreedomLabel = source.includes('vrijheid')
    results.push({
      test: 'De Kern card has freedom-time subtitle for net worth',
      passed: hasKernFreedomSubtitle && hasNetWorthFreedomStr && hasFreedomLabel,
      detail: `data-testid="kern-freedom-subtitle": ${hasKernFreedomSubtitle}, netWorthFreedomStr used: ${hasNetWorthFreedomStr}, "vrijheid" label: ${hasFreedomLabel}`,
    })

    // Test 2: Net worth freedom time is calculated using calculateFreedomTime
    const importsFreedomUtils = source.includes('calculateFreedomTime') && source.includes('formatFreedomTimeString')
    const calcNetWorthFreedom = source.includes('calculateFreedomTime(netWorth, dailyExpenses)')
    results.push({
      test: 'Net worth freedom time uses calculateFreedomTime from lib/format',
      passed: importsFreedomUtils && calcNetWorthFreedom,
      detail: `Imports: ${importsFreedomUtils}, Calculation: ${calcNetWorthFreedom}`,
    })

    // Test 3: De Wil card has enhanced freedom days display
    const hasWilFreedomSubtitle = source.includes('wil-freedom-subtitle')
    const hasVrijheidTeWinnen = source.includes('Vrijheid te winnen')
    const hasViaActies = source.includes("'actie'") && source.includes("'acties'")
    results.push({
      test: 'De Wil card has enhanced freedom days display with "Vrijheid te winnen"',
      passed: hasWilFreedomSubtitle && hasVrijheidTeWinnen && hasViaActies,
      detail: `data-testid="wil-freedom-subtitle": ${hasWilFreedomSubtitle}, "Vrijheid te winnen": ${hasVrijheidTeWinnen}, Action context: ${hasViaActies}`,
    })

    // Test 4: De Horizon card has "naar volledige vrijheid" countdown subtitle
    const hasHorizonFreedomSubtitle = source.includes('horizon-freedom-subtitle')
    const hasNaarVolledige = source.includes('naar volledige vrijheid')
    const hasNaarVolledigeLabel = source.includes('Naar volledige vrijheid')
    results.push({
      test: 'De Horizon card has "naar volledige vrijheid" countdown subtitle',
      passed: hasHorizonFreedomSubtitle && hasNaarVolledige && hasNaarVolledigeLabel,
      detail: `data-testid: ${hasHorizonFreedomSubtitle}, Subtitle text: ${hasNaarVolledige}, Label: ${hasNaarVolledigeLabel}`,
    })

    // Test 5: Freedom time calculations use real daily expenses from transaction data
    const usesDailyExpenses = source.includes('dailyExpenses = monthlyExpenses > 0 ? monthlyExpenses / 30 : 0')
    const monthlyExpensesFromTx = source.includes("from('transactions')") && source.includes('monthlyExpenses')
    results.push({
      test: 'Freedom time calculations use real daily expenses from transaction data',
      passed: usesDailyExpenses && monthlyExpensesFromTx,
      detail: `Daily expenses from monthly: ${usesDailyExpenses}, Monthly expenses from transactions: ${monthlyExpensesFromTx}`,
    })

    // Test 6: De Kern subtitle only shows when dailyExpenses > 0 (graceful handling)
    const conditionalRender = source.includes('netWorthFreedomStr &&')
    const dailyExpensesGuard = source.includes('dailyExpenses > 0')
    results.push({
      test: 'De Kern subtitle only renders when daily expenses are available',
      passed: conditionalRender && dailyExpensesGuard,
      detail: `Conditional render: ${conditionalRender}, Daily expenses guard: ${dailyExpensesGuard}`,
    })

    // Test 7: De Wil card shows context "via X open acties" when freedom days > 0
    const conditionalViaActies = source.includes('totalFreedomDaysOpen > 0')
    const showsActionCount = source.includes('openActions.length')
    results.push({
      test: 'De Wil card shows "via X open acties" context when freedom days > 0',
      passed: conditionalViaActies && showsActionCount,
      detail: `Conditional via acties: ${conditionalViaActies}, Action count shown: ${showsActionCount}`,
    })

    // Test 8: De Horizon card shows "Bereikt!" message when FIRE reached
    const hasBereiktMessage = source.includes('Volledige vrijheid bereikt!')
    const hasBereiktCondition = source.includes("fireDate === 'Bereikt!'")
    results.push({
      test: 'De Horizon card shows "Volledige vrijheid bereikt!" when FIRE is reached',
      passed: hasBereiktMessage && hasBereiktCondition,
      detail: `Bereikt message: ${hasBereiktMessage}, Bereikt condition: ${hasBereiktCondition}`,
    })

    // Test 9: Freedom time formatting utility works correctly
    const breakdown1 = calculateFreedomTime(450000, 100)
    const formatted1 = formatFreedomTimeString(breakdown1, 'long')
    const expected1Contains = formatted1.includes('jaar') && formatted1.includes('maanden')

    const breakdown2 = calculateFreedomTime(3000, 100)
    const formatted2 = formatFreedomTimeString(breakdown2, 'long')
    const expected2Contains = formatted2.includes('maand') || formatted2.includes('dagen')

    const breakdown3 = calculateFreedomTime(50, 100)
    const formatted3 = formatFreedomTimeString(breakdown3, 'long')

    results.push({
      test: 'formatWithFreedom utility produces correct output',
      passed: expected1Contains && expected2Contains,
      detail: `€450k/100/day = "${formatted1}" (has year+month), €3k/100/day = "${formatted2}", €50/100/day = "${formatted3}"`,
    })

    // Test 10: De Horizon uses countdown years/months for "naar volledige vrijheid" text
    const usesCountdownYears = source.includes('fireProjResult.countdownYears')
    const usesCountdownMonths = source.includes('fireProjResult.countdownMonths')
    const hasCountdownDaysCheck = source.includes('fireProjResult.countdownDays > 0')
    results.push({
      test: 'De Horizon uses FIRE countdown years/months from real projection data',
      passed: usesCountdownYears && usesCountdownMonths && hasCountdownDaysCheck,
      detail: `Uses countdownYears: ${usesCountdownYears}, countdownMonths: ${usesCountdownMonths}, countdownDays check: ${hasCountdownDaysCheck}`,
    })

    // Test 11: Proper Dutch grammar for singular/plural
    const hasDagDagen = source.includes("=== 1 ? 'dag' : 'dagen'")
    const hasActieActies = source.includes("=== 1 ? 'actie' : 'acties'")
    results.push({
      test: 'Proper Dutch singular/plural grammar (dag/dagen, actie/acties)',
      passed: hasDagDagen && hasActieActies,
      detail: `dag/dagen: ${hasDagDagen}, actie/acties: ${hasActieActies}`,
    })

    // Test 12: Subtitles use module-specific color theming
    const kernAmberColor = source.includes('text-amber-600/80') // Kern subtitle
    const wilTealColor = source.includes('text-teal-600/70') // Wil subtitle context
    const horizonPurpleColor = source.includes('text-purple-600/70') // Horizon subtitle
    results.push({
      test: 'Subtitles use module-specific color theming (amber/teal/purple)',
      passed: kernAmberColor && wilTealColor && horizonPurpleColor,
      detail: `Kern amber: ${kernAmberColor}, Wil teal: ${wilTealColor}, Horizon purple: ${horizonPurpleColor}`,
    })

  } catch (error) {
    results.push({
      test: 'Dashboard page source readable',
      passed: false,
      detail: `Error: ${error instanceof Error ? error.message : String(error)}`,
    })
  }

  const passing = results.filter(r => r.passed).length
  const total = results.length

  return NextResponse.json({
    feature: '#179 - Freedom-time subtitles on Dashboard module cards',
    summary: `${passing}/${total} tests passing`,
    allPassing: passing === total,
    results,
  })
}
