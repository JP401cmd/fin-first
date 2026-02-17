import { NextResponse } from 'next/server'
import {
  computeNetWorthProjection,
  formatProjectedValue,
  getProjectionMessage,
} from '@/lib/net-worth-projection'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Verification endpoint for Feature #224: Net worth growth projection
 *
 * Tests all 6 feature steps:
 * 1. Calculate net worth growth trajectory from current data
 * 2. Create projection chart for 1-5 year horizon
 * 3. Show on De Kern overview page
 * 4. Add FIRE target comparison line
 * 5. Display contextual message with projected values
 * 6. Differentiate from Horizon's long-term FIRE projection
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  function test(name: string, fn: () => { pass: boolean; detail: string }) {
    try {
      const result = fn()
      results.push({ name, ...result })
    } catch (err) {
      results.push({ name, pass: false, detail: `Error: ${String(err)}` })
    }
  }

  // ── Step 1: Calculate net worth growth trajectory ──

  test('1a. Projection computes 61 data points (0 + 60 months)', () => {
    const proj = computeNetWorthProjection(100000, 2000, 750000)
    const pass = proj.points.length === 61
    return { pass, detail: `Got ${proj.points.length} points` }
  })

  test('1b. Projection uses compound growth model', () => {
    const proj = computeNetWorthProjection(100000, 2000, 0, 0.12) // 12% for clear growth
    // Month 1: 100000 * 1.01 + 2000 = 103000
    const month1 = proj.points[1].netWorth
    const expected = 100000 * (1 + 0.12 / 12) + 2000
    const pass = Math.abs(month1 - expected) < 1
    return { pass, detail: `Month 1: ${month1.toFixed(2)}, expected: ${expected.toFixed(2)}` }
  })

  test('1c. Growing projection detected correctly', () => {
    const proj = computeNetWorthProjection(100000, 2000, 750000)
    return { pass: proj.isGrowing === true, detail: `isGrowing=${proj.isGrowing}` }
  })

  test('1d. Declining projection detected correctly', () => {
    const proj = computeNetWorthProjection(100000, -3000, 750000) // spending more than earning
    return { pass: proj.isGrowing === false, detail: `isGrowing=${proj.isGrowing}, year5=${proj.year5.toFixed(0)}` }
  })

  test('1e. Year milestones extracted correctly', () => {
    const proj = computeNetWorthProjection(100000, 2000, 750000)
    const y1 = proj.year1
    const y3 = proj.year3
    const y5 = proj.year5
    const pass = y1 > 100000 && y3 > y1 && y5 > y3
    return { pass, detail: `1yr=${y1.toFixed(0)}, 3yr=${y3.toFixed(0)}, 5yr=${y5.toFixed(0)}` }
  })

  // ── Step 2: Projection chart for 1-5 year horizon ──

  test('2a. NetWorthProjectionChart component exists', () => {
    const componentPath = path.join(process.cwd(), 'components/app/net-worth-projection-chart.tsx')
    const exists = fs.existsSync(componentPath)
    let hasSvg = false
    if (exists) {
      const content = fs.readFileSync(componentPath, 'utf8')
      hasSvg = content.includes('<svg') && content.includes('viewBox')
    }
    return { pass: exists && hasSvg, detail: `exists=${exists}, hasSvg=${hasSvg}` }
  })

  test('2b. Chart handles data point hover tooltips', () => {
    const componentPath = path.join(process.cwd(), 'components/app/net-worth-projection-chart.tsx')
    const content = fs.readFileSync(componentPath, 'utf8')
    const hasHover = content.includes('hoveredPoint') && content.includes('setHoveredPoint')
    return { pass: hasHover, detail: `hasHover=${hasHover}` }
  })

  test('2c. Chart shows year markers (1j-5j)', () => {
    const componentPath = path.join(process.cwd(), 'components/app/net-worth-projection-chart.tsx')
    const content = fs.readFileSync(componentPath, 'utf8')
    const hasYearMarkers = content.includes('yearMarkers') && content.includes('`${m / 12}j`')
    return { pass: hasYearMarkers, detail: `hasYearMarkers=${hasYearMarkers}` }
  })

  // ── Step 3: Show on De Kern overview page ──

  test('3a. Projection integrated on De Kern page', () => {
    const pagePath = path.join(process.cwd(), 'app/(app)/core/page.tsx')
    const content = fs.readFileSync(pagePath, 'utf8')
    const hasImport = content.includes('NetWorthProjectionChart')
    const hasSection = content.includes('kern-nw-projection-section')
    return { pass: hasImport && hasSection, detail: `hasImport=${hasImport}, hasSection=${hasSection}` }
  })

  test('3b. Projection wrapped in CollapsibleSection', () => {
    const pagePath = path.join(process.cwd(), 'app/(app)/core/page.tsx')
    const content = fs.readFileSync(pagePath, 'utf8')
    const hasCollapsible = content.includes('storageKey="kern_nw_projection"')
    const hasTitle = content.includes('Vermogensprognose')
    return { pass: hasCollapsible && hasTitle, detail: `hasCollapsible=${hasCollapsible}, hasTitle=${hasTitle}` }
  })

  test('3c. Projection uses real computed data (not mock)', () => {
    const pagePath = path.join(process.cwd(), 'app/(app)/core/page.tsx')
    const content = fs.readFileSync(pagePath, 'utf8')
    const usesComputation = content.includes('computeNetWorthProjection') && content.includes('setNwProjection')
    const noMock = !content.includes('mockProjection') && !content.includes('fakeProjection')
    return { pass: usesComputation && noMock, detail: `usesComputation=${usesComputation}, noMock=${noMock}` }
  })

  // ── Step 4: FIRE target comparison line ──

  test('4a. FIRE target line rendered in chart', () => {
    const componentPath = path.join(process.cwd(), 'components/app/net-worth-projection-chart.tsx')
    const content = fs.readFileSync(componentPath, 'utf8')
    const hasFireLine = content.includes('fire-target-line') && content.includes('FIRE')
    return { pass: hasFireLine, detail: `hasFireLine=${hasFireLine}` }
  })

  test('4b. FIRE reached marker shown when target hit', () => {
    const proj = computeNetWorthProjection(500000, 5000, 600000)
    const pass = proj.fireReachedMonth !== null && proj.fireReachedMonth <= 60
    return { pass, detail: `fireReachedMonth=${proj.fireReachedMonth}` }
  })

  test('4c. FIRE not reached when target is far away', () => {
    const proj = computeNetWorthProjection(10000, 500, 5000000)
    return { pass: proj.fireReachedMonth === null, detail: `fireReachedMonth=${proj.fireReachedMonth}` }
  })

  // ── Step 5: Contextual message ──

  test('5a. Growing message includes 5-year projection amount', () => {
    const proj = computeNetWorthProjection(100000, 2000, 750000)
    const msg = getProjectionMessage(proj)
    const pass = msg.includes('Op dit tempo bereik je') && msg.includes('over 5 jaar')
    return { pass, detail: msg }
  })

  test('5b. Declining message shows warning', () => {
    const proj = computeNetWorthProjection(100000, -3000, 750000)
    const msg = getProjectionMessage(proj)
    const pass = msg.includes('Let op') && msg.includes('daalt')
    return { pass, detail: msg }
  })

  test('5c. FIRE reached message shows timeframe', () => {
    const proj = computeNetWorthProjection(500000, 5000, 600000)
    const msg = getProjectionMessage(proj)
    const pass = msg.includes('volledige vrijheid')
    return { pass, detail: msg }
  })

  test('5d. formatProjectedValue formats correctly', () => {
    const v1 = formatProjectedValue(125000)
    const v2 = formatProjectedValue(1250000)
    const pass = v1.includes('125.000') && v2.includes('1,3M')
    return { pass, detail: `125k="${v1}", 1.25M="${v2}"` }
  })

  // ── Step 6: Differentiate from Horizon ──

  test('6a. Feature gated separately from Horizon projection', () => {
    const pagePath = path.join(process.cwd(), 'app/(app)/core/page.tsx')
    const content = fs.readFileSync(pagePath, 'utf8')
    const hasKernGate = content.includes('featureId="vermogensprognose_kern"')
    return { pass: hasKernGate, detail: `hasKernGate=${hasKernGate}` }
  })

  test('6b. Feature registered in feature-phases.ts', () => {
    const phasesPath = path.join(process.cwd(), 'lib/feature-phases.ts')
    const content = fs.readFileSync(phasesPath, 'utf8')
    const hasDef = content.includes('vermogensprognose_kern')
    const hasMatrix = content.includes('vermogensprognose_kern') && content.includes('stability: true')
    return { pass: hasDef && hasMatrix, detail: `hasDef=${hasDef}, hasMatrix=${hasMatrix}` }
  })

  test('6c. Kern projection is 5-year (short-term), not 30-year', () => {
    const proj = computeNetWorthProjection(100000, 2000, 750000)
    const maxMonth = Math.max(...proj.points.map(p => p.month))
    const pass = maxMonth === 60 // 5 years, not 360 (30 years)
    return { pass, detail: `maxMonth=${maxMonth} (5 years = 60 months)` }
  })

  // Summary
  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#224 Net worth growth projection',
    passing,
    total,
    percentage: ((passing / total) * 100).toFixed(1),
    results,
  })
}
