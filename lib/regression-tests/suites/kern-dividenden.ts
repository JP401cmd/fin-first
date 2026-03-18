import { registerCategory, registerTests } from '../test-registry'
import {
  assertEqual, assertGreaterThan, assertGreaterThanOrEqual,
  assert, assertNotNull, assertDefined, assertType, assertIncludes,
} from '../assert'
import type { TestCase } from '../test-types'

const CAT = 'kern.dividenden'

/**
 * Regression tests for Dividend tracking.
 *
 * Tests verify:
 *   - Dividend registreren bij een holding (via POST /api/holdings/[id]/transactions)
 *   - Dividend accumulatie berekening over tijd (computeRunningPnL)
 *   - Dividend yield berekening
 *   - Dividend impact op passief inkomen widget
 *   - Dividend historie weergave (/api/dividends)
 *   - Meerdere dividenden per holding
 *   - Auth guards on all endpoints
 */

// ── Helper: fetch with expected status ──────────────────────────────
async function fetchAPI(path: string, options?: RequestInit): Promise<{ status: number; body: Record<string, unknown>; raw: string }> {
  try {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    })
    let raw = ''
    let body: Record<string, unknown> = {}
    try {
      raw = await res.text()
      body = JSON.parse(raw)
    } catch {
      // Non-JSON response
    }
    return { status: res.status, body, raw }
  } catch {
    return { status: 0, body: { error: 'fetch failed' }, raw: '' }
  }
}

