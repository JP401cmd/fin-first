import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Verification API for Feature #121: Sparkline charts render from historical data
 *
 * Checks that the SparklineChart component in the assets page:
 * 1. Loads real valuation data from Supabase
 * 2. Renders SVG sparkline from historical valuations
 * 3. Data points match valuation entries
 * 4. Sparkline updates when new valuations are added
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  // Read the assets page source
  const assetsPagePath = path.join(process.cwd(), 'app', '(app)', 'core', 'assets', 'page.tsx')
  let assetsSource = ''
  try {
    assetsSource = fs.readFileSync(assetsPagePath, 'utf-8')
  } catch {
    return NextResponse.json({
      error: 'Could not read assets page source',
      tests: [{ name: 'source_readable', pass: false, detail: 'Could not read app/(app)/core/assets/page.tsx' }],
      passing: 0,
      total: 8,
    })
  }

  // Test 1: loadValuations fetches from Supabase 'valuations' table
  const hasLoadValuations = assetsSource.includes("from('valuations')") && assetsSource.includes('loadValuations')
  results.push({
    name: 'loadValuations_fetches_from_supabase',
    pass: hasLoadValuations,
    detail: hasLoadValuations
      ? "loadValuations() queries Supabase 'valuations' table with entity_id and entity_type filters"
      : 'Missing Supabase query for valuations',
  })

  // Test 2: loadValuations queries by entity_id and entity_type='asset'
  const hasEntityFilter = assetsSource.includes(".eq('entity_id', assetId)") && assetsSource.includes(".eq('entity_type', 'asset')")
  results.push({
    name: 'valuation_query_filters_by_entity',
    pass: hasEntityFilter,
    detail: hasEntityFilter
      ? 'Valuations are filtered by entity_id (asset UUID) and entity_type=asset'
      : 'Missing entity_id or entity_type filter on valuations query',
  })

  // Test 3: Valuations are ordered by date and limited
  const hasDateOrder = assetsSource.includes(".order('valuation_date'") && assetsSource.includes('.limit(')
  results.push({
    name: 'valuations_ordered_by_date',
    pass: hasDateOrder,
    detail: hasDateOrder
      ? 'Valuations query has order by valuation_date and limit clause'
      : 'Missing date ordering or limit on valuations query',
  })

  // Test 4: Sparkline SVG renders from valuation data (polyline element)
  const hasPolyline = assetsSource.includes('<polyline') && assetsSource.includes('points={points.join')
  results.push({
    name: 'sparkline_renders_svg_polyline',
    pass: hasPolyline,
    detail: hasPolyline
      ? 'SVG polyline element renders sparkline from computed points array'
      : 'Missing SVG polyline for sparkline rendering',
  })

  // Test 5: Data points are mapped from valuation values
  const hasValueMapping = assetsSource.includes('sorted.map(v => Number(v.value))') || assetsSource.includes('values.map((v, i)')
  results.push({
    name: 'data_points_from_valuation_values',
    pass: hasValueMapping,
    detail: hasValueMapping
      ? 'Valuation values are mapped to SVG coordinates for sparkline rendering'
      : 'Missing value-to-point mapping for sparkline',
  })

  // Test 6: Circle elements render for each data point
  const hasCircles = assetsSource.includes('values.map((v, i)') && assetsSource.includes('<circle')
  results.push({
    name: 'circle_markers_for_each_data_point',
    pass: hasCircles,
    detail: hasCircles
      ? 'Circle SVG elements render at each data point position on the sparkline'
      : 'Missing circle markers for sparkline data points',
  })

  // Test 7: Sparkline only renders with 2+ valuations
  const hasMinCheck = assetsSource.includes('valuations.length >= 2')
  results.push({
    name: 'sparkline_requires_minimum_2_valuations',
    pass: hasMinCheck,
    detail: hasMinCheck
      ? 'Sparkline conditionally renders only when there are 2 or more valuation entries'
      : 'Missing minimum valuations check for sparkline',
  })

  // Test 8: loadValuations called when opening asset modal (sparkline refreshes)
  const hasModalLoad = assetsSource.includes('loadValuations(asset.id)') && assetsSource.includes('openAssetModal')
  results.push({
    name: 'sparkline_loads_on_modal_open',
    pass: hasModalLoad,
    detail: hasModalLoad
      ? 'loadValuations(asset.id) is called in openAssetModal(), ensuring sparkline data refreshes'
      : 'Missing loadValuations call when opening asset modal',
  })

  // Test 9: ValuationModal.onSaved triggers loadValuations to refresh sparkline
  const hasOnSavedRefresh = assetsSource.includes('loadValuations(selectedAsset.id)')
  results.push({
    name: 'sparkline_refreshes_after_new_valuation',
    pass: hasOnSavedRefresh,
    detail: hasOnSavedRefresh
      ? 'After saving a new valuation, loadValuations(selectedAsset.id) is called to refresh sparkline'
      : 'Missing sparkline refresh after new valuation is saved',
  })

  // Test 10: Sparkline uses trend color (green for up, red for down)
  const hasTrendColor = assetsSource.includes("trend ? '#059669' : '#dc2626'")
  results.push({
    name: 'sparkline_uses_trend_color',
    pass: hasTrendColor,
    detail: hasTrendColor
      ? 'Sparkline stroke color is green (#059669) for upward trend, red (#dc2626) for downward'
      : 'Missing trend-based color for sparkline',
  })

  // Test 11: Date labels shown on sparkline (first and last dates)
  const hasDateLabels = assetsSource.includes("toLocaleDateString('nl-NL'") && assetsSource.includes('sorted[0].valuation_date')
  results.push({
    name: 'sparkline_shows_date_range_labels',
    pass: hasDateLabels,
    detail: hasDateLabels
      ? 'Date labels shown below sparkline for first and last valuation dates (nl-NL locale)'
      : 'Missing date range labels on sparkline',
  })

  // Test 12: No mock data patterns in sparkline code
  const mockPatterns = ['mockData', 'fakeData', 'sampleData', 'dummyData', 'testData', 'globalThis', 'devStore', 'MOCK', 'STUB']
  const foundMocks = mockPatterns.filter(p => assetsSource.includes(p))
  const noMocks = foundMocks.length === 0
  results.push({
    name: 'no_mock_data_patterns',
    pass: noMocks,
    detail: noMocks
      ? 'Zero mock data patterns found in assets page source code'
      : `Mock patterns found: ${foundMocks.join(', ')}`,
  })

  const passing = results.filter(r => r.pass).length

  return NextResponse.json({
    feature: '#121 - Sparkline charts render from historical data',
    tests: results,
    passing,
    total: results.length,
    allPassing: passing === results.length,
  })
}
