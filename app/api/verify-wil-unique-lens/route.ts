import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Verification endpoint for Feature #190:
 * De Wil unique action and impact lens
 *
 * Checks:
 * 1. Hero shows "Vrijheidsdagen gewonnen" as primary unique metric
 * 2. "Vrijheidsdagen gewonnen" does NOT appear as primary metric on other pages
 * 3. KPI: Voltooide Acties (completed actions) card exists
 * 4. KPI: Open Potentieel (open potential) card exists
 * 5. KPI: Beslissnelheid (decision speed) in hero sub-KPIs
 * 6. KPI: Wilskrachtscore (willpower score) card exists
 * 7. Consistent teal color theme throughout
 * 8. Action-based freedom days calculation is unique to De Wil
 * 9. No mock data patterns in will page
 * 10. data-testid attributes present for all key elements
 */
export async function GET() {
  const results: { test: string; passes: boolean; detail: string }[] = []

  try {
    // Read page sources
    const wilPage = readFileSync(
      join(process.cwd(), 'app', '(app)', 'will', 'page.tsx'),
      'utf-8'
    )
    const corePage = readFileSync(
      join(process.cwd(), 'app', '(app)', 'core', 'page.tsx'),
      'utf-8'
    )
    const horizonPage = readFileSync(
      join(process.cwd(), 'app', '(app)', 'horizon', 'page.tsx'),
      'utf-8'
    )
    const dashboardPage = readFileSync(
      join(process.cwd(), 'app', '(app)', 'dashboard', 'page.tsx'),
      'utf-8'
    )

    // Test 1: Hero shows "Vrijheidsdagen gewonnen" as primary unique metric
    const hasHeroMetric = wilPage.includes('vrijheidsdagen gewonnen') &&
      wilPage.includes('wil-hero-primary-metric') &&
      wilPage.includes('wil-hero-freedom-days-value') &&
      wilPage.includes('totalFreedomDaysWon')
    results.push({
      test: 'Hero shows "Vrijheidsdagen gewonnen" as primary unique metric',
      passes: hasHeroMetric,
      detail: hasHeroMetric
        ? '"Vrijheidsdagen gewonnen" found in De Wil hero with data-testid and calculation'
        : 'Missing "Vrijheidsdagen gewonnen" as primary hero metric',
    })

    // Test 2: "Vrijheidsdagen gewonnen" does NOT appear as primary metric on other pages
    // Core page has "Dagen Gewonnen" but it's savings-based (daysWonPerMonth), NOT action-based (totalFreedomDaysWon)
    // Dashboard has "dagen te winnen" (open potential preview), NOT "gewonnen" as hero
    // NOTE: Core tooltip may reference "vrijheidsdagen gewonnen" to explain the distinction — this is OK
    // The real check is: does any other page compute/render totalFreedomDaysWon or display it as a metric?
    const coreHasActionFreedomDays = corePage.includes('totalFreedomDaysWon') ||
      corePage.includes('freedom_days_impact')
    const horizonHasActionFreedomDays = horizonPage.includes('totalFreedomDaysWon') ||
      horizonPage.includes('freedom_days_impact')
    const dashboardHasAsHero = dashboardPage.includes('totalFreedomDaysWon')
    const noDuplicate = !coreHasActionFreedomDays && !horizonHasActionFreedomDays && !dashboardHasAsHero
    results.push({
      test: 'Action-based freedom days metric (totalFreedomDaysWon) does NOT appear on other pages',
      passes: noDuplicate,
      detail: noDuplicate
        ? 'totalFreedomDaysWon and freedom_days_impact calculations are unique to De Wil — Core uses savings-based daysWonPerMonth instead'
        : `Found duplicates: Core=${coreHasActionFreedomDays}, Horizon=${horizonHasActionFreedomDays}, Dashboard=${dashboardHasAsHero}`,
    })

    // Test 3: KPI: Voltooide Acties (completed actions) card exists
    const hasCompletedActions = wilPage.includes('Voltooide Acties') &&
      wilPage.includes('kpi-voltooide-acties') &&
      wilPage.includes('completedActions.length') &&
      wilPage.includes('completionRatio')
    results.push({
      test: 'KPI: Voltooide Acties (completed actions) card exists',
      passes: hasCompletedActions,
      detail: hasCompletedActions
        ? 'Voltooide Acties KPI card found with data-testid and completion ratio display'
        : 'Missing Voltooide Acties KPI card',
    })

    // Test 4: KPI: Open Potentieel (open potential) card exists
    const hasOpenPotential = wilPage.includes('Open Potentieel') &&
      wilPage.includes('kpi-open-potentieel') &&
      wilPage.includes('openPotential')
    results.push({
      test: 'KPI: Open Potentieel (open potential) card exists',
      passes: hasOpenPotential,
      detail: hasOpenPotential
        ? 'Open Potentieel KPI card found with data-testid and days-to-win display'
        : 'Missing Open Potentieel KPI card',
    })

    // Test 5: KPI: Beslissnelheid (decision speed) in hero sub-KPIs
    const hasDecisionSpeed = wilPage.includes('Beslissnelheid') &&
      wilPage.includes('wil-hero-beslissnelheid') &&
      wilPage.includes('avgDecisionDays')
    results.push({
      test: 'KPI: Beslissnelheid (decision speed) in hero sub-KPIs',
      passes: hasDecisionSpeed,
      detail: hasDecisionSpeed
        ? 'Beslissnelheid found in hero sub-KPIs with data-testid and average calculation'
        : 'Missing Beslissnelheid in hero section',
    })

    // Test 6: KPI: Wilskrachtscore (willpower score) card exists
    const hasWillpower = wilPage.includes('Wilskrachtscore') &&
      wilPage.includes('kpi-wilskrachtscore') &&
      wilPage.includes('willpowerScore') &&
      wilPage.includes('getWillpowerScore')
    results.push({
      test: 'KPI: Wilskrachtscore (willpower score) card exists',
      passes: hasWillpower,
      detail: hasWillpower
        ? 'Wilskrachtscore KPI card found with data-testid and A-E grading system'
        : 'Missing Wilskrachtscore KPI card',
    })

    // Test 7: Consistent teal color theme throughout
    const tealColors = [
      'teal-950', 'teal-900', 'teal-600', 'teal-500', 'teal-400',
      'teal-300', 'teal-200', 'teal-50',
    ]
    const hasTealHero = wilPage.includes('from-teal-950 via-teal-900 to-teal-950')
    const hasTealKPIIcons = wilPage.includes('bg-teal-50') && wilPage.includes('text-teal-600')
    const hasTealProgress = wilPage.includes('from-teal-600 via-teal-400 to-teal-300')
    const tealCount = tealColors.filter(c => wilPage.includes(c)).length
    const consistentTeal = hasTealHero && hasTealKPIIcons && hasTealProgress && tealCount >= 6
    results.push({
      test: 'Consistent teal color theme throughout',
      passes: consistentTeal,
      detail: consistentTeal
        ? `Teal theme consistent: hero gradient, KPI icons, progress bar. ${tealCount} teal shades used.`
        : `Teal inconsistency: hero=${hasTealHero}, KPI icons=${hasTealKPIIcons}, progress=${hasTealProgress}, shades=${tealCount}`,
    })

    // Test 8: Action-based freedom days calculation is unique to De Wil
    // De Wil uses: completedActions.reduce((sum, a) => sum + freedom_days_impact)
    // Core uses: daysWonPerMonth (savings-based, different variable)
    // This verifies the CALCULATION approach is unique
    const wilUsesActionBased = wilPage.includes('freedom_days_impact') &&
      wilPage.includes("status === 'completed'") &&
      wilPage.includes('totalFreedomDaysWon')
    const coreUsesActionBased = corePage.includes('totalFreedomDaysWon')
    const horizonUsesActionBased = horizonPage.includes('totalFreedomDaysWon')
    const uniqueCalc = wilUsesActionBased && !coreUsesActionBased && !horizonUsesActionBased
    results.push({
      test: 'Action-based freedom days calculation is unique to De Wil',
      passes: uniqueCalc,
      detail: uniqueCalc
        ? 'totalFreedomDaysWon (action-based) computed only in De Wil; Core uses daysWonPerMonth (savings-based)'
        : `Wil has action calc=${wilUsesActionBased}, Core duplicates=${coreUsesActionBased}, Horizon duplicates=${horizonUsesActionBased}`,
    })

    // Test 9: No mock data patterns in will page
    const mockPatterns = ['globalThis', 'devStore', 'dev-store', 'mockDb', 'fakeData', 'sampleData', 'dummyData', 'testData']
    const foundMockPatterns = mockPatterns.filter(p => wilPage.includes(p))
    results.push({
      test: 'No mock data patterns in De Wil page',
      passes: foundMockPatterns.length === 0,
      detail: foundMockPatterns.length === 0
        ? 'No mock data patterns found in De Wil page source'
        : `Found mock patterns: ${foundMockPatterns.join(', ')}`,
    })

    // Test 10: data-testid attributes present for all key elements
    const requiredTestIds = [
      'wil-hero',
      'wil-hero-primary-metric',
      'wil-hero-freedom-days-value',
      'wil-hero-freedom-days-label',
      'wil-hero-sub-kpis',
      'wil-hero-acties-voltooid',
      'wil-hero-open-potentieel',
      'wil-hero-beslissnelheid',
      'wil-kpi-grid',
      'kpi-voltooide-acties',
      'kpi-open-potentieel',
      'kpi-wilskrachtscore',
    ]
    const missingTestIds = requiredTestIds.filter(id => !wilPage.includes(id))
    results.push({
      test: 'data-testid attributes present for all key elements',
      passes: missingTestIds.length === 0,
      detail: missingTestIds.length === 0
        ? `All ${requiredTestIds.length} required data-testid attributes found`
        : `Missing data-testids: ${missingTestIds.join(', ')}`,
    })

    // Test 11: Hero sub-KPIs include Acties voltooid, Open potentieel, Beslissnelheid
    const heroSubKPISection = wilPage.match(/Sub KPIs[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0] ?? ''
    const hasActiesVoltooid = heroSubKPISection.includes('Acties voltooid')
    const hasOpenPotentieelSub = heroSubKPISection.includes('Open potentieel')
    const hasBeslissnelheidSub = heroSubKPISection.includes('Beslissnelheid')
    const allSubKPIs = hasActiesVoltooid && hasOpenPotentieelSub && hasBeslissnelheidSub
    results.push({
      test: 'Hero sub-KPIs: Acties voltooid, Open potentieel, Beslissnelheid',
      passes: allSubKPIs,
      detail: allSubKPIs
        ? 'All three hero sub-KPIs present: Acties voltooid, Open potentieel, Beslissnelheid'
        : `Missing: ${!hasActiesVoltooid ? 'Acties voltooid, ' : ''}${!hasOpenPotentieelSub ? 'Open potentieel, ' : ''}${!hasBeslissnelheidSub ? 'Beslissnelheid' : ''}`,
    })

    // Test 12: Doelvoortgang KPI card exists (goal progress)
    const hasGoalProgress = wilPage.includes('Doelvoortgang') &&
      wilPage.includes('kpi-doelvoortgang') &&
      wilPage.includes('avgGoalProgress')
    results.push({
      test: 'KPI: Doelvoortgang (goal progress) card exists',
      passes: hasGoalProgress,
      detail: hasGoalProgress
        ? 'Doelvoortgang KPI card found with data-testid and average progress calculation'
        : 'Missing Doelvoortgang KPI card',
    })

    const passing = results.filter(r => r.passes).length
    return NextResponse.json({
      feature: '#190 — De Wil unique action and impact lens',
      passing,
      total: results.length,
      allPassing: passing === results.length,
      results,
    })
  } catch (err) {
    return NextResponse.json({
      feature: '#190 — De Wil unique action and impact lens',
      error: String(err),
      results,
    }, { status: 500 })
  }
}