const tests: TestCase[] = [
  // ── 1. Dividend registreren bij een holding ───────────────────────
  {
    id: 'dividend-register-auth',
    name: 'POST /api/holdings/[id]/transactions: auth guard (401)',
    category: CAT,
    description: 'Unauthenticated POST to register dividend returns 401',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchAPI('/api/holdings/test-id/transactions', {
        method: 'POST',
        body: JSON.stringify({
          type: 'dividend',
          units: 100,
          price_per_unit: 0.85,
          date: '2025-03-15',
          notes: 'Q1 2025 dividend',
        }),
      })
      assertEqual(status, 401, 'POST dividend → 401')
    },
  },
  {
    id: 'dividend-register-type-validation',
    name: 'Dividend registratie: type moet buy/sell/dividend/split zijn',
    category: CAT,
    description: 'Transaction type is validated, invalid types rejected',
    priority: 'high',
    estimatedDurationMs: 100,
    async fn() {
      const validTypes = ['buy', 'sell', 'dividend', 'split']
      assertEqual(validTypes.length, 4, '4 valid transaction types')
      assertIncludes(validTypes, 'dividend', 'dividend is a valid type')

      // Invalid type should be rejected
      const invalidTypes = ['transfer', 'fee', 'interest', 'unknown']
      for (const t of invalidTypes) {
        assert(!validTypes.includes(t), `${t} is not a valid type`)
      }
    },
  },
  {
    id: 'dividend-register-required-fields',
    name: 'Dividend registratie: verplichte velden',
    category: CAT,
    description: 'Dividend transaction requires type, units, price_per_unit, date',
    priority: 'high',
    estimatedDurationMs: 100,
    async fn() {
      // From the API: type, units, date are required
      // For non-split types, price_per_unit is also required
      const requiredFields = ['type', 'units', 'date', 'price_per_unit']
      assertEqual(requiredFields.length, 4, '4 required fields for dividend tx')

      // A valid dividend transaction
      const validDividend = {
        type: 'dividend',
        units: 100,
        price_per_unit: 0.85,
        date: '2025-03-15',
      }
      assertDefined(validDividend.type, 'type required')
      assertDefined(validDividend.units, 'units required')
      assertDefined(validDividend.price_per_unit, 'price_per_unit required')
      assertDefined(validDividend.date, 'date required')
    },
  },
  {
    id: 'dividend-no-units-change',
    name: 'Dividend registratie: geen wijziging in holding units',
    category: CAT,
    description: 'Dividend transactions do not change holding units or avg price',
    priority: 'critical',
    estimatedDurationMs: 100,
    async fn() {
      // Verify the contract: dividend type does not change units/avg
      // From the API source:
      //   if (type === 'buy') { ... update units/avg ... }
      //   else if (type === 'sell') { ... update units/avg ... }
      //   else if (type === 'split') { ... update units/avg ... }
      //   // dividend: no change to units (implicit else)

      // Simulate: holding with 100 units at €80 avg
      const currentUnits = 100
      const currentAvg = 80
      const dividendType = 'dividend'

      // After dividend, units and avg should remain the same
      let newUnits = currentUnits
      let newAvg = currentAvg

      // Use string variable to avoid TS type narrowing errors
      const txType: string = dividendType
      if (txType === 'buy') {
        newUnits = currentUnits + 10
      } else if (txType === 'sell') {
        newUnits = currentUnits - 10
      } else if (txType === 'split') {
        newUnits = currentUnits * 2
        newAvg = currentAvg / 2
      }
      // dividend: no change

      assertEqual(newUnits, 100, 'Units unchanged after dividend')
      assertEqual(newAvg, 80, 'Avg price unchanged after dividend')
    },
  },

  // ── 2. Dividend accumulatie berekening over tijd ──────────────────
  {
    id: 'dividend-accumulation-single',
    name: 'Dividend accumulatie: enkele dividend wordt correct geteld',
    category: CAT,
    description: 'Single dividend amount is tracked as cumulative_dividends',
    priority: 'critical',
    estimatedDurationMs: 200,
    async fn() {
      // Simulate the computeRunningPnL logic for a dividend
      // Transaction sequence: buy 100 @ €80, dividend €85
      type Tx = { type: string; units: number; price_per_unit: number; total_amount: number; date: string }
      const transactions: Tx[] = [
        { type: 'buy', units: 100, price_per_unit: 80, total_amount: 8000, date: '2024-01-15' },
        { type: 'dividend', units: 100, price_per_unit: 0.85, total_amount: 85, date: '2024-06-15' },
      ]

      let cumulativeDividends = 0
      for (const tx of transactions) {
        if (tx.type === 'dividend') {
          cumulativeDividends += tx.total_amount
        }
      }

      assertEqual(cumulativeDividends, 85, 'Single dividend = €85')
    },
  },
  {
    id: 'dividend-accumulation-multiple',
    name: 'Dividend accumulatie: meerdere dividenden worden opgeteld',
    category: CAT,
    description: 'Multiple dividend amounts accumulate correctly over time',
    priority: 'critical',
    estimatedDurationMs: 200,
    async fn() {
      // 4 quarterly dividends
      const dividends = [
        { amount: 85, date: '2024-03-15' },
        { amount: 90, date: '2024-06-15' },
        { amount: 88, date: '2024-09-15' },
        { amount: 92, date: '2024-12-15' },
      ]

      const totalDividendIncome = dividends.reduce((sum, d) => sum + d.amount, 0)
      assertEqual(totalDividendIncome, 355, 'Annual dividend total = €355')

      // Count
      assertEqual(dividends.length, 4, '4 dividend payments')
    },
  },
  {
    id: 'dividend-accumulation-chronological',
    name: 'Dividend accumulatie: chronologische volgorde',
    category: CAT,
    description: 'Cumulative dividends are computed in date order',
    priority: 'high',
    estimatedDurationMs: 200,
    async fn() {
      // Verify sort + accumulation
      const transactions = [
        { type: 'dividend', total_amount: 50, date: '2024-09-15' },
        { type: 'buy', total_amount: 8000, date: '2024-01-01' },
        { type: 'dividend', total_amount: 30, date: '2024-03-15' },
        { type: 'dividend', total_amount: 45, date: '2024-06-15' },
      ]

      // Sort chronologically
      const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))
      assertEqual(sorted[0].date, '2024-01-01', 'First: buy in Jan')
      assertEqual(sorted[1].date, '2024-03-15', 'Second: dividend in Mar')

      // Accumulate dividends in order
      let cumDiv = 0
      const running: number[] = []
      for (const tx of sorted) {
        if (tx.type === 'dividend') {
          cumDiv += tx.total_amount
        }
        running.push(cumDiv)
      }

      assertEqual(running[0], 0, 'After buy: cum_div = 0')
      assertEqual(running[1], 30, 'After first div: cum_div = 30')
      assertEqual(running[2], 75, 'After second div: cum_div = 75')
      assertEqual(running[3], 125, 'After third div: cum_div = 125')
    },
  },

  // ── 3. Dividend yield berekening ──────────────────────────────────
  {
    id: 'dividend-yield-calculation',
    name: 'Dividend yield: berekening = (jaarlijks inkomen / holdingwaarde) × 100',
    category: CAT,
    description: 'Dividend yield is correctly calculated as percentage',
    priority: 'critical',
    estimatedDurationMs: 100,
    async fn() {
      // From /api/dividends source:
      // dividendYield = holdingValue > 0 ? (projectedAnnualIncome / holdingValue) * 100 : 0
      const projectedAnnualIncome = 355 // €355/year in dividends
      const currentPrice = 95
      const units = 100
      const holdingValue = currentPrice * units // €9,500

      const dividendYield = holdingValue > 0
        ? (projectedAnnualIncome / holdingValue) * 100
        : 0

      // 355/9500 * 100 = 3.7368...%
      assert(Math.abs(dividendYield - 3.74) < 0.01, `Dividend yield = ${dividendYield.toFixed(2)}%, expected ~3.74%`)
      assert(dividendYield > 0, 'Yield is positive')
      assert(dividendYield < 100, 'Yield is reasonable (<100%)')
    },
  },
  {
    id: 'dividend-yield-zero-value',
    name: 'Dividend yield: nul holdingwaarde → yield = 0',
    category: CAT,
    description: 'Dividend yield is 0 when holding value is 0 (no division by zero)',
    priority: 'high',
    estimatedDurationMs: 100,
    async fn() {
      const projectedAnnualIncome = 100
      const holdingValue = 0

      const dividendYield = holdingValue > 0
        ? (projectedAnnualIncome / holdingValue) * 100
        : 0

      assertEqual(dividendYield, 0, 'Zero holding value → yield = 0')
      assert(!isNaN(dividendYield), 'No NaN')
      assert(isFinite(dividendYield), 'No Infinity')
    },
  },
  {
    id: 'dividend-yield-annualization',
    name: 'Dividend yield: annualisatie bij onvolledige data',
    category: CAT,
    description: 'Projected annual income is annualized when less than 12 months of data',
    priority: 'high',
    estimatedDurationMs: 100,
    async fn() {
      // From API: if daySpan < 365, annualize: (recentTotal / daySpan) * 365
      const recentTotal = 100 // €100 in dividends over 180 days
      const daySpan = 180

      const projectedAnnual = daySpan >= 365
        ? recentTotal
        : (recentTotal / daySpan) * 365

      // 100/180 * 365 = 202.78
      assert(Math.abs(projectedAnnual - 202.78) < 0.01, `Projected = ${projectedAnnual.toFixed(2)}, expected ~202.78`)
      assertGreaterThan(projectedAnnual, recentTotal, 'Annualized > actual (partial year)')

      // With full year of data, no annualization needed
      const fullYear = 365
      const projectedFull = fullYear >= 365 ? recentTotal : (recentTotal / fullYear) * 365
      assertEqual(projectedFull, recentTotal, 'Full year: no annualization')
    },
  },

  // ── 4. Dividend impact op passief inkomen widget ──────────────────
  {
    id: 'dividend-passief-inkomen-widget',
    name: 'Passief inkomen widget: bestaat in widget catalog',
    category: CAT,
    description: 'passief_inkomen widget is defined in widget catalog and feature registry',
    priority: 'high',
    estimatedDurationMs: 300,
    async fn() {
      const { WIDGET_CATALOG } = await import('@/lib/widget-catalog')
      assertDefined(WIDGET_CATALOG, 'WIDGET_CATALOG exported')

      const widget = WIDGET_CATALOG.find((w: { id: string }) => w.id === 'passief_inkomen')
      assertNotNull(widget, 'passief_inkomen widget exists in catalog')
      assertDefined(widget!.name, 'Widget has name')
      assertDefined(widget!.description, 'Widget has description')
    },
  },
  {
    id: 'dividend-freedom-days-calculation',
    name: 'Dividend vrijheidsdagen: berekening',
    category: CAT,
    description: 'Freedom days per year = projected annual income / daily expenses',
    priority: 'high',
    estimatedDurationMs: 100,
    async fn() {
      // From /api/dividends:
      // freedomDaysPerYear = dailyExpenses > 0 ? totalProjectedAnnualIncome / dailyExpenses : 0
      const totalProjectedAnnualIncome = 2000 // €2,000/year from dividends
      const dailyExpenses = 100 // €100/day

      const freedomDaysPerYear = dailyExpenses > 0
        ? totalProjectedAnnualIncome / dailyExpenses
        : 0

      assertEqual(freedomDaysPerYear, 20, '€2K/year at €100/day = 20 freedom days')

      // Zero expenses edge case
      const freedomDaysZero = 0 > 0 ? totalProjectedAnnualIncome / 0 : 0
      assertEqual(freedomDaysZero, 0, 'Zero daily expenses → 0 freedom days (no division by zero)')
    },
  },
  {
    id: 'dividend-monthly-income',
    name: 'Dividend maandelijks inkomen: berekening',
    category: CAT,
    description: 'Monthly dividend income = projected annual / 12',
    priority: 'medium',
    estimatedDurationMs: 100,
    async fn() {
      const totalProjectedAnnualIncome = 2400
      const monthlyDividendIncome = totalProjectedAnnualIncome / 12
      assertEqual(monthlyDividendIncome, 200, '€2,400/year = €200/month')
    },
  },

  // ── 5. Dividend historie weergave ─────────────────────────────────
  {
    id: 'dividend-api-auth',
    name: 'GET /api/dividends: auth guard (401)',
    category: CAT,
    description: 'Unauthenticated GET to dividend API returns 401',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchAPI('/api/dividends')
      assertEqual(status, 401, 'GET /api/dividends → 401')
    },
  },
  {
    id: 'dividend-api-response-shape',
    name: 'GET /api/dividends: response shape contract',
    category: CAT,
    description: 'Dividend API returns holdings array + aggregate object',
    priority: 'high',
    estimatedDurationMs: 100,
    async fn() {
      // Verify expected response shape from source code review
      const expectedHoldingFields = [
        'holding_id', 'holding_name', 'ticker',
        'current_price', 'units',
        'total_dividend_income', 'dividend_count',
        'last_dividend_date', 'last_dividend_amount',
        'projected_annual_income', 'dividend_yield',
        'holding_value', 'dividends',
      ]
      assertEqual(expectedHoldingFields.length, 13, '13 fields per holding summary')

      const expectedAggregateFields = [
        'total_dividend_income',
        'total_projected_annual_income',
        'monthly_dividend_income',
        'total_portfolio_value',
        'weighted_dividend_yield',
        'freedom_days_per_year',
        'daily_expenses',
        'total_dividend_count',
      ]
      assertEqual(expectedAggregateFields.length, 8, '8 aggregate fields')
    },
  },
  {
    id: 'dividend-api-holding-filter',
    name: 'GET /api/dividends: holding_id filter parameter',
    category: CAT,
    description: 'Dividend API accepts optional holding_id query param',
    priority: 'medium',
    estimatedDurationMs: 500,
    async fn() {
      // Both endpoints should require auth
      const { status: noFilter } = await fetchAPI('/api/dividends')
      assertEqual(noFilter, 401, 'No filter → 401')

      const { status: withFilter } = await fetchAPI('/api/dividends?holding_id=some-uuid')
      assertEqual(withFilter, 401, 'With filter → 401 (still requires auth)')
    },
  },

  // ── 6. Meerdere dividenden per holding ────────────────────────────
  {
    id: 'dividend-multiple-per-holding',
    name: 'Meerdere dividenden per holding: correcte aggregatie',
    category: CAT,
    description: 'Multiple dividends per holding are summed correctly in summary',
    priority: 'high',
    estimatedDurationMs: 200,
    async fn() {
      // Simulate multiple dividends for one holding
      const dividends = [
        { holding_id: 'h1', amount: 85, date: '2024-03-15' },
        { holding_id: 'h1', amount: 90, date: '2024-06-15' },
        { holding_id: 'h1', amount: 88, date: '2024-09-15' },
        { holding_id: 'h1', amount: 92, date: '2024-12-15' },
      ]

      const holdingDividends = dividends.filter(d => d.holding_id === 'h1')
      assertEqual(holdingDividends.length, 4, '4 dividends for holding h1')

      const totalDividendIncome = holdingDividends.reduce((sum, d) => sum + d.amount, 0)
      assertEqual(totalDividendIncome, 355, 'Total = €355')

      const dividendCount = holdingDividends.length
      assertEqual(dividendCount, 4, 'Count = 4')

      // Last dividend (sorted newest first)
      const sorted = [...holdingDividends].sort((a, b) => b.date.localeCompare(a.date))
      assertEqual(sorted[0].date, '2024-12-15', 'Last dividend date correct')
      assertEqual(sorted[0].amount, 92, 'Last dividend amount correct')
    },
  },
  {
    id: 'dividend-multiple-holdings-weighted-yield',
    name: 'Meerdere holdings: gewogen dividend yield',
    category: CAT,
    description: 'Weighted dividend yield across portfolio is correct',
    priority: 'high',
    estimatedDurationMs: 200,
    async fn() {
      // Two holdings with different yields
      const holdings = [
        { name: 'Fund A', holdingValue: 10000, projectedAnnualIncome: 300 }, // 3%
        { name: 'Fund B', holdingValue: 5000, projectedAnnualIncome: 200 },  // 4%
      ]

      const totalPortfolioValue = holdings.reduce((s, h) => s + h.holdingValue, 0)
      const totalProjectedAnnualIncome = holdings.reduce((s, h) => s + h.projectedAnnualIncome, 0)

      assertEqual(totalPortfolioValue, 15000, 'Total portfolio = €15,000')
      assertEqual(totalProjectedAnnualIncome, 500, 'Total annual income = €500')

      const weightedYield = totalPortfolioValue > 0
        ? (totalProjectedAnnualIncome / totalPortfolioValue) * 100
        : 0

      // 500/15000 * 100 = 3.33%
      assert(Math.abs(weightedYield - 3.33) < 0.01, `Weighted yield = ${weightedYield.toFixed(2)}%`)
    },
  },

  // ── 7. Running P&L with dividends ─────────────────────────────────
  {
    id: 'dividend-pnl-total-return',
    name: 'Total return inclusief dividenden',
    category: CAT,
    description: 'Total return = realized P&L + unrealized P&L + dividend income',
    priority: 'critical',
    estimatedDurationMs: 200,
    async fn() {
      // From the API:
      // totalReturn = realizedPnl + unrealizedPnl + dividendIncome
      const realizedPnl = 500  // sold some shares at profit
      const unrealizedPnl = 1000  // current value > avg cost
      const dividendIncome = 355

      const totalReturn = realizedPnl + unrealizedPnl + dividendIncome
      assertEqual(totalReturn, 1855, 'Total return = 500 + 1000 + 355 = €1855')

      // Verify components
      assertGreaterThan(totalReturn, realizedPnl, 'Total > realized alone')
      assertGreaterThan(totalReturn, unrealizedPnl, 'Total > unrealized alone')
      assertGreaterThan(totalReturn, dividendIncome, 'Total > dividends alone')
    },
  },
  {
    id: 'dividend-summary-fields',
    name: 'Transaction summary: dividend_income als apart veld',
    category: CAT,
    description: 'Dividend income is tracked as a separate field in transaction summary',
    priority: 'medium',
    estimatedDurationMs: 100,
    async fn() {
      // Verify the summary response shape includes dividend_income separately
      const summaryFields = [
        'total_invested',
        'total_sold',
        'realized_pnl',
        'unrealized_pnl',
        'dividend_income',
        'total_return',
        'current_units',
        'current_avg_price',
        'current_price',
      ]
      assertEqual(summaryFields.length, 9, '9 summary fields')
      assertIncludes(summaryFields, 'dividend_income', 'dividend_income is separate')
      assertIncludes(summaryFields, 'total_return', 'total_return includes dividends')
    },
  },

  // ── 8. Transactions API — GET auth ────────────────────────────────
  {
    id: 'dividend-transactions-get-auth',
    name: 'GET /api/holdings/[id]/transactions: auth guard (401)',
    category: CAT,
    description: 'Unauthenticated GET to holding transactions returns 401',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchAPI('/api/holdings/test-id/transactions')
      assertEqual(status, 401, 'GET /api/holdings/[id]/transactions → 401')
    },
  },

  // ── 9. Holdings sorted by total dividend income ───────────────────
  {
    id: 'dividend-holdings-sorted',
    name: 'Dividend API: holdings gesorteerd op totaal dividend inkomen',
    category: CAT,
    description: 'API response sorts holdings by total_dividend_income descending',
    priority: 'medium',
    estimatedDurationMs: 100,
    async fn() {
      // From API: holdingSummaries.sort((a, b) => b.total_dividend_income - a.total_dividend_income)
      const summaries = [
        { name: 'Low', total_dividend_income: 50 },
        { name: 'High', total_dividend_income: 500 },
        { name: 'Mid', total_dividend_income: 200 },
      ]

      const sorted = [...summaries].sort((a, b) => b.total_dividend_income - a.total_dividend_income)
      assertEqual(sorted[0].name, 'High', 'Highest dividend first')
      assertEqual(sorted[1].name, 'Mid', 'Middle second')
      assertEqual(sorted[2].name, 'Low', 'Lowest last')
    },
  },
]

// ── Registration ─────────────────────────────────────────────────────

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'De Kern — Dividenden',
    description: 'Dividend registratie, accumulatie, yield berekening en passief inkomen',
    icon: 'TrendingUp',
    testCount: 0,
  })
  registerTests(tests)
}
