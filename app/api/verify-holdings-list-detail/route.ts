import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

/**
 * GET /api/verify-holdings-list-detail
 *
 * Verification endpoint for Feature #252: Holdings list and detail UI components.
 *
 * Tests:
 *   1. HoldingsList component exists for asset detail page
 *   2. Per holding shows: name, ticker, units, current value
 *   3. Per holding shows: P&L (unrealized gain/loss)
 *   4. Per holding shows: daily price change
 *   5. Click holding opens detail view (Link component)
 *   6. Detail view exists with transaction history
 *   7. Detail view shows value chart over time
 */
export async function GET() {
  const results: Array<{ id: number; name: string; pass: boolean; details: string }> = []
  let testId = 0

  const rootDir = process.cwd()

  // Helper: read file content
  function readFile(relPath: string): string {
    try {
      return fs.readFileSync(path.join(rootDir, relPath), 'utf8')
    } catch {
      return ''
    }
  }

  // Helper: check file exists
  function fileExists(relPath: string): boolean {
    try {
      return fs.existsSync(path.join(rootDir, relPath))
    } catch {
      return false
    }
  }

  // ── Test 1: HoldingsList component exists ────────────────────
  testId++
  const holdingsPageContent = readFile('app/(app)/core/assets/holdings/page.tsx')
  const holdingsPageExists = holdingsPageContent.length > 0
  const hasHoldingsMap = holdingsPageContent.includes('holdings.map')
  results.push({
    id: testId,
    name: 'HoldingsList component exists for asset detail page',
    pass: holdingsPageExists && hasHoldingsMap,
    details: holdingsPageExists
      ? `Holdings page found (${holdingsPageContent.length} chars), renders holdings list: ${hasHoldingsMap}`
      : 'Holdings page NOT found',
  })

  // ── Test 2: Per holding shows name, ticker, units, current value ──
  testId++
  const showsName = holdingsPageContent.includes('holding.name')
  const showsTicker = holdingsPageContent.includes('holding.ticker')
  const showsUnits = holdingsPageContent.includes('holding.units')
  const showsValue = holdingsPageContent.includes('holding-value-') || holdingsPageContent.includes('formatCurrency')
  results.push({
    id: testId,
    name: 'Per holding shows: name, ticker, units, current value',
    pass: showsName && showsTicker && showsUnits && showsValue,
    details: `name: ${showsName}, ticker: ${showsTicker}, units: ${showsUnits}, value: ${showsValue}`,
  })

  // ── Test 3: Per holding shows P&L (unrealized gain/loss) ─────
  testId++
  const showsReturnPct = holdingsPageContent.includes('returnPct') || holdingsPageContent.includes('totaal')
  const showsReturnColor = holdingsPageContent.includes('text-emerald-600') && holdingsPageContent.includes('text-red-600')
  results.push({
    id: testId,
    name: 'Per holding shows: P&L (unrealized gain/loss)',
    pass: showsReturnPct && showsReturnColor,
    details: `return percentage: ${showsReturnPct}, colored positive/negative: ${showsReturnColor}`,
  })

  // ── Test 4: Per holding shows daily price change ─────────────
  testId++
  const showsDailyChange = holdingsPageContent.includes('dailyPct') || holdingsPageContent.includes('daily_change_percent')
  const showsDailyTestId = holdingsPageContent.includes('holding-daily-change-')
  results.push({
    id: testId,
    name: 'Per holding shows: daily price change',
    pass: showsDailyChange && showsDailyTestId,
    details: `daily change logic: ${showsDailyChange}, data-testid: ${showsDailyTestId}`,
  })

  // ── Test 5: Click holding opens detail view ──────────────────
  testId++
  const hasLinkToDetail = holdingsPageContent.includes('/core/assets/holdings/${holding.id}') ||
    holdingsPageContent.includes('`/core/assets/holdings/${holding.id}`')
  const hasLinkComponent = holdingsPageContent.includes('holding-link-')
  results.push({
    id: testId,
    name: 'Click holding opens detail view',
    pass: hasLinkToDetail && hasLinkComponent,
    details: `Link to detail: ${hasLinkToDetail}, Link test-id: ${hasLinkComponent}`,
  })

  // ── Test 6: Detail view shows transaction history ────────────
  testId++
  const detailPageContent = readFile('app/(app)/core/assets/holdings/[id]/page.tsx')
  const detailExists = detailPageContent.length > 0
  const hasTransactionLog = detailPageContent.includes('HoldingTransactionLogClient') ||
    detailPageContent.includes('transaction-log-section')
  results.push({
    id: testId,
    name: 'Detail view shows transaction history',
    pass: detailExists && hasTransactionLog,
    details: `detail page: ${detailExists}, transaction log: ${hasTransactionLog}`,
  })

  // ── Test 7: Detail view shows value chart over time ──────────
  testId++
  const hasValueChart = detailPageContent.includes('HoldingValueChartClient') ||
    detailPageContent.includes('value-chart-section')
  const valueChartExists = fileExists('app/(app)/core/assets/holdings/[id]/value-chart-client.tsx')
  results.push({
    id: testId,
    name: 'Detail view shows value chart over time',
    pass: hasValueChart && valueChartExists,
    details: `chart imported in detail page: ${hasValueChart}, chart component exists: ${valueChartExists}`,
  })

  // ── Test 8: Value chart component has SVG rendering ──────────
  testId++
  const chartContent = readFile('app/(app)/core/assets/holdings/[id]/value-chart-client.tsx')
  const hasSvg = chartContent.includes('<svg') || chartContent.includes('viewBox')
  const hasValuePath = chartContent.includes('valuePath') || chartContent.includes('value-chart-svg')
  const hasTooltip = chartContent.includes('HoverTooltip') || chartContent.includes('hoveredIdx')
  results.push({
    id: testId,
    name: 'Value chart has SVG rendering with tooltip',
    pass: hasSvg && hasValuePath && hasTooltip,
    details: `SVG: ${hasSvg}, value path: ${hasValuePath}, tooltip: ${hasTooltip}`,
  })

  // ── Test 9: Value history API endpoint exists ────────────────
  testId++
  const valueHistoryApiExists = fileExists('app/api/holdings/[id]/value-history/route.ts')
  const valueHistoryContent = readFile('app/api/holdings/[id]/value-history/route.ts')
  const hasAuthCheck = valueHistoryContent.includes('auth.getUser')
  const returnsHistory = valueHistoryContent.includes('history')
  results.push({
    id: testId,
    name: 'Value history API endpoint exists with auth',
    pass: valueHistoryApiExists && hasAuthCheck && returnsHistory,
    details: `exists: ${valueHistoryApiExists}, auth: ${hasAuthCheck}, returns history: ${returnsHistory}`,
  })

  // ── Test 10: Value chart shows cost basis comparison ─────────
  testId++
  const hasCostBasis = chartContent.includes('cost_basis') || chartContent.includes('costPath')
  const hasCostLegend = chartContent.includes('Kostenbasis')
  results.push({
    id: testId,
    name: 'Value chart shows cost basis comparison line',
    pass: hasCostBasis && hasCostLegend,
    details: `cost basis data: ${hasCostBasis}, legend label: ${hasCostLegend}`,
  })

  // ── Test 11: Detail page shows holding KPIs ──────────────────
  testId++
  const hasKpiGrid = detailPageContent.includes('holding-kpis')
  const hasHoldingValue = detailPageContent.includes('holding-value')
  const hasHoldingUnits = detailPageContent.includes('holding-units')
  const hasHoldingReturn = detailPageContent.includes('holding-return')
  results.push({
    id: testId,
    name: 'Detail page shows holding KPIs (value, units, return)',
    pass: hasKpiGrid && hasHoldingValue && hasHoldingUnits && hasHoldingReturn,
    details: `KPI grid: ${hasKpiGrid}, value: ${hasHoldingValue}, units: ${hasHoldingUnits}, return: ${hasHoldingReturn}`,
  })

  // ── Test 12: Holdings list has clickable Link wrapper ────────
  testId++
  const hasLinkImport = holdingsPageContent.includes("import Link from 'next/link'")
  const hasLinkWrapping = holdingsPageContent.includes('<Link') && holdingsPageContent.includes('</Link>')
  const linksToHoldingDetail = holdingsPageContent.includes('core/assets/holdings/')
  results.push({
    id: testId,
    name: 'Holdings list items are wrapped with clickable Link',
    pass: hasLinkImport && hasLinkWrapping && linksToHoldingDetail,
    details: `Link import: ${hasLinkImport}, Link wrapping: ${hasLinkWrapping}, links to detail: ${linksToHoldingDetail}`,
  })

  // ── Test 13: Transaction log component exists and renders ────
  testId++
  const txLogClientExists = fileExists('app/(app)/core/assets/holdings/[id]/transaction-log-client.tsx')
  const txLogComponentExists = fileExists('components/app/holding-transaction-log.tsx')
  const txLogContent = readFile('components/app/holding-transaction-log.tsx')
  const hasTxList = txLogContent.includes('transaction-list') || txLogContent.includes('transaction-item-')
  const hasPnlSummary = txLogContent.includes('pnl-summary') || txLogContent.includes('realized-pnl')
  results.push({
    id: testId,
    name: 'Transaction log component with P&L summary',
    pass: txLogClientExists && txLogComponentExists && hasTxList && hasPnlSummary,
    details: `client: ${txLogClientExists}, component: ${txLogComponentExists}, tx list: ${hasTxList}, P&L: ${hasPnlSummary}`,
  })

  // ── Test 14: Value chart handles empty state ─────────────────
  testId++
  const hasEmptyState = chartContent.includes('value-chart-empty') ||
    chartContent.includes('Nog niet genoeg data')
  const hasLoadingState = chartContent.includes('value-chart-loading')
  const hasErrorState = chartContent.includes('value-chart-error')
  results.push({
    id: testId,
    name: 'Value chart handles empty/loading/error states',
    pass: hasEmptyState && hasLoadingState && hasErrorState,
    details: `empty: ${hasEmptyState}, loading: ${hasLoadingState}, error: ${hasErrorState}`,
  })

  // Summary
  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#252: Holdings list and detail UI components',
    passing,
    total,
    percentage: ((passing / total) * 100).toFixed(1),
    results,
  })
}
