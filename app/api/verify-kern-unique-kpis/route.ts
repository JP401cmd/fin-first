import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Verification endpoint for Feature #188:
 * De Kern unique financial foundation lens
 *
 * Checks:
 * 1. Hero shows "Vrijheidstijd opgebouwd" as primary unique metric
 * 2. "Verwachte FIRE" KPI is NOT on De Kern page
 * 3. No duplicate "Vrijheidspercentage" KPI card on De Kern
 * 4. "Vermogensgroei" (net worth growth trend) KPI card exists
 * 5. De Kern keeps: Net worth (hero), savings rate (KPI), free days/year (KPI), autonomy score (KPI)
 * 6. No KPIs duplicate what appears on Horizon page
 * 7. Vermogensgroei KPI uses real snapshot data (not mock)
 * 8. KPI grid has correct data-testid attributes
 */
export async function GET() {
  const results: { test: string; passes: boolean; detail: string }[] = []

  try {
    // Read the core page source
    const corePage = readFileSync(
      join(process.cwd(), 'app', '(app)', 'core', 'page.tsx'),
      'utf-8'
    )

    // Read the horizon page source for comparison
    const horizonPage = readFileSync(
      join(process.cwd(), 'app', '(app)', 'horizon', 'page.tsx'),
      'utf-8'
    )

    // Test 1: Hero shows "Vrijheidstijd opgebouwd" as primary unique metric
    const hasVrijheidstijdOpgebouwd = corePage.includes('Vrijheidstijd opgebouwd') &&
      corePage.includes('vrijheidstijd-opgebouwd') &&
      corePage.includes('freedomYears') &&
      corePage.includes('freedomMonths')
    results.push({
      test: 'Hero shows "Vrijheidstijd opgebouwd" as primary unique metric',
      passes: hasVrijheidstijdOpgebouwd,
      detail: hasVrijheidstijdOpgebouwd
        ? '"Vrijheidstijd opgebouwd" found in hero with data-testid and freedom time display'
        : 'Missing "Vrijheidstijd opgebouwd" metric in hero',
    })

    // Test 2: "Verwachte FIRE" KPI is NOT on De Kern page
    const hasVerwachteFIRE = corePage.includes('Verwachte FIRE')
    results.push({
      test: '"Verwachte FIRE" KPI removed from De Kern',
      passes: !hasVerwachteFIRE,
      detail: !hasVerwachteFIRE
        ? '"Verwachte FIRE" correctly absent from De Kern (belongs to Horizon only)'
        : '"Verwachte FIRE" still present on De Kern page - should be removed',
    })

    // Test 3: No duplicate "Vrijheidspercentage" KPI card
    // Freedom percentage should be in hero only (as main % display), NOT as a separate KPI card
    // Check: "Vrijheidspercentage" should NOT appear as a KPI label on De Kern
    const kpiSectionMatch = corePage.match(/KPI Stat Cards[\s\S]*?<\/section>/)
    const kpiSection = kpiSectionMatch ? kpiSectionMatch[0] : ''
    const hasVrijheidspercentageKPI = kpiSection.includes('Vrijheidspercentage')
    results.push({
      test: 'No duplicate "Vrijheidspercentage" KPI card',
      passes: !hasVrijheidspercentageKPI,
      detail: !hasVrijheidspercentageKPI
        ? 'No "Vrijheidspercentage" KPI card found - correctly shown in hero only'
        : '"Vrijheidspercentage" found as a separate KPI card - should not be duplicated',
    })

    // Test 4: "Vermogensgroei" KPI card exists
    const hasVermogensgroei = corePage.includes('Vermogensgroei') &&
      corePage.includes('kpi-vermogensgroei') &&
      kpiSection.includes('Vermogensgroei')
    results.push({
      test: '"Vermogensgroei" KPI card exists as unique Kern metric',
      passes: hasVermogensgroei,
      detail: hasVermogensgroei
        ? '"Vermogensgroei" KPI card found in KPI grid with data-testid'
        : 'Missing "Vermogensgroei" KPI card in De Kern KPI section',
    })

    // Test 5: De Kern keeps required KPIs
    const hasDagenGewonnen = kpiSection.includes('Dagen Gewonnen') || kpiSection.includes('kpi-dagen-gewonnen')
    const hasSpaarquote = kpiSection.includes('Spaarquote') || kpiSection.includes('kpi-spaarquote')
    const hasVrijeDagen = kpiSection.includes('Vrije Dagen per Jaar') || kpiSection.includes('kpi-vrije-dagen')
    const hasAutonomieScore = kpiSection.includes('Autonomie Score') || kpiSection.includes('kpi-autonomie-score')
    const hasNetWorthInHero = corePage.includes('Netto vermogen')
    const allKept = hasDagenGewonnen && hasSpaarquote && hasVrijeDagen && hasAutonomieScore && hasNetWorthInHero
    results.push({
      test: 'De Kern keeps required KPIs (net worth, savings rate, free days/year, autonomy score)',
      passes: allKept,
      detail: allKept
        ? `All required KPIs present: Dagen Gewonnen=${hasDagenGewonnen}, Spaarquote=${hasSpaarquote}, Vrije Dagen=${hasVrijeDagen}, Autonomie=${hasAutonomieScore}, Netto vermogen=${hasNetWorthInHero}`
        : `Missing KPIs: ${!hasDagenGewonnen ? 'Dagen Gewonnen, ' : ''}${!hasSpaarquote ? 'Spaarquote, ' : ''}${!hasVrijeDagen ? 'Vrije Dagen, ' : ''}${!hasAutonomieScore ? 'Autonomie Score, ' : ''}${!hasNetWorthInHero ? 'Netto vermogen' : ''}`,
    })

    // Test 6: No KPIs duplicate Horizon page
    // Horizon has: Vrijheidsleeftijd, Aftellen, Vrijheidspercentage, FIRE stats
    // These should NOT be in De Kern KPI section
    const horizonKPILabels = ['Vrijheidsleeftijd', 'Aftellen', 'Vrijheidspercentage']
    const duplicatedKPIs = horizonKPILabels.filter(label => kpiSection.includes(label))
    results.push({
      test: 'No KPIs duplicate Horizon page',
      passes: duplicatedKPIs.length === 0,
      detail: duplicatedKPIs.length === 0
        ? 'No Horizon KPIs (Vrijheidsleeftijd, Aftellen, Vrijheidspercentage) found in De Kern KPI section'
        : `Found duplicated Horizon KPIs in De Kern: ${duplicatedKPIs.join(', ')}`,
    })

    // Test 7: Vermogensgroei uses real snapshot data
    const usesSnapshots = corePage.includes('netWorthGrowth') &&
      corePage.includes('net_worth_snapshots') &&
      corePage.includes('snapshot_date') &&
      !corePage.includes('mockGrowth') &&
      !corePage.includes('fakeGrowth')
    results.push({
      test: 'Vermogensgroei uses real snapshot data (not mock)',
      passes: usesSnapshots,
      detail: usesSnapshots
        ? 'Vermogensgroei calculated from real net_worth_snapshots data'
        : 'Vermogensgroei may not use real snapshot data',
    })

    // Test 8: KPI grid has correct data-testid attributes
    const hasKPIGridTestId = corePage.includes('kern-kpi-grid')
    const hasAllKPITestIds = corePage.includes('kpi-dagen-gewonnen') &&
      corePage.includes('kpi-spaarquote') &&
      corePage.includes('kpi-vrije-dagen') &&
      corePage.includes('kpi-autonomie-score') &&
      corePage.includes('kpi-vermogensgroei')
    results.push({
      test: 'KPI grid has correct data-testid attributes',
      passes: hasKPIGridTestId && hasAllKPITestIds,
      detail: hasKPIGridTestId && hasAllKPITestIds
        ? 'All KPI cards and grid have proper data-testid attributes for testing'
        : `Missing data-testids: grid=${hasKPIGridTestId}, all cards=${hasAllKPITestIds}`,
    })

    // Test 9: Vermogensgroei has fallback for no snapshots
    const hasFallback = corePage.includes('maak minimaal 2 snapshots') ||
      corePage.includes('minimaal 2 snapshot')
    results.push({
      test: 'Vermogensgroei has fallback for insufficient snapshots',
      passes: hasFallback,
      detail: hasFallback
        ? 'Shows helpful message when less than 2 snapshots available'
        : 'Missing fallback state for insufficient snapshot data',
    })

    // Test 10: No mock data patterns in core page
    const mockPatterns = ['globalThis', 'devStore', 'dev-store', 'mockDb', 'fakeData', 'sampleData', 'dummyData']
    const foundMockPatterns = mockPatterns.filter(p => corePage.includes(p))
    results.push({
      test: 'No mock data patterns in core page',
      passes: foundMockPatterns.length === 0,
      detail: foundMockPatterns.length === 0
        ? 'No mock data patterns found in core page source'
        : `Found mock patterns: ${foundMockPatterns.join(', ')}`,
    })

    const passing = results.filter(r => r.passes).length
    return NextResponse.json({
      feature: '#188 — De Kern unique financial foundation lens',
      passing,
      total: results.length,
      allPassing: passing === results.length,
      results,
    })
  } catch (err) {
    return NextResponse.json({
      feature: '#188 — De Kern unique financial foundation lens',
      error: String(err),
      results,
    }, { status: 500 })
  }
}
