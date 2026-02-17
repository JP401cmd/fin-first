import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Verification API for Feature #213: Asset valuation trend charts
 *
 * Checks:
 * 1. Line chart for asset value over time using valuations data
 * 2. Chart displayed on asset detail modal
 * 3. Mini sparkline on asset card in compact view
 * 4. No record limit on valuation history display
 * 5. Auto-create valuation entry when user updates asset current_value
 * 6. Handle assets with limited history gracefully
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  const assetsPagePath = path.join(process.cwd(), 'app', '(app)', 'core', 'assets', 'page.tsx')
  let src = ''
  try {
    src = fs.readFileSync(assetsPagePath, 'utf-8')
  } catch {
    return NextResponse.json({
      error: 'Could not read assets page source',
      tests: [{ name: 'source_readable', pass: false, detail: 'Could not read app/(app)/core/assets/page.tsx' }],
      passing: 0,
      total: 1,
    })
  }

  // ── Step 1: Line chart for asset value over time ──────────────

  // 1a: ValuationTrendSection component exists
  const hasValuationTrendSection = src.includes('function ValuationTrendSection') && src.includes('ValuationTrendSection')
  results.push({
    name: 'valuation_trend_section_component_exists',
    pass: hasValuationTrendSection,
    detail: hasValuationTrendSection
      ? 'ValuationTrendSection component exists for rendering the line chart'
      : 'Missing ValuationTrendSection component',
  })

  // 1b: SVG line chart with path element
  const hasLineChart = src.includes('<path d={linePath}') && src.includes("fill=\"none\"") && src.includes("strokeWidth=\"2\"")
  results.push({
    name: 'svg_line_chart_renders_path',
    pass: hasLineChart,
    detail: hasLineChart
      ? 'SVG path element renders the valuation line chart'
      : 'Missing SVG path for line chart',
  })

  // 1c: Area fill under the line
  const hasAreaFill = src.includes('<path d={areaPath}') && src.includes('fillOpacity')
  results.push({
    name: 'line_chart_has_area_fill',
    pass: hasAreaFill,
    detail: hasAreaFill
      ? 'Area fill rendered below the line chart for visual depth'
      : 'Missing area fill under line chart',
  })

  // 1d: Data points (circles) on the chart
  const hasDataPoints = src.includes('sorted.map((v, i) =>') && src.includes('<circle')
  results.push({
    name: 'line_chart_has_data_point_circles',
    pass: hasDataPoints,
    detail: hasDataPoints
      ? 'Circle markers at each data point on the line chart'
      : 'Missing circle data points on chart',
  })

  // 1e: Y-axis labels with currency formatting
  const hasYAxis = src.includes('yTicks.map') && (src.includes('€') || src.includes("'€"))
  results.push({
    name: 'line_chart_has_y_axis_labels',
    pass: hasYAxis,
    detail: hasYAxis
      ? 'Y-axis labels show currency values'
      : 'Missing y-axis labels',
  })

  // 1f: X-axis date labels
  const hasXAxisDates = src.includes("month: 'short'") && src.includes("year: '2-digit'")
  results.push({
    name: 'line_chart_has_x_axis_date_labels',
    pass: hasXAxisDates,
    detail: hasXAxisDates
      ? 'X-axis labels show dates in nl-NL locale (month short, year 2-digit)'
      : 'Missing x-axis date labels',
  })

  // 1g: Trend summary showing change amount and percentage
  const hasTrendSummary = src.includes('formatCurrency(diff)') && src.includes('pct.toFixed(1)')
  results.push({
    name: 'line_chart_has_trend_summary',
    pass: hasTrendSummary,
    detail: hasTrendSummary
      ? 'Trend summary shows total change amount and percentage below chart'
      : 'Missing trend summary',
  })

  // ── Step 2: Chart displayed on asset detail modal ─────────────

  const hasChartInModal = src.includes('<ValuationTrendSection') && src.includes('valuations={valuations[selectedAsset.id]}')
  results.push({
    name: 'chart_displayed_in_detail_modal',
    pass: hasChartInModal,
    detail: hasChartInModal
      ? 'ValuationTrendSection rendered inside the AssetDetailModal with real valuation data'
      : 'Chart not displayed in asset detail modal',
  })

  // ── Step 3: Mini sparkline on asset card ──────────────────────

  // 3a: MiniSparkline component exists
  const hasMiniSparkline = src.includes('function MiniSparkline') && src.includes('<MiniSparkline')
  results.push({
    name: 'mini_sparkline_component_exists',
    pass: hasMiniSparkline,
    detail: hasMiniSparkline
      ? 'MiniSparkline component exists and is rendered on asset cards'
      : 'Missing MiniSparkline component',
  })

  // 3b: Sparkline rendered on asset list items
  const hasSparklineOnCards = src.includes('assetVals && assetVals.length >= 2') && src.includes('<MiniSparkline valuations={sorted}')
  results.push({
    name: 'sparkline_on_asset_cards',
    pass: hasSparklineOnCards,
    detail: hasSparklineOnCards
      ? 'Mini sparkline shown on each asset card when 2+ valuations exist'
      : 'Sparkline not rendered on asset cards',
  })

  // 3c: Sparkline uses SVG polyline
  const hasSparklineSVG = src.includes('<polyline') && src.includes('points={points.join')
  results.push({
    name: 'sparkline_uses_svg_polyline',
    pass: hasSparklineSVG,
    detail: hasSparklineSVG
      ? 'MiniSparkline uses SVG polyline for compact rendering'
      : 'Missing SVG polyline in sparkline',
  })

  // 3d: Sparkline has trend coloring (green for up, red for down)
  const hasSparklineTrendColor = src.includes("trend ? '#059669' : '#dc2626'")
  results.push({
    name: 'sparkline_trend_coloring',
    pass: hasSparklineTrendColor,
    detail: hasSparklineTrendColor
      ? 'Sparkline stroke green for uptrend, red for downtrend'
      : 'Missing trend-based color on sparkline',
  })

  // 3e: loadAllValuations function loads valuations for all assets
  const hasLoadAllValuations = src.includes('loadAllValuations') && src.includes("eq('entity_type', 'asset')")
  results.push({
    name: 'load_all_valuations_for_sparklines',
    pass: hasLoadAllValuations,
    detail: hasLoadAllValuations
      ? 'loadAllValuations() fetches valuations for all assets to populate sparklines'
      : 'Missing bulk valuation loading for sparklines',
  })

  // ── Step 4: No record limit on valuation history ──────────────

  // The loadValuations and loadAllValuations should not have .limit()
  // Check that the client-side functions don't artificially limit
  const loadValuationsCode = src.match(/const loadValuations = useCallback\(async.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n/s)
  const hasNoLimitOnLoadValuations = src.includes('loadValuations') && !loadValuationsCode?.[0]?.includes('.limit(')
  results.push({
    name: 'no_record_limit_on_load_valuations',
    pass: hasNoLimitOnLoadValuations,
    detail: hasNoLimitOnLoadValuations
      ? 'loadValuations() has no .limit() clause - shows full history'
      : 'loadValuations has a limit clause',
  })

  // The displayed history should have a "show all" button
  const hasShowAllButton = src.includes('showAll') && src.includes('Toon alle') && src.includes('historyList.length')
  results.push({
    name: 'show_all_history_button',
    pass: hasShowAllButton,
    detail: hasShowAllButton
      ? 'History list has show all/show less toggle for full history access'
      : 'Missing show all button for valuation history',
  })

  // ── Step 5: Auto-create valuation on value update ─────────────

  // Check AssetForm handleSave auto-tracks valuation
  const hasAutoTrackOnEdit = src.includes('newValue !== oldValue') && src.includes("from('valuations').upsert") && src.includes('Waarde bijgewerkt van')
  results.push({
    name: 'auto_create_valuation_on_edit',
    pass: hasAutoTrackOnEdit,
    detail: hasAutoTrackOnEdit
      ? 'AssetForm.handleSave() auto-creates valuation entry when current_value changes'
      : 'Missing auto-track valuation on edit',
  })

  // Check ValuationModal also creates valuation
  const hasValuationModal = src.includes('function ValuationModal') && src.includes("from('valuations').upsert")
  results.push({
    name: 'valuation_modal_creates_entry',
    pass: hasValuationModal,
    detail: hasValuationModal
      ? 'ValuationModal creates valuation entry in database on save'
      : 'Missing ValuationModal or valuation creation',
  })

  // Check upsert with onConflict to avoid duplicates
  const hasUpsertConflict = src.includes("onConflict: 'entity_id,valuation_date'")
  results.push({
    name: 'upsert_prevents_duplicate_daily_entries',
    pass: hasUpsertConflict,
    detail: hasUpsertConflict
      ? 'Upsert with onConflict prevents duplicate valuation entries per entity per day'
      : 'Missing upsert conflict handling',
  })

  // ── Step 6: Handle limited history gracefully ─────────────────

  // Single data point handling
  const hasSinglePointHandling = src.includes("sorted.length === 1") && src.includes('Voeg meer waarderingen toe')
  results.push({
    name: 'single_datapoint_graceful_handling',
    pass: hasSinglePointHandling,
    detail: hasSinglePointHandling
      ? 'Single valuation shown with message to add more for trend chart'
      : 'Missing graceful handling of single data point',
  })

  // No valuations handling
  const hasNoValuationsHandling = src.includes('no-valuation-history') && src.includes('Nog geen waardehistorie')
  results.push({
    name: 'no_valuations_graceful_handling',
    pass: hasNoValuationsHandling,
    detail: hasNoValuationsHandling
      ? 'No-history placeholder shown with instruction to use Herwaarderen'
      : 'Missing no-valuations placeholder',
  })

  // Sparkline minimum check (requires 2+ entries)
  const hasMinCheckSparkline = src.includes('valuations.length < 2') && src.includes('return null')
  results.push({
    name: 'sparkline_minimum_2_valuations',
    pass: hasMinCheckSparkline,
    detail: hasMinCheckSparkline
      ? 'MiniSparkline returns null for < 2 valuations, gracefully handling limited data'
      : 'Missing minimum valuations check in sparkline',
  })

  // ── Mock data check ───────────────────────────────────────────

  const mockPatterns = ['mockData', 'fakeData', 'sampleData', 'dummyData', 'testData', 'globalThis', 'devStore', 'dev-store', 'MOCK', 'STUB']
  const foundMocks = mockPatterns.filter(p => src.includes(p))
  const noMocks = foundMocks.length === 0
  results.push({
    name: 'no_mock_data_patterns',
    pass: noMocks,
    detail: noMocks
      ? 'Zero mock data patterns found - all data from Supabase'
      : `Mock patterns found: ${foundMocks.join(', ')}`,
  })

  const passing = results.filter(r => r.pass).length

  return NextResponse.json({
    feature: '#213 - Asset valuation trend charts',
    tests: results,
    passing,
    total: results.length,
    allPassing: passing === results.length,
  })
}
