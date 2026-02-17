import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Verification endpoint for Feature #183: Freedom-time in asset cards and detail
 * Checks that the assets page code includes freedom-time labels in all required locations.
 */
export async function GET() {
  const results: { test: string; passed: boolean; detail: string }[] = []
  const appDir = process.cwd()

  // Read the assets page source code
  const assetsPagePath = path.join(appDir, 'app', '(app)', 'core', 'assets', 'page.tsx')
  let assetsPageSrc = ''
  try {
    assetsPageSrc = fs.readFileSync(assetsPagePath, 'utf-8')
  } catch {
    return NextResponse.json({
      passed: false,
      error: 'Could not read assets page source',
      results: [],
    })
  }

  // Read the format.ts utility source
  const formatPath = path.join(appDir, 'lib', 'format.ts')
  let formatSrc = ''
  try {
    formatSrc = fs.readFileSync(formatPath, 'utf-8')
  } catch {
    return NextResponse.json({
      passed: false,
      error: 'Could not read format.ts source',
      results: [],
    })
  }

  // Test 1: formatWithFreedom utilities are imported
  const hasFormatImport = assetsPageSrc.includes('calculateFreedomTime') && assetsPageSrc.includes('formatFreedomTimeString')
  results.push({
    test: 'Import: calculateFreedomTime and formatFreedomTimeString imported',
    passed: hasFormatImport,
    detail: hasFormatImport
      ? 'Both functions imported from lib/format'
      : 'Missing imports for freedom-time functions',
  })

  // Test 2: dailyExpenses state exists
  const hasDailyExpensesState = assetsPageSrc.includes('dailyExpenses') && assetsPageSrc.includes('setDailyExpenses')
  results.push({
    test: 'State: dailyExpenses state variable exists',
    passed: hasDailyExpensesState,
    detail: hasDailyExpensesState
      ? 'dailyExpenses state with setter found'
      : 'Missing dailyExpenses state',
  })

  // Test 3: Daily expenses calculated from transactions
  const fetchesTransactions = assetsPageSrc.includes("from('transactions')") && assetsPageSrc.includes('monthlyExpenses')
  results.push({
    test: 'Data: Fetches transactions to calculate daily expenses',
    passed: fetchesTransactions,
    detail: fetchesTransactions
      ? 'Transaction fetch and monthlyExpenses calculation found'
      : 'Missing transaction data fetch for daily expenses',
  })

  // Test 4: Freedom-time on total value KPI (data-testid)
  const hasTotalValueFreedom = assetsPageSrc.includes('data-testid="total-value-freedom"')
  results.push({
    test: 'KPI: Total value shows freedom-time subtitle',
    passed: hasTotalValueFreedom,
    detail: hasTotalValueFreedom
      ? 'data-testid="total-value-freedom" found in KPI section'
      : 'Missing freedom-time label on total value KPI',
  })

  // Test 5: Freedom-time on return KPI
  const hasReturnFreedom = assetsPageSrc.includes('data-testid="return-freedom"')
  results.push({
    test: 'KPI: Return shows freedom-time (gewonnen/verloren)',
    passed: hasReturnFreedom,
    detail: hasReturnFreedom
      ? 'data-testid="return-freedom" found with gewonnen/verloren labels'
      : 'Missing freedom-time on return KPI',
  })

  // Test 6: Freedom-time on future value KPI
  const hasFutureValueFreedom = assetsPageSrc.includes('data-testid="future-value-freedom"')
  results.push({
    test: 'KPI: Future value shows freedom-time',
    passed: hasFutureValueFreedom,
    detail: hasFutureValueFreedom
      ? 'data-testid="future-value-freedom" found in KPI section'
      : 'Missing freedom-time on future value KPI',
  })

  // Test 7: Freedom-time on individual asset cards
  const hasAssetCardFreedom = assetsPageSrc.includes('data-testid="asset-card-freedom"')
  results.push({
    test: 'Cards: Individual asset cards show freedom-time',
    passed: hasAssetCardFreedom,
    detail: hasAssetCardFreedom
      ? 'data-testid="asset-card-freedom" found in asset list items'
      : 'Missing freedom-time on asset cards',
  })

  // Test 8: Freedom-time in detail modal value
  const hasDetailValueFreedom = assetsPageSrc.includes('data-testid="detail-value-freedom"')
  results.push({
    test: 'Detail: Asset detail modal shows freedom-time on value',
    passed: hasDetailValueFreedom,
    detail: hasDetailValueFreedom
      ? 'data-testid="detail-value-freedom" found in detail modal'
      : 'Missing freedom-time in asset detail modal value',
  })

  // Test 9: Freedom-time in detail modal return
  const hasDetailReturnFreedom = assetsPageSrc.includes('data-testid="detail-return-freedom"')
  results.push({
    test: 'Detail: Asset detail modal shows freedom-time on return',
    passed: hasDetailReturnFreedom,
    detail: hasDetailReturnFreedom
      ? 'data-testid="detail-return-freedom" found with gewonnen/verloren'
      : 'Missing freedom-time on detail modal return',
  })

  // Test 10: Freedom-time in donut chart center
  const hasDonutFreedom = assetsPageSrc.includes('data-testid="donut-freedom"')
  results.push({
    test: 'Donut: Allocation pie chart center shows freedom-time',
    passed: hasDonutFreedom,
    detail: hasDonutFreedom
      ? 'data-testid="donut-freedom" found in AllocationPie component'
      : 'Missing freedom-time in donut chart center',
  })

  // Test 11: dailyExpenses is passed to AssetDetailModal
  const passedToModal = assetsPageSrc.includes('dailyExpenses={dailyExpenses}')
  results.push({
    test: 'Props: dailyExpenses passed to AssetDetailModal',
    passed: passedToModal,
    detail: passedToModal
      ? 'dailyExpenses prop passed to detail modal'
      : 'dailyExpenses not passed to AssetDetailModal',
  })

  // Test 12: formatWithFreedom utility exists with correct signature
  const hasFormatWithFreedom = formatSrc.includes('export function formatWithFreedom')
  const hasCalculateFreedomTime = formatSrc.includes('export function calculateFreedomTime')
  const hasFormatFreedomTimeString = formatSrc.includes('export function formatFreedomTimeString')
  const allUtilitiesExist = hasFormatWithFreedom && hasCalculateFreedomTime && hasFormatFreedomTimeString
  results.push({
    test: 'Utility: All freedom-time formatting functions exist in lib/format.ts',
    passed: allUtilitiesExist,
    detail: allUtilitiesExist
      ? 'formatWithFreedom, calculateFreedomTime, formatFreedomTimeString all exported'
      : `Missing: ${!hasFormatWithFreedom ? 'formatWithFreedom ' : ''}${!hasCalculateFreedomTime ? 'calculateFreedomTime ' : ''}${!hasFormatFreedomTimeString ? 'formatFreedomTimeString' : ''}`,
  })

  const passing = results.filter((r) => r.passed).length

  return NextResponse.json({
    feature: '#183: Freedom-time in asset cards and detail',
    passed: passing === results.length,
    score: `${passing}/${results.length}`,
    results,
  })
}
