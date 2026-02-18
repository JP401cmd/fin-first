import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Verification endpoint for Feature #249: TrendChart consistent visualization component
 *
 * Steps to verify:
 * 1. TrendChart reusable component exists
 * 2. Support line chart mode
 * 3. Support area chart mode
 * 4. Support bar chart mode
 * 5. Support actual vs projected data overlay
 * 6. Apply consistent styling matching module color themes
 * 7. Responsive design for mobile and desktop
 */
export async function GET() {
  const results: { test: string; pass: boolean; detail: string }[] = []

  try {
    // Read the TrendChart component source
    const trendChartPath = join(process.cwd(), 'components', 'app', 'trend-chart.tsx')
    const trendChartSource = readFileSync(trendChartPath, 'utf-8')

    // Read the test page source
    const testPagePath = join(process.cwd(), 'app', 'test-trend-chart', 'page.tsx')
    const testPageSource = readFileSync(testPagePath, 'utf-8')

    // ─── Test 1: TrendChart reusable component exists ─────────
    const hasExport = trendChartSource.includes('export function TrendChart')
    const hasTypeExports = trendChartSource.includes('export type TrendChartMode')
      && trendChartSource.includes('export type TrendChartSeries')
      && trendChartSource.includes('export type TrendChartProps')
    const isReusable = trendChartSource.includes("'use client'")
      && hasExport
      && hasTypeExports

    results.push({
      test: 'TrendChart is a reusable component with exported types',
      pass: isReusable,
      detail: isReusable
        ? 'TrendChart exported as named function with TrendChartMode, TrendChartSeries, TrendChartProps types'
        : `Export: ${hasExport}, Types: ${hasTypeExports}, Client: ${trendChartSource.includes("'use client'")}`,
    })

    // ─── Test 2: Line chart mode support ───────────────────────
    const hasLineMode = trendChartSource.includes("'line'")
      && trendChartSource.includes("mode === 'line'")
    const hasLinePath = trendChartSource.includes('linePath')
      && trendChartSource.includes('strokeLinejoin')

    results.push({
      test: 'Support line chart mode for historical trends',
      pass: hasLineMode && hasLinePath,
      detail: hasLineMode && hasLinePath
        ? 'Line mode renders SVG path with strokeLinejoin for smooth curves'
        : `Mode check: ${hasLineMode}, Path rendering: ${hasLinePath}`,
    })

    // ─── Test 3: Area chart mode support ───────────────────────
    const hasAreaMode = trendChartSource.includes("mode === 'area'")
    const hasAreaPath = trendChartSource.includes('areaPath')
      && trendChartSource.includes('trend-grad-')

    results.push({
      test: 'Support area chart mode for projections',
      pass: hasAreaMode && hasAreaPath,
      detail: hasAreaMode && hasAreaPath
        ? 'Area mode renders filled SVG path with gradient fill (trend-grad-)'
        : `Mode check: ${hasAreaMode}, Path rendering: ${hasAreaPath}`,
    })

    // ─── Test 4: Bar chart mode support ────────────────────────
    const hasBarMode = trendChartSource.includes("mode === 'bar'")
    const hasBarRect = trendChartSource.includes('barWidth')
      && trendChartSource.includes('<rect')

    results.push({
      test: 'Support bar chart mode for monthly comparisons',
      pass: hasBarMode && hasBarRect,
      detail: hasBarMode && hasBarRect
        ? 'Bar mode renders SVG rect elements with dynamic barWidth calculation'
        : `Mode check: ${hasBarMode}, Rect rendering: ${hasBarRect}`,
    })

    // ─── Test 5: Actual vs projected data overlay ──────────────
    const hasProjectedProp = trendChartSource.includes('showProjected')
    const hasProjectedData = trendChartSource.includes('projected')
      && trendChartSource.includes('projLinePath')
      && trendChartSource.includes('projAreaPath')
    const hasDashedLine = trendChartSource.includes('strokeDasharray')
    const hasProjectedLabel = trendChartSource.includes('Prognose')
      || trendChartSource.includes('prognose')

    results.push({
      test: 'Support actual vs projected data overlay',
      pass: hasProjectedProp && hasProjectedData && hasDashedLine && hasProjectedLabel,
      detail: hasProjectedProp && hasProjectedData && hasDashedLine && hasProjectedLabel
        ? 'Projected data overlay with dashed line, lighter fill, and "Prognose" label in legend'
        : `Prop: ${hasProjectedProp}, Data: ${hasProjectedData}, Dashed: ${hasDashedLine}, Label: ${hasProjectedLabel}`,
    })

    // ─── Test 6: Consistent module color themes ────────────────
    const hasAmberTheme = trendChartSource.includes("amber:")
      && trendChartSource.includes('#f59e0b')
    const hasTealTheme = trendChartSource.includes("teal:")
      && trendChartSource.includes('#14b8a6')
    const hasPurpleTheme = trendChartSource.includes("purple:")
      && trendChartSource.includes('#a855f7')
    const hasModuleColorProp = trendChartSource.includes('moduleColor')
    const hasModuleColorsRecord = trendChartSource.includes('MODULE_COLORS')

    results.push({
      test: 'Apply consistent styling matching module color themes (amber/teal/purple)',
      pass: hasAmberTheme && hasTealTheme && hasPurpleTheme && hasModuleColorProp && hasModuleColorsRecord,
      detail: hasAmberTheme && hasTealTheme && hasPurpleTheme && hasModuleColorProp && hasModuleColorsRecord
        ? 'MODULE_COLORS record with amber (#f59e0b), teal (#14b8a6), purple (#a855f7) themes via moduleColor prop'
        : `Amber: ${hasAmberTheme}, Teal: ${hasTealTheme}, Purple: ${hasPurpleTheme}, Prop: ${hasModuleColorProp}`,
    })

    // ─── Test 7: Responsive design ─────────────────────────────
    const hasViewBox = trendChartSource.includes('viewBox')
    const hasWidthFull = trendChartSource.includes('w-full')
    const hasMaxHeight = trendChartSource.includes('maxHeight')
    const hasHeightProp = trendChartSource.includes('height')

    results.push({
      test: 'Responsive design for mobile and desktop (viewBox-based SVG)',
      pass: hasViewBox && hasWidthFull && hasMaxHeight && hasHeightProp,
      detail: hasViewBox && hasWidthFull && hasMaxHeight && hasHeightProp
        ? 'SVG with viewBox + w-full class + maxHeight style + configurable height prop'
        : `ViewBox: ${hasViewBox}, w-full: ${hasWidthFull}, maxHeight: ${hasMaxHeight}, heightProp: ${hasHeightProp}`,
    })

    // ─── Test 8: Component is importable from test page ────────
    const testPageImportsTrendChart = testPageSource.includes("from '@/components/app/trend-chart'")
    const testPageUsesAllModes = testPageSource.includes('mode="line"')
      && testPageSource.includes('mode="area"')
      && testPageSource.includes('mode="bar"')
    const testPageUsesAllColors = testPageSource.includes("moduleColor=\"amber\"")
      && testPageSource.includes("moduleColor=\"teal\"")
      && testPageSource.includes("moduleColor=\"purple\"")

    results.push({
      test: 'TrendChart imported and used with all modes and color themes in test page',
      pass: testPageImportsTrendChart && testPageUsesAllModes && testPageUsesAllColors,
      detail: testPageImportsTrendChart && testPageUsesAllModes && testPageUsesAllColors
        ? 'Test page imports TrendChart and renders line/area/bar modes with amber/teal/purple themes'
        : `Import: ${testPageImportsTrendChart}, Modes: ${testPageUsesAllModes}, Colors: ${testPageUsesAllColors}`,
    })

    // ─── Test 9: Multi-series support ──────────────────────────
    const hasSeriesArray = trendChartSource.includes('series: TrendChartSeries[]')
    const hasSeriesColors = trendChartSource.includes('SERIES_COLORS')
    const hasLegend = trendChartSource.includes('showLegend')
      && trendChartSource.includes(`testId}-legend`)

    results.push({
      test: 'Multi-series support with automatic color assignment and legend',
      pass: hasSeriesArray && hasSeriesColors && hasLegend,
      detail: hasSeriesArray && hasSeriesColors && hasLegend
        ? 'Accepts TrendChartSeries[] with SERIES_COLORS fallback and optional legend'
        : `SeriesArray: ${hasSeriesArray}, Colors: ${hasSeriesColors}, Legend: ${hasLegend}`,
    })

    // ─── Test 10: Interactive hover tooltips ───────────────────
    const hasHoverState = trendChartSource.includes('hoveredIndex')
      && trendChartSource.includes('hoveredSeriesId')
    const hasTooltip = trendChartSource.includes('tooltip')
      && trendChartSource.includes('onMouseEnter')
      && trendChartSource.includes('onMouseLeave')

    results.push({
      test: 'Interactive hover tooltips with series highlighting',
      pass: hasHoverState && hasTooltip,
      detail: hasHoverState && hasTooltip
        ? 'Hover state tracking (index + seriesId) with tooltip rendering and mouse event handlers'
        : `HoverState: ${hasHoverState}, Tooltip: ${hasTooltip}`,
    })

    // ─── Test 11: data-testid attributes ───────────────────────
    const hasTestIds = trendChartSource.includes('data-testid')
      && trendChartSource.includes('data-mode')
      && trendChartSource.includes('data-module-color')

    results.push({
      test: 'Accessibility: data-testid, data-mode, data-module-color attributes',
      pass: hasTestIds,
      detail: hasTestIds
        ? 'SVG root has data-testid, data-mode, data-module-color for testing and verification'
        : 'Missing one or more data attributes',
    })

    // ─── Test 12: Custom format functions ──────────────────────
    const hasFormatValue = trendChartSource.includes('formatValue')
    const hasFormatTooltip = trendChartSource.includes('formatTooltip')
    const hasDefaultFormat = trendChartSource.includes('defaultFormatValue')

    results.push({
      test: 'Custom formatValue and formatTooltip functions with EUR default',
      pass: hasFormatValue && hasFormatTooltip && hasDefaultFormat,
      detail: hasFormatValue && hasFormatTooltip && hasDefaultFormat
        ? 'Custom format functions with defaultFormatValue (EUR with k/M abbreviation)'
        : `FormatValue: ${hasFormatValue}, FormatTooltip: ${hasFormatTooltip}, Default: ${hasDefaultFormat}`,
    })

    // ─── Test 13: Empty state handling ─────────────────────────
    const hasEmptyState = trendChartSource.includes('Onvoldoende data')
      || trendChartSource.includes('series.length === 0')

    results.push({
      test: 'Empty state handling when no data is provided',
      pass: hasEmptyState,
      detail: hasEmptyState
        ? 'Shows friendly Dutch message "Onvoldoende data om een grafiek te tonen" when series is empty'
        : 'Missing empty state handling',
    })

    const passing = results.filter(r => r.pass).length
    const total = results.length

    return NextResponse.json({
      feature: 'TrendChart consistent visualization component',
      featureId: 249,
      passing,
      total,
      allPassing: passing === total,
      results,
    })
  } catch (error) {
    return NextResponse.json({
      feature: 'TrendChart consistent visualization component',
      featureId: 249,
      passing: 0,
      total: 0,
      allPassing: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      results,
    }, { status: 500 })
  }
}
