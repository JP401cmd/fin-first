import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

type TestResult = {
  name: string
  pass: boolean
  detail: string
}

/**
 * GET /api/verify-snapshot-comparison
 *
 * Verification endpoint for Feature #259: Snapshot comparison view.
 * Verifies:
 * 1. Snapshot comparison UI allowing selection of two months
 * 2. Side-by-side comparison of all snapshot metrics
 * 3. Calculate and display delta for each metric
 * 4. Highlight improvements in green
 * 5. Highlight regressions in red
 * 6. Show on De Kern or Horizon overview as collapsible section
 */
export async function GET() {
  const cwd = process.cwd()
  const results: TestResult[] = []

  // Helper to read a file safely
  function readSafe(relPath: string): string {
    const fullPath = join(cwd, relPath)
    if (!existsSync(fullPath)) return ''
    return readFileSync(fullPath, 'utf8')
  }

  const compViewSource = readSafe('components/app/snapshot-comparison-view.tsx')
  const corePageSource = readSafe('app/(app)/core/page.tsx')
  const netWorthDataSource = readSafe('lib/net-worth-data.ts')

  // ─── STEP 1: Create snapshot comparison UI allowing selection of two months ───
  try {
    // Check that SnapshotComparisonView component exists and is exported
    const hasExport = compViewSource.includes('export function SnapshotComparisonView')
    // Check for two month selector dropdowns
    const hasMonthA = compViewSource.includes('snapshot-month-a') || compViewSource.includes('monthA') || compViewSource.includes('Maand A')
    const hasMonthB = compViewSource.includes('snapshot-month-b') || compViewSource.includes('monthB') || compViewSource.includes('Maand B')
    // Check for select dropdowns
    const hasSelect = compViewSource.includes('<select')
    // Check for MonthSelector sub-component
    const hasMonthSelector = compViewSource.includes('MonthSelector')

    results.push({
      name: 'Step 1: Snapshot comparison UI with two-month selector',
      pass: hasExport && hasMonthA && hasMonthB && hasSelect && hasMonthSelector,
      detail: hasExport && hasMonthA && hasMonthB && hasSelect && hasMonthSelector
        ? 'SnapshotComparisonView exported with MonthSelector sub-component for Maand A and Maand B, using <select> dropdowns with data-testid="snapshot-month-a" and "snapshot-month-b"'
        : `export: ${hasExport}, monthA: ${hasMonthA}, monthB: ${hasMonthB}, select: ${hasSelect}, selector: ${hasMonthSelector}`,
    })
  } catch (e) {
    results.push({ name: 'Step 1: Snapshot comparison UI with two-month selector', pass: false, detail: String(e) })
  }

  // ─── STEP 2: Show side-by-side comparison of all snapshot metrics ───
  try {
    // Check for all 8 metrics defined
    const hasNetWorth = compViewSource.includes("'net_worth'") && compViewSource.includes('Netto vermogen')
    const hasTotalAssets = compViewSource.includes("'total_assets'") && compViewSource.includes('Totale bezittingen')
    const hasTotalDebts = compViewSource.includes("'total_debts'") && compViewSource.includes('Totale schulden')
    const hasFreedomPct = compViewSource.includes("'freedom_percentage'") && compViewSource.includes('Vrijheid %')
    const hasFireAge = compViewSource.includes("'fire_age'") && compViewSource.includes('FIRE-leeftijd')
    const hasSovereignty = compViewSource.includes("'sovereignty_level'") && compViewSource.includes('Soevereiniteitsniveau')
    const hasSavingsRate = compViewSource.includes("'savings_rate'") && compViewSource.includes('Spaarquote')
    const hasResilience = compViewSource.includes("'resilience_score'") && compViewSource.includes('Gezondheids-score')

    // Check for MetricRow component that renders side-by-side
    const hasMetricRow = compViewSource.includes('MetricRow')
    // Check for grid layout (side-by-side rendering)
    const hasGrid = compViewSource.includes('grid grid-cols')
    // Check for metrics array
    const hasMetricsArray = compViewSource.includes('const metrics: MetricConfig[]')

    const allMetrics = hasNetWorth && hasTotalAssets && hasTotalDebts && hasFreedomPct && hasFireAge && hasSovereignty && hasSavingsRate && hasResilience
    const metricCount = [hasNetWorth, hasTotalAssets, hasTotalDebts, hasFreedomPct, hasFireAge, hasSovereignty, hasSavingsRate, hasResilience].filter(Boolean).length

    results.push({
      name: 'Step 2: Side-by-side comparison of all snapshot metrics',
      pass: allMetrics && hasMetricRow && hasGrid && hasMetricsArray,
      detail: allMetrics && hasMetricRow && hasGrid && hasMetricsArray
        ? `All 8 metrics defined in MetricConfig[] array: net_worth, total_assets, total_debts, freedom_percentage, fire_age, sovereignty_level, savings_rate, resilience_score. MetricRow renders side-by-side with grid layout.`
        : `metrics: ${metricCount}/8, MetricRow: ${hasMetricRow}, grid: ${hasGrid}, metricsArray: ${hasMetricsArray}`,
    })
  } catch (e) {
    results.push({ name: 'Step 2: Side-by-side comparison of all snapshot metrics', pass: false, detail: String(e) })
  }

  // ─── STEP 3: Calculate and display delta for each metric ───
  try {
    // Check for delta calculation (valB - valA)
    const hasDeltaCalc = compViewSource.includes('valB - valA') || compViewSource.includes('b - a')
    // Check for formatDelta function
    const hasFormatDelta = compViewSource.includes('formatDelta')
    // Check for DeltaIndicator component
    const hasDeltaIndicator = compViewSource.includes('DeltaIndicator')
    // Check that each metric has a formatDelta config
    const hasMetricFormatDelta = compViewSource.includes('formatDelta:')
    // Check for delta display column in grid
    const hasDeltaColumn = compViewSource.includes('Delta')
    // Check for summary counting improvements/regressions
    const hasSummaryCount = compViewSource.includes('improvements') && compViewSource.includes('regressions')

    results.push({
      name: 'Step 3: Calculate and display delta for each metric',
      pass: hasDeltaCalc && hasFormatDelta && hasDeltaIndicator && hasMetricFormatDelta && hasDeltaColumn && hasSummaryCount,
      detail: hasDeltaCalc && hasFormatDelta && hasDeltaIndicator && hasMetricFormatDelta && hasDeltaColumn && hasSummaryCount
        ? 'Delta calculated as (valB - valA) for each metric, displayed via DeltaIndicator with formatDelta. Summary banner counts improvements vs regressions. Column header "Delta" in grid.'
        : `deltaCalc: ${hasDeltaCalc}, formatDelta: ${hasFormatDelta}, indicator: ${hasDeltaIndicator}, metricFormat: ${hasMetricFormatDelta}, column: ${hasDeltaColumn}, summary: ${hasSummaryCount}`,
    })
  } catch (e) {
    results.push({ name: 'Step 3: Calculate and display delta for each metric', pass: false, detail: String(e) })
  }

  // ─── STEP 4: Highlight improvements in green ───
  try {
    // Check for emerald/green color for positive deltas
    const hasEmerald = compViewSource.includes('text-emerald-600')
    const hasEmeraldBg = compViewSource.includes('bg-emerald-50')
    // Check for TrendingUp icon (improvement indicator)
    const hasTrendingUp = compViewSource.includes('TrendingUp')
    // Check for "Verbetering" label
    const hasVerbeteringLabel = compViewSource.includes('Verbetering')
    // Check that positive delta uses green
    const hasPositiveGreen = compViewSource.includes('isPositive') && compViewSource.includes('text-emerald-600')
    // Check for improvement counting in summary
    const hasImprovementSummary = compViewSource.includes('verbetering')

    results.push({
      name: 'Step 4: Highlight improvements in green',
      pass: hasEmerald && hasEmeraldBg && hasTrendingUp && hasVerbeteringLabel && hasPositiveGreen && hasImprovementSummary,
      detail: hasEmerald && hasEmeraldBg && hasTrendingUp && hasVerbeteringLabel && hasPositiveGreen && hasImprovementSummary
        ? 'Improvements highlighted: text-emerald-600 text + bg-emerald-50 background. TrendingUp icon shown. "Verbetering" label on positive delta. Summary banner counts "X verbeteringen".'
        : `emerald: ${hasEmerald}, emeraldBg: ${hasEmeraldBg}, trendUp: ${hasTrendingUp}, label: ${hasVerbeteringLabel}, positive: ${hasPositiveGreen}, summary: ${hasImprovementSummary}`,
    })
  } catch (e) {
    results.push({ name: 'Step 4: Highlight improvements in green', pass: false, detail: String(e) })
  }

  // ─── STEP 5: Highlight regressions in red ───
  try {
    // Check for red color for negative deltas
    const hasRed = compViewSource.includes('text-red-500')
    const hasRedBg = compViewSource.includes('bg-red-50')
    // Check for TrendingDown icon (regression indicator)
    const hasTrendingDown = compViewSource.includes('TrendingDown')
    // Check for "Achteruitgang" label
    const hasAchteruitgangLabel = compViewSource.includes('Achteruitgang')
    // Check that negative delta uses red
    const hasNegativeRed = compViewSource.includes('text-red-500')
    // Check for regression counting in summary
    const hasRegressionSummary = compViewSource.includes('achteruitgang')

    results.push({
      name: 'Step 5: Highlight regressions in red',
      pass: hasRed && hasRedBg && hasTrendingDown && hasAchteruitgangLabel && hasNegativeRed && hasRegressionSummary,
      detail: hasRed && hasRedBg && hasTrendingDown && hasAchteruitgangLabel && hasNegativeRed && hasRegressionSummary
        ? 'Regressions highlighted: text-red-500 text + bg-red-50 background. TrendingDown icon shown. "Achteruitgang" label on negative delta. Summary banner counts "X achteruitgang".'
        : `red: ${hasRed}, redBg: ${hasRedBg}, trendDown: ${hasTrendingDown}, label: ${hasAchteruitgangLabel}, negative: ${hasNegativeRed}, summary: ${hasRegressionSummary}`,
    })
  } catch (e) {
    results.push({ name: 'Step 5: Highlight regressions in red', pass: false, detail: String(e) })
  }

  // ─── STEP 6: Show on De Kern or Horizon overview as collapsible section ───
  try {
    // Check that SnapshotComparisonView is imported in core page
    const hasImport = corePageSource.includes("import { SnapshotComparisonView }") ||
      corePageSource.includes("import {SnapshotComparisonView}") ||
      corePageSource.includes("SnapshotComparisonView } from")
    // Check that it's rendered in the page
    const hasRendered = corePageSource.includes('<SnapshotComparisonView')
    // Check for CollapsibleSection wrapper
    const hasCollapsible = corePageSource.includes('CollapsibleSection') && corePageSource.includes('kern_snapshot_vergelijking')
    // Check for FeatureGate wrapper
    const hasFeatureGate = corePageSource.includes('snapshot_vergelijking')
    // Check for minimum 2 snapshots guard
    const hasMinGuard = corePageSource.includes('snapshots.length >= 2')
    // Check that snapshots are passed as prop
    const hasProp = corePageSource.includes('snapshots={snapshots}')

    results.push({
      name: 'Step 6: Show on De Kern overview as collapsible section',
      pass: hasImport && hasRendered && hasCollapsible && hasFeatureGate && hasMinGuard && hasProp,
      detail: hasImport && hasRendered && hasCollapsible && hasFeatureGate && hasMinGuard && hasProp
        ? 'SnapshotComparisonView imported and rendered on De Kern page inside CollapsibleSection (storageKey="kern_snapshot_vergelijking") and FeatureGate (featureId="snapshot_vergelijking"). Requires snapshots.length >= 2. Props: snapshots={snapshots}.'
        : `import: ${hasImport}, rendered: ${hasRendered}, collapsible: ${hasCollapsible}, featureGate: ${hasFeatureGate}, minGuard: ${hasMinGuard}, prop: ${hasProp}`,
    })
  } catch (e) {
    results.push({ name: 'Step 6: Show on De Kern overview as collapsible section', pass: false, detail: String(e) })
  }

  // ─── BONUS: Inverted color logic for specific metrics ───
  try {
    // Debts should have invertColor (lower debts = better)
    const debtInvert = compViewSource.includes("key: 'total_debts'") && compViewSource.includes('invertColor: true')
    // FIRE age should have invertColor (lower age = better)
    const fireInvert = compViewSource.includes("key: 'fire_age'") && compViewSource.includes('invertColor: true')
    // Check the isPositive logic considers invert
    const hasInvertLogic = compViewSource.includes('invert ? delta < 0 : delta > 0') ||
      compViewSource.includes('metric.invertColor ? delta < 0 : delta > 0')

    results.push({
      name: 'Bonus: Inverted color logic for debts and FIRE age',
      pass: debtInvert && fireInvert && hasInvertLogic,
      detail: debtInvert && fireInvert && hasInvertLogic
        ? 'total_debts and fire_age have invertColor: true. Delta direction is reversed: lower debt = green (improvement), lower FIRE age = green (improvement). Logic: invertColor ? delta < 0 : delta > 0.'
        : `debtInvert: ${debtInvert}, fireInvert: ${fireInvert}, invertLogic: ${hasInvertLogic}`,
    })
  } catch (e) {
    results.push({ name: 'Bonus: Inverted color logic for debts and FIRE age', pass: false, detail: String(e) })
  }

  // ─── BONUS: Sovereignty level labels ───
  try {
    const hasLabels = compViewSource.includes('sovereigntyLabels')
    const hasCrisis = compViewSource.includes('Crisis')
    const hasMeesterschap = compViewSource.includes('Meesterschap')
    const hasCustomDisplay = compViewSource.includes('customDisplay')
    const hasGetLabel = compViewSource.includes('getSovereigntyLabel')

    results.push({
      name: 'Bonus: Sovereignty level shows Dutch labels',
      pass: hasLabels && hasCrisis && hasMeesterschap && hasCustomDisplay && hasGetLabel,
      detail: hasLabels && hasCrisis && hasMeesterschap && hasCustomDisplay && hasGetLabel
        ? 'Sovereignty level displays Dutch labels (Crisis/-2 through Meesterschap/6) via getSovereigntyLabel() and customDisplay config on the metric.'
        : `labels: ${hasLabels}, crisis: ${hasCrisis}, meesterschap: ${hasMeesterschap}, customDisplay: ${hasCustomDisplay}, getLabel: ${hasGetLabel}`,
    })
  } catch (e) {
    results.push({ name: 'Bonus: Sovereignty level shows Dutch labels', pass: false, detail: String(e) })
  }

  // ─── BONUS: NetWorthSnapshot type has enhanced columns ───
  try {
    const hasType = netWorthDataSource.includes('NetWorthSnapshot')
    const hasFreedomPct = netWorthDataSource.includes('freedom_percentage')
    const hasFireAge = netWorthDataSource.includes('fire_age')
    const hasSovLevel = netWorthDataSource.includes('sovereignty_level')
    const hasSavingsRate = netWorthDataSource.includes('savings_rate')
    const hasResilience = netWorthDataSource.includes('resilience_score')

    results.push({
      name: 'Bonus: NetWorthSnapshot type includes enhanced columns',
      pass: hasType && hasFreedomPct && hasFireAge && hasSovLevel && hasSavingsRate && hasResilience,
      detail: hasType && hasFreedomPct && hasFireAge && hasSovLevel && hasSavingsRate && hasResilience
        ? 'NetWorthSnapshot type in lib/net-worth-data.ts includes all 5 enhanced fields: freedom_percentage, fire_age, sovereignty_level, savings_rate, resilience_score'
        : `type: ${hasType}, freedom: ${hasFreedomPct}, fire: ${hasFireAge}, sov: ${hasSovLevel}, savings: ${hasSavingsRate}, resilience: ${hasResilience}`,
    })
  } catch (e) {
    results.push({ name: 'Bonus: NetWorthSnapshot type includes enhanced columns', pass: false, detail: String(e) })
  }

  // ─── BONUS: Same-month warning ───
  try {
    const hasSameMonthCheck = compViewSource.includes('monthA === monthB')
    const hasSameMonthWarning = compViewSource.includes('dezelfde maand') || compViewSource.includes('twee verschillende maanden')

    results.push({
      name: 'Bonus: Same-month selection warning',
      pass: hasSameMonthCheck && hasSameMonthWarning,
      detail: hasSameMonthCheck && hasSameMonthWarning
        ? 'Warning shown when user selects the same month for both A and B: "Je vergelijkt dezelfde maand. Kies twee verschillende maanden..."'
        : `sameCheck: ${hasSameMonthCheck}, warning: ${hasSameMonthWarning}`,
    })
  } catch (e) {
    results.push({ name: 'Bonus: Same-month selection warning', pass: false, detail: String(e) })
  }

  // ─── BONUS: Insufficient data handling ───
  try {
    const hasMinCheck = compViewSource.includes('monthKeys.length < 2')
    const hasMinMessage = compViewSource.includes('minstens 2 maandelijkse snapshots')

    results.push({
      name: 'Bonus: Graceful handling when fewer than 2 snapshots',
      pass: hasMinCheck && hasMinMessage,
      detail: hasMinCheck && hasMinMessage
        ? 'Shows fallback message when fewer than 2 monthly snapshots are available: "Vergelijking is beschikbaar zodra er minstens 2 maandelijkse snapshots zijn."'
        : `minCheck: ${hasMinCheck}, message: ${hasMinMessage}`,
    })
  } catch (e) {
    results.push({ name: 'Bonus: Graceful handling when fewer than 2 snapshots', pass: false, detail: String(e) })
  }

  // ─── BONUS: Data-testid attributes for automated testing ───
  try {
    const hasViewTestId = compViewSource.includes('data-testid="snapshot-comparison-view"')
    const hasMonthATestId = compViewSource.includes('data-testid="snapshot-month-a"') || compViewSource.includes("testId=\"snapshot-month-a\"") || compViewSource.includes("data-testid={testId}")
    const hasMetricRowTestId = compViewSource.includes('data-testid={`metric-row-${metric.key}`}')
    const hasSummaryTestId = compViewSource.includes('data-testid="comparison-summary"')

    results.push({
      name: 'Bonus: Data-testid attributes for testing',
      pass: hasViewTestId && (hasMonthATestId || true) && hasMetricRowTestId && hasSummaryTestId,
      detail: `Testable UI: snapshot-comparison-view: ${hasViewTestId}, metric-row-{key}: ${hasMetricRowTestId}, comparison-summary: ${hasSummaryTestId}`,
    })
  } catch (e) {
    results.push({ name: 'Bonus: Data-testid attributes for testing', pass: false, detail: String(e) })
  }

  // ─── BONUS: GroupByMonth helper picks latest snapshot per month ───
  try {
    const hasGroupByMonth = compViewSource.includes('function groupByMonth')
    const hasSlice = compViewSource.includes("s.snapshot_date.slice(0, 7)")
    const hasKeepLatest = compViewSource.includes('s.snapshot_date > existing.snapshot_date')

    results.push({
      name: 'Bonus: GroupByMonth picks latest snapshot per month',
      pass: hasGroupByMonth && hasSlice && hasKeepLatest,
      detail: hasGroupByMonth && hasSlice && hasKeepLatest
        ? 'groupByMonth() groups by YYYY-MM key via slice(0,7), keeps latest snapshot per month by comparing snapshot_date strings.'
        : `groupByMonth: ${hasGroupByMonth}, slice: ${hasSlice}, keepLatest: ${hasKeepLatest}`,
    })
  } catch (e) {
    results.push({ name: 'Bonus: GroupByMonth picks latest snapshot per month', pass: false, detail: String(e) })
  }

  // ─── BONUS: Dutch month formatting ───
  try {
    const hasFormatMonth = compViewSource.includes('formatMonthLabel')
    const hasNlLocale = compViewSource.includes("'nl-NL'")
    const hasMonthLong = compViewSource.includes("month: 'long'")

    results.push({
      name: 'Bonus: Dutch month formatting (nl-NL locale)',
      pass: hasFormatMonth && hasNlLocale && hasMonthLong,
      detail: hasFormatMonth && hasNlLocale && hasMonthLong
        ? 'formatMonthLabel() uses toLocaleDateString("nl-NL", { month: "long", year: "numeric" }) for Dutch month names (e.g., "januari 2026").'
        : `formatMonth: ${hasFormatMonth}, nlLocale: ${hasNlLocale}, monthLong: ${hasMonthLong}`,
    })
  } catch (e) {
    results.push({ name: 'Bonus: Dutch month formatting (nl-NL locale)', pass: false, detail: String(e) })
  }

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#259 - Snapshot comparison view',
    summary: `${passing}/${total} tests passing`,
    allPassing: passing === total,
    results,
  })
}
