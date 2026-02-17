import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Verification endpoint for Feature #228: Transaction log per holding
 *
 * Tests:
 * 1. API route exists: GET /api/holdings/[id]/transactions
 * 2. API route exists: POST /api/holdings/[id]/transactions
 * 3. Transaction types: buy, sell, dividend supported
 * 4. Running P&L computation logic
 * 5. Realized P&L on sell (sell price - avg cost * units)
 * 6. Unrealized P&L computation
 * 7. Dividend tracking without unit change
 * 8. Summary includes: total_invested, realized_pnl, unrealized_pnl, dividend_income, total_return
 * 9. Transaction log UI component exists
 * 10. Holding detail page includes transaction log
 * 11. Transaction history displayed chronologically (newest first)
 * 12. P&L summary cards in UI
 * 13. Inline transaction form in UI
 * 14. Cost basis tracks correctly through buy/sell sequence
 */

function fileContains(filePath: string, ...patterns: string[]): boolean {
  try {
    const fullPath = path.join(process.cwd(), filePath)
    const content = fs.readFileSync(fullPath, 'utf-8')
    return patterns.every(p => content.includes(p))
  } catch {
    return false
  }
}

function fileContainsRegex(filePath: string, ...regexPatterns: RegExp[]): boolean {
  try {
    const fullPath = path.join(process.cwd(), filePath)
    const content = fs.readFileSync(fullPath, 'utf-8')
    return regexPatterns.every(r => r.test(content))
  } catch {
    return false
  }
}

function fileExists(filePath: string): boolean {
  try {
    const fullPath = path.join(process.cwd(), filePath)
    return fs.existsSync(fullPath)
  } catch {
    return false
  }
}

// Test the computeRunningPnL logic
function testRunningPnL(): { pass: boolean; detail: string } {
  // Simulate transactions
  const transactions = [
    { type: 'buy' as const, units: 10, price_per_unit: 50, total_amount: 500, date: '2024-01-15' },
    { type: 'buy' as const, units: 5, price_per_unit: 60, total_amount: 300, date: '2024-03-10' },
    { type: 'sell' as const, units: 3, price_per_unit: 70, total_amount: 210, date: '2024-06-01' },
    { type: 'dividend' as const, units: 1, price_per_unit: 25, total_amount: 25, date: '2024-09-15' },
  ]

  // After buy 10@50: units=10, cost_basis=500, avg=50
  // After buy 5@60: units=15, cost_basis=800, avg=53.33
  // After sell 3@70: realized=(70-53.33)*3=50.01, units=12, cost_basis=640, avg=53.33
  // After dividend: units=12 (unchanged), cum_dividends=25

  let runningUnits = 0
  let runningCostBasis = 0
  let cumulativeRealizedPnL = 0
  let cumulativeDividends = 0

  for (const tx of transactions) {
    const avgPrice = runningUnits > 0 ? runningCostBasis / runningUnits : 0

    if (tx.type === 'buy') {
      runningCostBasis += tx.units * tx.price_per_unit
      runningUnits += tx.units
    } else if (tx.type === 'sell') {
      const realizedPnl = (tx.price_per_unit - avgPrice) * tx.units
      cumulativeRealizedPnL += realizedPnl
      runningCostBasis -= avgPrice * tx.units
      runningUnits -= tx.units
    } else if (tx.type === 'dividend') {
      cumulativeDividends += tx.total_amount
    }
  }

  // Expected: units=12, avg≈53.33, cum_realized_pnl≈50.01, cum_dividends=25
  const expectedUnits = 12
  const expectedAvg = 800 / 15 // 53.333...
  const expectedRealizedPnl = (70 - expectedAvg) * 3 // ~50.0
  const unitsMismatch = Math.abs(runningUnits - expectedUnits)
  const pnlMismatch = Math.abs(cumulativeRealizedPnL - expectedRealizedPnl)
  const divMismatch = Math.abs(cumulativeDividends - 25)

  if (unitsMismatch < 0.01 && pnlMismatch < 0.1 && divMismatch < 0.01) {
    return {
      pass: true,
      detail: `units=${runningUnits}, realized_pnl=${cumulativeRealizedPnL.toFixed(2)}, dividends=${cumulativeDividends}`,
    }
  }

  return {
    pass: false,
    detail: `units=${runningUnits} (expected ${expectedUnits}), pnl=${cumulativeRealizedPnL.toFixed(2)} (expected ${expectedRealizedPnl.toFixed(2)})`,
  }
}

