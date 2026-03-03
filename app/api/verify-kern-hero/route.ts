import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Verification endpoint for Feature #180:
 * Freedom-time in De Kern overview hero
 *
 * Checks:
 * 1. Net worth metric has freedom-time subtitle ("dat is X jaar en Y maanden vrijheid")
 * 2. "Verwachte FIRE" metric is removed from De Kern overview
 * 3. "Vrijheidstijd opgebouwd" unique Kern metric exists
 * 4. Hero section uses correct amber color theme
 * 5. Freedom time calculations are based on real daily expenses (computeCoreData uses real transactions)
 * 6. No mock data patterns in production code
 * 7. Autonomie score replaces FIRE display
 * 8. FreedomTimeBadge import is cleaned (no unused imports)
 */
export async function GET() {
  const results: { test: string; passes: boolean; detail: string }[] = []

  try {
    // Read the core page source
    const corePage = readFileSync(
      join(process.cwd(), 'app', '(app)', 'core', 'page.tsx'),
      'utf-8'
    )

    // Read the core-metrics (computeCoreData) source
    const mockData = readFileSync(
      join(process.cwd(), 'lib', 'core-metrics.ts'),
      'utf-8'
    )

    // Test 1: Net worth has freedom-time subtitle
    const hasNetWorthSubtitle = corePage.includes('dat is') &&
      corePage.includes('jaar en') &&
      corePage.includes('maanden vrijheid') &&
      corePage.includes('net-worth-freedom-subtitle')
    results.push({
      test: 'Net worth has freedom-time subtitle',
      passes: hasNetWorthSubtitle,
      detail: hasNetWorthSubtitle
        ? 'Found "dat is X jaar en Y maanden vrijheid" subtitle under net worth with data-testid'
        : 'Missing freedom-time subtitle for net worth',
    })

    // Test 2: "Verwachte FIRE" is removed from hero
    const hasVerwachteFIRE = corePage.includes('Verwachte FIRE')
    results.push({
      test: 'Verwachte FIRE removed from De Kern',
      passes: !hasVerwachteFIRE,
      detail: !hasVerwachteFIRE
        ? '"Verwachte FIRE" correctly removed from De Kern overview (belongs to Horizon only)'
        : '"Verwachte FIRE" still present in De Kern - should be removed',
    })

    // Test 3: "Vrijheidstijd opgebouwd" metric exists
    const hasVrijheidstijdOpgebouwd = corePage.includes('Vrijheidstijd opgebouwd') &&
      corePage.includes('vrijheidstijd-opgebouwd')
    results.push({
      test: 'Vrijheidstijd opgebouwd metric exists',
      passes: hasVrijheidstijdOpgebouwd,
      detail: hasVrijheidstijdOpgebouwd
        ? '"Vrijheidstijd opgebouwd" unique Kern metric found with data-testid'
        : 'Missing "Vrijheidstijd opgebouwd" metric',
    })

    // Test 4: Hero uses amber color theme
    const hasAmberTheme = corePage.includes('from-amber-950') &&
      corePage.includes('via-amber-900') &&
      corePage.includes('to-amber-950') &&
      corePage.includes('text-amber-300')
    results.push({
      test: 'Hero uses amber color theme',
      passes: hasAmberTheme,
      detail: hasAmberTheme
        ? 'Hero section uses correct amber gradient and text colors'
        : 'Hero section missing expected amber color classes',
    })

    // Test 5: Freedom time uses real daily expenses (not hardcoded)
    const usesRealExpenses = mockData.includes('yearlyExpenses > 0') &&
      mockData.includes('netWorth / yearlyExpenses') &&
      corePage.includes('computeCoreData') &&
      corePage.includes("from('transactions')")
    results.push({
      test: 'Freedom time based on real daily expenses',
      passes: usesRealExpenses,
      detail: usesRealExpenses
        ? 'computeCoreData calculates freedom time from real transaction data (netWorth / yearlyExpenses)'
        : 'Freedom time calculation may not be based on real expenses',
    })

    // Test 6: No mock data patterns
    const mockPatterns = ['globalThis', 'devStore', 'dev-store', 'mockDb', 'fakeData', 'sampleData', 'dummyData']
    const foundMockPatterns = mockPatterns.filter(p => corePage.includes(p))
    results.push({
      test: 'No mock data patterns in core page',
      passes: foundMockPatterns.length === 0,
      detail: foundMockPatterns.length === 0
        ? 'No mock data patterns found in core page source'
        : `Found mock patterns: ${foundMockPatterns.join(', ')}`,
    })

    // Test 7: Autonomie score replaces FIRE in hero grid
    const hasAutonomieScore = corePage.includes('Autonomiescore') &&
      corePage.includes('data.autonomyScore') &&
      corePage.includes('vrije dagen/jaar')
    results.push({
      test: 'Autonomie score replaces FIRE in hero',
      passes: hasAutonomieScore,
      detail: hasAutonomieScore
        ? 'Autonomiescore metric found in hero grid with free days per year detail'
        : 'Missing Autonomiescore metric in hero grid',
    })

    // Test 8: Clean imports (no unused FreedomTimeLabel)
    const hasFreedomTimeLabelImport = corePage.includes('FreedomTimeLabel')
    const hasFreedomTimeLabelUsage = corePage.includes('<FreedomTimeLabel')
    const importClean = !hasFreedomTimeLabelImport || hasFreedomTimeLabelUsage
    results.push({
      test: 'Clean imports (no unused imports)',
      passes: importClean,
      detail: importClean
        ? 'No unused FreedomTimeLabel import found'
        : 'FreedomTimeLabel is imported but never used as a component',
    })

    // Test 9: Hero has 3-column grid layout
    const hasThreeColumnGrid = corePage.includes('sm:grid-cols-3')
    results.push({
      test: 'Hero maintains 3-column grid layout',
      passes: hasThreeColumnGrid,
      detail: hasThreeColumnGrid
        ? 'Hero grid still uses sm:grid-cols-3 layout'
        : 'Hero grid layout changed from 3 columns',
    })

    // Test 10: Freedom time subtitle shows years conditionally
    const hasConditionalYears = corePage.includes("freedomYears > 0 ? `${data.freedomYears} jaar en `")
    results.push({
      test: 'Freedom subtitle conditionally shows years',
      passes: hasConditionalYears,
      detail: hasConditionalYears
        ? 'Years are only shown when > 0 (e.g., "dat is 3 maanden vrijheid" when 0 years)'
        : 'Freedom subtitle does not handle zero years case',
    })

    const passing = results.filter(r => r.passes).length
    return NextResponse.json({
      feature: '#180 — Freedom-time in De Kern overview hero',
      passing,
      total: results.length,
      allPassing: passing === results.length,
      results,
    })
  } catch (err) {
    return NextResponse.json({
      feature: '#180 — Freedom-time in De Kern overview hero',
      error: String(err),
      results,
    }, { status: 500 })
  }
}
