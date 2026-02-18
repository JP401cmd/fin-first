import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

/**
 * GET /api/verify-dividend-tracker-code
 *
 * Code-analysis verification for Feature #232: Dividend Tracker.
 * Verifies the implementation by checking that all required code patterns exist.
 * No authentication required — purely analyzes source files.
 *
 * Feature requirements:
 * 1. Track dividend income per holding from dividend transactions
 * 2. Calculate projected annual dividend income
 * 3. Feed dividend income into FIRE passive income calculations
 * 4. Show freedom-time equivalent: 'Je dividendinkomsten dekken X dagen vrijheid per jaar'
 * 5. Display dividend history per holding and aggregate
 * 6. Show dividend yield per holding
 */
export async function GET() {
  const results: { step: string; status: 'pass' | 'fail'; detail: string }[] = []

  function readFile(relativePath: string): string | null {
    try {
      const fullPath = path.join(process.cwd(), relativePath)
      return fs.readFileSync(fullPath, 'utf-8')
    } catch {
      return null
    }
  }

  // ── Test 1: DividendTracker component exists and has required structure ──
  const trackerComponent = readFile('components/app/dividend-tracker.tsx')
  if (trackerComponent) {
    const hasFreedomBanner = trackerComponent.includes('dividend-freedom-banner')
    const hasKpis = trackerComponent.includes('dividend-kpis')
    const hasTotalIncome = trackerComponent.includes('dividend-total-income')
    const hasProjectedAnnual = trackerComponent.includes('dividend-projected-annual')
    const hasYield = trackerComponent.includes('dividend-yield-aggregate')
    const hasFreedomDays = trackerComponent.includes('dividend-freedom-days')
    const hasHoldingsList = trackerComponent.includes('dividend-holdings-list')
    const hasHistory = trackerComponent.includes('dividend-history-')
    const hasLoadingState = trackerComponent.includes('dividend-tracker-loading')
    const hasEmptyState = trackerComponent.includes('dividend-tracker-empty')
    const hasErrorState = trackerComponent.includes('dividend-tracker-error')

    const allPresent = hasFreedomBanner && hasKpis && hasTotalIncome && hasProjectedAnnual
      && hasYield && hasFreedomDays && hasHoldingsList && hasHistory
      && hasLoadingState && hasEmptyState && hasErrorState

    results.push({
      step: '1. DividendTracker component structure',
      status: allPresent ? 'pass' : 'fail',
      detail: `Component: freedom-banner=${hasFreedomBanner}, KPIs=${hasKpis}, total-income=${hasTotalIncome}, projected-annual=${hasProjectedAnnual}, yield=${hasYield}, freedom-days=${hasFreedomDays}, holdings-list=${hasHoldingsList}, history=${hasHistory}, loading=${hasLoadingState}, empty=${hasEmptyState}, error=${hasErrorState}`,
    })
  } else {
    results.push({
      step: '1. DividendTracker component structure',
      status: 'fail',
      detail: 'File not found: components/app/dividend-tracker.tsx',
    })
  }

  // ── Test 2: Track dividend income per holding from dividend transactions ──
  const dividendsApi = readFile('app/api/dividends/route.ts')
  if (dividendsApi) {
    const queriesHoldingTransactions = dividendsApi.includes("'holding_transactions'")
    const filtersDividendType = dividendsApi.includes("'dividend'")
    const groupsByHolding = dividendsApi.includes('holding_id')
    const computesTotalPerHolding = dividendsApi.includes('total_dividend_income')
    const hasFallback = dividendsApi.includes('valuations') && dividendsApi.includes('holding_tx_dividend')

    results.push({
      step: '2. Track dividend income per holding',
      status: (queriesHoldingTransactions && filtersDividendType && groupsByHolding && computesTotalPerHolding) ? 'pass' : 'fail',
      detail: `API queries holding_transactions=${queriesHoldingTransactions}, filters dividend=${filtersDividendType}, groups by holding=${groupsByHolding}, computes total=${computesTotalPerHolding}, has valuations fallback=${hasFallback}`,
    })
  } else {
    results.push({
      step: '2. Track dividend income per holding',
      status: 'fail',
      detail: 'File not found: app/api/dividends/route.ts',
    })
  }

  // ── Test 3: Calculate projected annual dividend income ──
  if (dividendsApi) {
    const hasProjectedCalc = dividendsApi.includes('projectedAnnualIncome')
    const hasAnnualization = dividendsApi.includes('365')
    const hasRecentFilter = dividendsApi.includes('oneYearAgo') || dividendsApi.includes('recentDividends')
    const hasDaySpan = dividendsApi.includes('daySpan')

    results.push({
      step: '3. Calculate projected annual dividend income',
      status: (hasProjectedCalc && hasAnnualization && hasDaySpan) ? 'pass' : 'fail',
      detail: `Projected calc=${hasProjectedCalc}, annualization (365)=${hasAnnualization}, recent filter=${hasRecentFilter}, day span=${hasDaySpan}`,
    })
  } else {
    results.push({
      step: '3. Calculate projected annual dividend income',
      status: 'fail',
      detail: 'Already failed in step 2',
    })
  }

  // ── Test 4: Feed dividend income into FIRE passive income calculations ──
  const horizonPage = readFile('app/(app)/horizon/page.tsx')
  if (horizonPage) {
    const fetchesDividends = horizonPage.includes('/api/dividends')
    const hasMonthlyDividendState = horizonPage.includes('monthlyDividendIncome')
    const addsToPassiveIncome = horizonPage.includes('fire.monthlyPassiveIncome + monthlyDividendIncome')
    const showsDividendLine = horizonPage.includes('dividend-passive-income')

    results.push({
      step: '4. Feed into FIRE passive income',
      status: (fetchesDividends && hasMonthlyDividendState && addsToPassiveIncome) ? 'pass' : 'fail',
      detail: `Horizon fetches /api/dividends=${fetchesDividends}, monthlyDividendIncome state=${hasMonthlyDividendState}, adds to passive income=${addsToPassiveIncome}, shows dividend line=${showsDividendLine}`,
    })
  } else {
    results.push({
      step: '4. Feed into FIRE passive income',
      status: 'fail',
      detail: 'File not found: app/(app)/horizon/page.tsx',
    })
  }

  // ── Test 5: Show freedom-time equivalent ──
  if (trackerComponent) {
    const hasFreedomText = trackerComponent.includes('Je dividendinkomsten dekken')
    const hasDaysText = trackerComponent.includes('dagen vrijheid per jaar') || trackerComponent.includes('dag vrijheid per jaar')
    const hasFreedomDaysCalc = dividendsApi?.includes('freedom_days_per_year') ?? false
    const hasDailyExpenses = dividendsApi?.includes('dailyExpenses') ?? false
    const hasFreedomBanner = trackerComponent.includes('Vrijheid door dividenden')

    results.push({
      step: '5. Freedom-time equivalent display',
      status: (hasFreedomText && hasDaysText && hasFreedomDaysCalc) ? 'pass' : 'fail',
      detail: `"Je dividendinkomsten dekken"=${hasFreedomText}, "dagen vrijheid per jaar"=${hasDaysText}, freedom_days_per_year API=${hasFreedomDaysCalc}, daily expenses calc=${hasDailyExpenses}, banner title=${hasFreedomBanner}`,
    })
  } else {
    results.push({
      step: '5. Freedom-time equivalent display',
      status: 'fail',
      detail: 'Already failed in step 1',
    })
  }

  // ── Test 6: Display dividend history per holding and aggregate ──
  if (trackerComponent) {
    const hasExpandableHistory = trackerComponent.includes('expandedHolding')
    const hasChevrons = trackerComponent.includes('ChevronDown') && trackerComponent.includes('ChevronUp')
    const hasDateDisplay = trackerComponent.includes('toLocaleDateString')
    const hasCalendarIcon = trackerComponent.includes('Calendar')
    const hasAggregateKpis = trackerComponent.includes('Totaal ontvangen') && trackerComponent.includes('Verwacht per jaar')
    const hasHoldingDividendList = trackerComponent.includes('uitkering')

    results.push({
      step: '6. Dividend history per holding + aggregate',
      status: (hasExpandableHistory && hasChevrons && hasDateDisplay && hasAggregateKpis) ? 'pass' : 'fail',
      detail: `Expandable history=${hasExpandableHistory}, chevrons=${hasChevrons}, date display=${hasDateDisplay}, calendar icon=${hasCalendarIcon}, aggregate KPIs=${hasAggregateKpis}, holding dividend list=${hasHoldingDividendList}`,
    })
  } else {
    results.push({
      step: '6. Dividend history per holding + aggregate',
      status: 'fail',
      detail: 'Already failed in step 1',
    })
  }

  // ── Test 7: Show dividend yield per holding ──
  if (dividendsApi && trackerComponent) {
    const hasYieldCalcApi = dividendsApi.includes('dividendYield') && dividendsApi.includes('projectedAnnualIncome / holdingValue')
    const hasYieldDisplayComponent = trackerComponent.includes('dividend_yield') && trackerComponent.includes('yield')
    const hasYieldKpi = trackerComponent.includes('Dividendrendement')
    const hasWeightedYield = dividendsApi.includes('weightedDividendYield')

    results.push({
      step: '7. Dividend yield per holding',
      status: (hasYieldCalcApi && hasYieldDisplayComponent && hasYieldKpi) ? 'pass' : 'fail',
      detail: `API yield calc=${hasYieldCalcApi}, component yield display=${hasYieldDisplayComponent}, yield KPI card=${hasYieldKpi}, weighted yield=${hasWeightedYield}`,
    })
  } else {
    results.push({
      step: '7. Dividend yield per holding',
      status: 'fail',
      detail: 'Missing files',
    })
  }

  // ── Test 8: Integration with holdings page ──
  const holdingsPage = readFile('app/(app)/core/assets/holdings/page.tsx')
  if (holdingsPage) {
    const importsDividendTracker = holdingsPage.includes("import DividendTracker from '@/components/app/dividend-tracker'")
      || holdingsPage.includes('import DividendTracker from')
    const rendersDividendTracker = holdingsPage.includes('<DividendTracker')
    const hasDividendSection = holdingsPage.includes('dividend-tracker-section')

    results.push({
      step: '8. Integration with holdings page',
      status: (importsDividendTracker && rendersDividendTracker && hasDividendSection) ? 'pass' : 'fail',
      detail: `Imports DividendTracker=${importsDividendTracker}, renders <DividendTracker>=${rendersDividendTracker}, has section testid=${hasDividendSection}`,
    })
  } else {
    results.push({
      step: '8. Integration with holdings page',
      status: 'fail',
      detail: 'File not found: app/(app)/core/assets/holdings/page.tsx',
    })
  }

  // ── Test 9: API endpoint auth and data structure ──
  if (dividendsApi) {
    const hasAuthCheck = dividendsApi.includes('supabase.auth.getUser')
    const returns401 = dividendsApi.includes('401')
    const returnsHoldings = dividendsApi.includes('holdings:')
    const returnsAggregate = dividendsApi.includes('aggregate:')
    const hasHoldingIdFilter = dividendsApi.includes('holding_id') && dividendsApi.includes('holdingIdFilter')
    const hasMonthlyIncome = dividendsApi.includes('monthly_dividend_income')
    const hasFreedomDays = dividendsApi.includes('freedom_days_per_year')

    results.push({
      step: '9. API auth and response structure',
      status: (hasAuthCheck && returns401 && returnsHoldings && returnsAggregate && hasMonthlyIncome && hasFreedomDays) ? 'pass' : 'fail',
      detail: `Auth check=${hasAuthCheck}, 401 on unauth=${returns401}, returns holdings=${returnsHoldings}, returns aggregate=${returnsAggregate}, holding_id filter=${hasHoldingIdFilter}, monthly income=${hasMonthlyIncome}, freedom days=${hasFreedomDays}`,
    })
  } else {
    results.push({
      step: '9. API auth and response structure',
      status: 'fail',
      detail: 'Already failed',
    })
  }

  // ── Test 10: No mock data patterns ──
  const filesToCheck = [
    'components/app/dividend-tracker.tsx',
    'app/api/dividends/route.ts',
  ]

  const mockPatterns = ['globalThis', 'devStore', 'dev-store', 'mockDb', 'mockData', 'fakeData', 'sampleData', 'dummyData', 'testData', 'STUB', 'MOCK', 'isDevelopment', 'isDev']
  let mockFound = false
  const mockDetails: string[] = []

  for (const file of filesToCheck) {
    const content = readFile(file)
    if (content) {
      for (const pattern of mockPatterns) {
        if (content.includes(pattern)) {
          mockFound = true
          mockDetails.push(`${file}: contains "${pattern}"`)
        }
      }
    }
  }

  results.push({
    step: '10. No mock data patterns',
    status: !mockFound ? 'pass' : 'fail',
    detail: !mockFound
      ? `Checked ${filesToCheck.length} files for ${mockPatterns.length} patterns — all clean`
      : `Found: ${mockDetails.join('; ')}`,
  })

  // ── Summary ──
  const allPassed = results.every(r => r.status === 'pass')

  return NextResponse.json({
    results,
    allPassed,
    passed: results.filter(r => r.status === 'pass').length,
    total: results.length,
  })
}