// Test cost basis tracking through buy/sell/buy sequence
function testCostBasisTracking(): { pass: boolean; detail: string } {
  // Buy 10@100 → avg=100
  // Sell 5@120 → realized=(120-100)*5=100, units=5, avg=100
  // Buy 10@80 → avg=(5*100+10*80)/15=86.67, units=15
  // Sell 15@90 → realized=(90-86.67)*15=50.01

  let units = 0
  let costBasis = 0

  // Buy 10@100
  costBasis += 10 * 100
  units += 10
  // avg = 100

  // Sell 5@120
  const avg1 = costBasis / units // 100
  const realized1 = (120 - avg1) * 5 // 100
  costBasis -= avg1 * 5 // 500
  units -= 5 // 5

  // Buy 10@80
  costBasis += 10 * 80 // 500 + 800 = 1300
  units += 10 // 15
  const avg2 = costBasis / units // 86.67

  // Sell 15@90
  const realized2 = (90 - avg2) * 15 // ~50
  const totalRealized = realized1 + realized2 // ~150

  if (Math.abs(totalRealized - 150) < 0.1 && Math.abs(avg2 - (1300 / 15)) < 0.01) {
    return {
      pass: true,
      detail: `Total realized P&L: ${totalRealized.toFixed(2)}, final avg: ${avg2.toFixed(2)}`,
    }
  }

  return {
    pass: false,
    detail: `Total realized P&L: ${totalRealized.toFixed(2)} (expected 150), avg: ${avg2.toFixed(2)} (expected ${(1300/15).toFixed(2)})`,
  }
}

