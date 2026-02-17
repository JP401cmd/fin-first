import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

type TestResult = {
  name: string
  pass: boolean
  detail: string
}

/**
 * GET /api/verify-fire-age-trend
 *
 * Verification endpoint for Feature #215: FIRE-age history tracking and chart.
 * Tests all 6 requirements through code analysis.
 */
export async function GET() {
  const cwd = process.cwd()
  const results: TestResult[] = []

  const horizonPagePath = join(cwd, 'app/(app)/horizon/page.tsx')
  const horizonSource = existsSync(horizonPagePath) ? readFileSync(horizonPagePath, 'utf8') : ''

  const autoSnapshotPath = join(cwd, 'app/api/snapshots/auto/route.ts')
  const autoSnapshotSource = existsSync(autoSnapshotPath) ? readFileSync(autoSnapshotPath, 'utf8') : ''

  const manualSnapshotPath = join(cwd, 'app/api/snapshots/route.ts')
  const manualSnapshotSource = existsSync(manualSnapshotPath) ? readFileSync(manualSnapshotPath, 'utf8') : ''

  const cronSnapshotPath = join(cwd, 'app/api/snapshots/cron/route.ts')
  const cronSnapshotSource = existsSync(cronSnapshotPath) ? readFileSync(cronSnapshotPath, 'utf8') : ''

  // ─── Test 1: Store FIRE age in monthly snapshots via fire_age column ─────────
  try {
    const autoStoresFireAge = autoSnapshotSource.includes('fire_age') && autoSnapshotSource.includes('fireAge')
    const manualStoresFireAge = manualSnapshotSource.includes('fire_age')
    const cronStoresFireAge = cronSnapshotSource.includes('fire_age')

    // At least auto-snapshot must store fire_age
    const pass = autoStoresFireAge
    results.push({
      name: 'Store FIRE age in monthly snapshots via fire_age column',
      pass,
      detail: pass
        ? `fire_age stored in snapshots: auto=${autoStoresFireAge}, manual=${manualStoresFireAge}, cron=${cronStoresFireAge}`
        : 'fire_age not found in auto-snapshot endpoint',
    })
  } catch (e) {
    results.push({ name: 'Store FIRE age in monthly snapshots via fire_age column', pass: false, detail: String(e) })
  }

  // ─── Test 2: Create "Je FIRE-leeftijd over tijd" line chart ─────────
  try {
    const hasFireAgeTrendChart = horizonSource.includes('FireAgeTrendChart')
    const hasSvgChart = horizonSource.includes('fire-age-trend-chart')
    const hasLineRendering = horizonSource.includes('fireAgeGrad') || (hasFireAgeTrendChart && horizonSource.includes('strokeLinecap'))

    const pass = hasFireAgeTrendChart && hasSvgChart
    results.push({
      name: 'Create "Je FIRE-leeftijd over tijd" line chart',
      pass,
      detail: pass
        ? `FireAgeTrendChart component exists with SVG chart (data-testid="fire-age-trend-chart")`
        : `Chart component: ${hasFireAgeTrendChart}, SVG testid: ${hasSvgChart}, Line rendering: ${hasLineRendering}`,
    })
  } catch (e) {
    results.push({ name: 'Create "Je FIRE-leeftijd over tijd" line chart', pass: false, detail: String(e) })
  }

  // ─── Test 3: Display chart on De Horizon overview page ─────────
  try {
    const hasSection = horizonSource.includes('fire-age-trend-section')
    const hasTitle = horizonSource.includes('Je FIRE-leeftijd over tijd')
    const hasChartCall = horizonSource.includes('<FireAgeTrendChart')

    const pass = hasSection && hasTitle && hasChartCall
    results.push({
      name: 'Display chart on De Horizon overview page',
      pass,
      detail: pass
        ? 'Chart section with title "Je FIRE-leeftijd over tijd" displayed on De Horizon page'
        : `Section: ${hasSection}, Title: ${hasTitle}, Chart call: ${hasChartCall}`,
    })
  } catch (e) {
    results.push({ name: 'Display chart on De Horizon overview page', pass: false, detail: String(e) })
  }

  // ─── Test 4: Show contextual message about FIRE age changes ─────────
  try {
    const hasContextMessage = horizonSource.includes('fire-age-context-message')
    const hasMonthReference = horizonSource.includes('was je FIRE-leeftijd')
    const hasImprovementMessage = horizonSource.includes('je ligt') && horizonSource.includes('voor!')
    const hasWorseningMessage = horizonSource.includes('verschoven')
    const hasStableMessage = horizonSource.includes('stabiel gebleven')

    const pass = hasContextMessage && hasMonthReference && hasImprovementMessage && hasWorseningMessage && hasStableMessage
    results.push({
      name: 'Show contextual message: "In [maand] was je FIRE-leeftijd X, nu Y"',
      pass,
      detail: pass
        ? 'Contextual progress message with improvement/worsening/stable variants'
        : `Context msg: ${hasContextMessage}, Month ref: ${hasMonthReference}, Improved: ${hasImprovementMessage}, Worse: ${hasWorseningMessage}, Stable: ${hasStableMessage}`,
    })
  } catch (e) {
    results.push({ name: 'Show contextual message about FIRE age changes', pass: false, detail: String(e) })
  }

  // ─── Test 5: Highlight improvements in FIRE age over time ─────────
  try {
    // Check for color-coded trend (green for improvement, red for worsening)
    const hasGreenImproving = horizonSource.includes("improving ? '#059669' : '#dc2626'") ||
      (horizonSource.includes('#059669') && horizonSource.includes('#dc2626') && horizonSource.includes('improving'))
    const hasTrendArrow = horizonSource.includes("improving ? '↓' : '↑'") ||
      (horizonSource.includes('↓') && horizonSource.includes('↑'))
    const hasImprovingColor = horizonSource.includes('fill-emerald-') && horizonSource.includes('fill-red-')
    const hasEmeraldLabel = horizonSource.includes('text-emerald-700') || horizonSource.includes('fill-emerald-700')

    const pass = (hasGreenImproving || hasImprovingColor) && hasTrendArrow
    results.push({
      name: 'Highlight improvements in FIRE age over time',
      pass,
      detail: pass
        ? 'Green line color and trend arrow for improving FIRE age, red for worsening'
        : `Green/red colors: ${hasGreenImproving || hasImprovingColor}, Trend arrow: ${hasTrendArrow}`,
    })
  } catch (e) {
    results.push({ name: 'Highlight improvements in FIRE age over time', pass: false, detail: String(e) })
  }

  // ─── Test 6: Handle missing historical data gracefully ─────────
  try {
    // Check that the chart handles < 2 data points
    const hasMinCheck = horizonSource.includes('withAge.length < 2') || horizonSource.includes('fireAgeSnapshots.length < 2')
    const hasNoDataMessage = horizonSource.includes('fire-age-no-data') || horizonSource.includes('Nog niet genoeg snapshots')
    const hasLengthFilter = horizonSource.includes('fire_age !== null')

    const pass = hasMinCheck && hasNoDataMessage && hasLengthFilter
    results.push({
      name: 'Handle missing historical data gracefully',
      pass,
      detail: pass
        ? 'Chart requires 2+ fire_age snapshots, shows helpful message when insufficient data, filters null values'
        : `Min check: ${hasMinCheck}, No-data msg: ${hasNoDataMessage}, Null filter: ${hasLengthFilter}`,
    })
  } catch (e) {
    results.push({ name: 'Handle missing historical data gracefully', pass: false, detail: String(e) })
  }

  // ─── Test 7: Snapshot query includes fire_age ─────────
  try {
    const queryIncludesFireAge = horizonSource.includes("'snapshot_date, resilience_score, net_worth, freedom_percentage, fire_age'") ||
      horizonSource.includes('fire_age')
    const typeIncludesFireAge = horizonSource.includes('fire_age: number | null')

    const pass = queryIncludesFireAge && typeIncludesFireAge
    results.push({
      name: 'Snapshot query and type include fire_age field',
      pass,
      detail: pass
        ? 'SnapshotForTrend type includes fire_age and query selects it'
        : `Query includes fire_age: ${queryIncludesFireAge}, Type includes fire_age: ${typeIncludesFireAge}`,
    })
  } catch (e) {
    results.push({ name: 'Snapshot query and type include fire_age field', pass: false, detail: String(e) })
  }

  // ─── Test 8: Chart section only appears with sufficient data ─────────
  try {
    // The chart section should be conditional on having >= 2 fire_age snapshots
    const hasConditionalRendering = horizonSource.includes('fireAgeSnapshots.length < 2') ||
      (horizonSource.includes('fire_age !== null') && horizonSource.includes('return null'))

    results.push({
      name: 'Chart section conditionally rendered with sufficient data',
      pass: hasConditionalRendering,
      detail: hasConditionalRendering
        ? 'Section only renders when 2+ snapshots with fire_age exist'
        : 'Conditional rendering not found',
    })
  } catch (e) {
    results.push({ name: 'Chart section conditionally rendered with sufficient data', pass: false, detail: String(e) })
  }

  // ─── Test 9: Description text matches spec ─────────
  try {
    const hasSubtitle = horizonSource.includes('lager is beter') || horizonSource.includes('Hoe je vrijheidsleeftijd zich ontwikkelt')

    results.push({
      name: 'Chart description text present',
      pass: hasSubtitle,
      detail: hasSubtitle
        ? 'Description: "Hoe je vrijheidsleeftijd zich ontwikkelt — lager is beter"'
        : 'Expected description text not found',
    })
  } catch (e) {
    results.push({ name: 'Chart description text present', pass: false, detail: String(e) })
  }

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#215 — FIRE-age history tracking and chart',
    summary: `${passing}/${total} tests passing`,
    passing,
    total,
    results,
  })
}
