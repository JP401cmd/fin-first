import { NextResponse } from 'next/server'
import { buildMonthlyFreedomData } from '@/lib/freedom-days-trend'
import fs from 'fs'
import path from 'path'

export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  function test(name: string, pass: boolean, detail: string) {
    results.push({ name, pass, detail })
  }

  // --- Test 1: buildMonthlyFreedomData returns 12 months ---
  try {
    const data = buildMonthlyFreedomData([])
    test(
      '12 months returned for empty data',
      data.length === 12,
      `Expected 12 months, got ${data.length}`
    )
  } catch (e) {
    test('12 months returned for empty data', false, String(e))
  }

  // --- Test 2: All months have 0 days when no actions ---
  try {
    const data = buildMonthlyFreedomData([])
    const allZero = data.every(m => m.days === 0)
    test(
      'All months zero when no actions',
      allZero,
      `All zero: ${allZero}`
    )
  } catch (e) {
    test('All months zero when no actions', false, String(e))
  }

  // --- Test 3: Actions are grouped by month correctly ---
  try {
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const actions = [
      { freedom_days_impact: 3.5, completed_at: now.toISOString() },
      { freedom_days_impact: 2.1, completed_at: now.toISOString() },
    ]
    const data = buildMonthlyFreedomData(actions)
    const currentEntry = data.find(m => m.month === currentMonth)
    test(
      'Actions grouped by month',
      currentEntry !== undefined && currentEntry.days === 5.6,
      `Current month ${currentMonth}: ${currentEntry?.days} (expected 5.6)`
    )
  } catch (e) {
    test('Actions grouped by month', false, String(e))
  }

  // --- Test 4: Handles null completed_at ---
  try {
    const actions = [
      { freedom_days_impact: 5, completed_at: null },
    ]
    const data = buildMonthlyFreedomData(actions)
    const allZero = data.every(m => m.days === 0)
    test(
      'Skips actions with null completed_at',
      allZero,
      `All zero: ${allZero}`
    )
  } catch (e) {
    test('Skips actions with null completed_at', false, String(e))
  }

  // --- Test 5: Handles zero/negative freedom days ---
  try {
    const now = new Date()
    const actions = [
      { freedom_days_impact: 0, completed_at: now.toISOString() },
      { freedom_days_impact: -2, completed_at: now.toISOString() },
    ]
    const data = buildMonthlyFreedomData(actions)
    const allZero = data.every(m => m.days === 0)
    test(
      'Ignores zero/negative freedom_days_impact',
      allZero,
      `All zero: ${allZero}`
    )
  } catch (e) {
    test('Ignores zero/negative freedom_days_impact', false, String(e))
  }

  // --- Test 6: Months outside 12-month window are ignored ---
  try {
    const oldDate = new Date()
    oldDate.setFullYear(oldDate.getFullYear() - 2)
    const actions = [
      { freedom_days_impact: 10, completed_at: oldDate.toISOString() },
    ]
    const data = buildMonthlyFreedomData(actions)
    const allZero = data.every(m => m.days === 0)
    test(
      'Old actions outside 12-month window ignored',
      allZero,
      `All zero: ${allZero}`
    )
  } catch (e) {
    test('Old actions outside 12-month window ignored', false, String(e))
  }

  // --- Test 7: Month labels are Dutch short format ---
  try {
    const data = buildMonthlyFreedomData([])
    const validLabels = data.every(m => m.label.length >= 2 && m.label.length <= 5)
    test(
      'Month labels are short Dutch format',
      validLabels,
      `Labels: ${data.map(m => m.label).join(', ')}`
    )
  } catch (e) {
    test('Month labels are short Dutch format', false, String(e))
  }

  // --- Test 8: FreedomDaysMonthlyTrend component file exists ---
  try {
    const filePath = path.join(process.cwd(), 'components', 'app', 'will', 'freedom-days-monthly-trend.tsx')
    const exists = fs.existsSync(filePath)
    const content = exists ? fs.readFileSync(filePath, 'utf-8') : ''
    test(
      'FreedomDaysMonthlyTrend component exists',
      exists,
      exists ? `File size: ${content.length} chars` : 'File not found'
    )
  } catch (e) {
    test('FreedomDaysMonthlyTrend component exists', false, String(e))
  }

  // --- Test 9: Component has bar chart SVG ---
  try {
    const filePath = path.join(process.cwd(), 'components', 'app', 'will', 'freedom-days-monthly-trend.tsx')
    const content = fs.readFileSync(filePath, 'utf-8')
    const hasSvg = content.includes('<svg') && content.includes('viewBox')
    const hasRect = content.includes('<rect')
    test(
      'Component renders SVG bar chart',
      hasSvg && hasRect,
      `SVG: ${hasSvg}, Rect bars: ${hasRect}`
    )
  } catch (e) {
    test('Component renders SVG bar chart', false, String(e))
  }

  // --- Test 10: Component shows summary stats ---
  try {
    const filePath = path.join(process.cwd(), 'components', 'app', 'will', 'freedom-days-monthly-trend.tsx')
    const content = fs.readFileSync(filePath, 'utf-8')
    const hasCurrent = content.includes('Deze maand')
    const hasAverage = content.includes('Gemiddeld')
    const hasBest = content.includes('Beste maand')
    test(
      'Shows summary: Deze maand, Gemiddeld, Beste maand',
      hasCurrent && hasAverage && hasBest,
      `Deze maand: ${hasCurrent}, Gemiddeld: ${hasAverage}, Beste maand: ${hasBest}`
    )
  } catch (e) {
    test('Shows summary: Deze maand, Gemiddeld, Beste maand', false, String(e))
  }

  // --- Test 11: Will page imports FreedomDaysMonthlyTrend ---
  try {
    const filePath = path.join(process.cwd(), 'app', '(app)', 'will', 'page.tsx')
    const content = fs.readFileSync(filePath, 'utf-8')
    const hasImport = content.includes('FreedomDaysMonthlyTrend')
    const hasSection = content.includes('freedom-days-monthly-trend') || content.includes('freedom_days_trend')
    test(
      'Will page imports and uses FreedomDaysMonthlyTrend',
      hasImport && hasSection,
      `Import: ${hasImport}, Section: ${hasSection}`
    )
  } catch (e) {
    test('Will page imports and uses FreedomDaysMonthlyTrend', false, String(e))
  }

  // --- Test 12: Will page wraps chart in CollapsibleSection ---
  try {
    const filePath = path.join(process.cwd(), 'app', '(app)', 'will', 'page.tsx')
    const content = fs.readFileSync(filePath, 'utf-8')
    const hasCollapsible = content.includes('wil_freedom_days_trend')
    test(
      'Chart wrapped in CollapsibleSection',
      hasCollapsible,
      `CollapsibleSection key: ${hasCollapsible}`
    )
  } catch (e) {
    test('Chart wrapped in CollapsibleSection', false, String(e))
  }

  // --- Test 13: Handles months with no completed actions (empty bar) ---
  try {
    const now = new Date()
    const actions = [
      { freedom_days_impact: 5, completed_at: now.toISOString() },
    ]
    const data = buildMonthlyFreedomData(actions)
    const emptyMonths = data.filter(m => m.days === 0)
    test(
      'Handles months with no completed actions',
      emptyMonths.length === 11,
      `Empty months: ${emptyMonths.length} (expected 11 of 12)`
    )
  } catch (e) {
    test('Handles months with no completed actions', false, String(e))
  }

  // --- Test 14: Average calculated from non-zero months only ---
  try {
    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15)
    const actions = [
      { freedom_days_impact: 10, completed_at: now.toISOString() },
      { freedom_days_impact: 6, completed_at: lastMonth.toISOString() },
    ]
    const data = buildMonthlyFreedomData(actions)
    const monthsWithData = data.filter(m => m.days > 0)
    const avg = monthsWithData.reduce((sum, m) => sum + m.days, 0) / monthsWithData.length
    test(
      'Average calculated from non-zero months',
      Math.abs(avg - 8) < 0.01,
      `Average: ${avg} (expected 8, from 10 and 6)`
    )
  } catch (e) {
    test('Average calculated from non-zero months', false, String(e))
  }

  // --- Test 15: No-data state rendered ---
  try {
    const filePath = path.join(process.cwd(), 'components', 'app', 'will', 'freedom-days-monthly-trend.tsx')
    const content = fs.readFileSync(filePath, 'utf-8')
    const hasNoData = content.includes('Nog geen voltooide acties')
    test(
      'No-data empty state exists',
      hasNoData,
      `Has no-data message: ${hasNoData}`
    )
  } catch (e) {
    test('No-data empty state exists', false, String(e))
  }

  // --- Test 16: Data-testid attributes present ---
  try {
    const filePath = path.join(process.cwd(), 'components', 'app', 'will', 'freedom-days-monthly-trend.tsx')
    const content = fs.readFileSync(filePath, 'utf-8')
    const testIds = [
      'freedom-days-monthly-trend',
      'freedom-days-trend-summary',
      'trend-summary-current',
      'trend-summary-average',
      'trend-summary-best',
      'freedom-days-bar-chart',
      'freedom-days-no-data',
    ]
    const found = testIds.filter(id => content.includes(id))
    test(
      'Data-testid attributes present',
      found.length === testIds.length,
      `Found ${found.length}/${testIds.length}: ${found.join(', ')}`
    )
  } catch (e) {
    test('Data-testid attributes present', false, String(e))
  }

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    summary: `${passing}/${total} tests passing`,
    passing,
    total,
    results,
  })
}