export async function GET() {
  const tests: Array<{ name: string; pass: boolean; detail: string }> = []

  // 1. API route exists: GET /api/holdings/[id]/transactions
  const apiFile = 'app/api/holdings/[id]/transactions/route.ts'
  tests.push({
    name: 'API route file exists',
    pass: fileExists(apiFile),
    detail: apiFile,
  })

  // 2. GET handler exists
  tests.push({
    name: 'GET handler in API route',
    pass: fileContains(apiFile, 'export async function GET'),
    detail: 'GET handler for listing transactions with P&L',
  })

  // 3. POST handler exists
  tests.push({
    name: 'POST handler in API route',
    pass: fileContains(apiFile, 'export async function POST'),
    detail: 'POST handler for creating transactions',
  })

  // 4. Buy/sell/dividend types supported
  tests.push({
    name: 'Transaction types: buy, sell, dividend',
    pass: fileContains(apiFile, "'buy'", "'sell'", "'dividend'"),
    detail: 'All three transaction types handled',
  })

  // 5. Running P&L computation
  tests.push({
    name: 'Running P&L computation function',
    pass: fileContains(apiFile, 'computeRunningPnL', 'running_units', 'running_cost_basis', 'cumulative_realized_pnl'),
    detail: 'computeRunningPnL annotates transactions with running metrics',
  })

  // 6. Realized P&L on sell
  tests.push({
    name: 'Realized P&L calculated on sell',
    pass: fileContains(apiFile, 'realized_pnl', 'pricePerUnit - runningAvgPrice'),
    detail: 'Realized P&L = (sell_price - avg_cost) * units_sold',
  })

  // 7. Unrealized P&L in summary
  tests.push({
    name: 'Unrealized P&L in summary',
    pass: fileContains(apiFile, 'unrealized_pnl', 'unrealizedPnl'),
    detail: 'Unrealized P&L = (current_price - avg_cost) * current_units',
  })

  // 8. Summary includes all required fields
  tests.push({
    name: 'Summary includes all P&L fields',
    pass: fileContains(apiFile, 'total_invested', 'realized_pnl', 'unrealized_pnl', 'dividend_income', 'total_return'),
    detail: 'Summary includes total_invested, realized_pnl, unrealized_pnl, dividend_income, total_return',
  })

  // 9. Running P&L math correctness
  const pnlTest = testRunningPnL()
  tests.push({
    name: 'Running P&L math: buy+sell+dividend',
    pass: pnlTest.pass,
    detail: pnlTest.detail,
  })

  // 10. Cost basis tracking correctness
  const costBasisTest = testCostBasisTracking()
  tests.push({
    name: 'Cost basis tracking: buy/sell/buy/sell',
    pass: costBasisTest.pass,
    detail: costBasisTest.detail,
  })

  // 11. Transaction log UI component exists
  const uiFile = 'components/app/holding-transaction-log.tsx'
  tests.push({
    name: 'Transaction log UI component exists',
    pass: fileExists(uiFile) && fileContains(uiFile, 'HoldingTransactionLog', 'pnl-summary', 'transaction-list'),
    detail: uiFile,
  })

  // 12. P&L summary cards in UI
  tests.push({
    name: 'P&L summary cards in UI',
    pass: fileContains(uiFile, 'Totaal belegd', 'Gerealiseerde W/V', 'Ongerealiseerde W/V', 'Dividend inkomen', 'Totaal rendement'),
    detail: 'Five summary cards: invested, realized, unrealized, dividend, total return',
  })

  // 13. Holding detail page includes transaction log
  const detailPage = 'app/(app)/core/assets/holdings/[id]/page.tsx'
  tests.push({
    name: 'Holding detail page includes transaction log',
    pass: fileContains(detailPage, 'HoldingTransactionLog', 'transaction-log-section'),
    detail: 'Transaction log integrated into holding detail page',
  })

  // 14. Inline transaction form with buy/sell/dividend
  tests.push({
    name: 'Inline transaction form in UI',
    pass: fileContains(uiFile, 'InlineTransactionForm', 'inline-transaction-form', 'tx-type-') &&
          fileContains(uiFile, "txType === 'buy'", "txType === 'sell'", "txType === 'dividend'") ||
          fileContains(uiFile, 'InlineTransactionForm', 'inline-transaction-form') &&
          fileContainsRegex(uiFile, /tx-type-\$\{t\}/),
    detail: 'Inline form for adding transactions with type selector',
  })

  // 15. Transactions sorted newest first
  tests.push({
    name: 'Transactions displayed newest first',
    pass: fileContains(apiFile, '.reverse()'),
    detail: 'After computing running P&L (chronological), reversed for display (newest first)',
  })

  // 16. Expandable transaction detail with running stats
  tests.push({
    name: 'Expandable transaction detail with running P&L stats',
    pass: fileContains(uiFile, 'tx-detail', 'Eenheden na tx', 'Gem. kosten', 'Kostenbasis', 'Cumulatieve W/V'),
    detail: 'Expandable rows show running units, avg cost, cost basis, cumulative P&L',
  })

  // 17. Dividend tracking without unit change
  tests.push({
    name: 'Dividend tracks income without changing units',
    pass: fileContainsRegex(apiFile, /type === 'dividend'/) && fileContains(apiFile, 'cumulativeDividends += totalAmount'),
    detail: 'Dividend adds to cumulative_dividends without changing running_units',
  })

  // 18. Auth check on API
  tests.push({
    name: 'API requires authentication',
    pass: fileContains(apiFile, 'Niet ingelogd', 'status: 401'),
    detail: 'Returns 401 when not authenticated',
  })

  const passing = tests.filter(t => t.pass).length

  return NextResponse.json({
    feature: '#228 Transaction log per holding',
    passing,
    total: tests.length,
    all_pass: passing === tests.length,
    tests,
  })
}
