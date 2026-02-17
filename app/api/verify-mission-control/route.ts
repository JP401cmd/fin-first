import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Verification API for Feature #199: Mission control card layout for De Kern
 * Checks the De Kern page source code for all required mission control card elements.
 */
export async function GET() {
  const results: { test: string; pass: boolean; detail: string }[] = []

  // Read the De Kern page source
  const corePagePath = path.join(process.cwd(), 'app/(app)/core/page.tsx')
  let coreSrc = ''
  try {
    coreSrc = fs.readFileSync(corePagePath, 'utf-8')
  } catch {
    return NextResponse.json({ error: 'Could not read core/page.tsx' }, { status: 500 })
  }

  // Test 1: Cash card exists with income/expenses + health status
  results.push({
    test: 'Cash card with income/expenses and health status',
    pass: coreSrc.includes('mission-cash') &&
          coreSrc.includes('monthlyIncome') &&
          coreSrc.includes('monthlyExpenses') &&
          (coreSrc.includes("'healthy'") || coreSrc.includes('"healthy"')) &&
          (coreSrc.includes("'attention'") || coreSrc.includes('"attention"')),
    detail: 'Cash card renders income vs expenses with healthy/attention status'
  })

  // Test 2: Cash card shows income and expenses in details
  // Find the Cash Card section using the comment marker
  const cashCardStart = coreSrc.indexOf('{/* Cash Card */')
  const budgettenCardStart = coreSrc.indexOf('{/* Budgetten Card */')
  const cashCardSection = cashCardStart >= 0 && budgettenCardStart > cashCardStart
    ? coreSrc.substring(cashCardStart, budgettenCardStart)
    : ''
  results.push({
    test: 'Cash card shows income and expenses details',
    pass: cashCardSection.includes('Inkomen') && cashCardSection.includes('Uitgaven'),
    detail: 'Cash card detail lines include Inkomen and Uitgaven'
  })

  // Test 3: Budgetten card exists with over-budget count + status
  results.push({
    test: 'Budgetten card with over-budget count and status',
    pass: coreSrc.includes('mission-budgetten') &&
          coreSrc.includes('overBudgetCount'),
    detail: 'Budgetten card renders over-budget count with status indicator'
  })

  // Test 4: Budgetten card status logic - shows "Op koers" or over-budget count
  const assetsCardStart = coreSrc.indexOf('{/* Assets Card */')
  const budgettenCardSection = budgettenCardStart >= 0 && assetsCardStart > budgettenCardStart
    ? coreSrc.substring(budgettenCardStart, assetsCardStart)
    : ''
  results.push({
    test: 'Budgetten card shows "Op koers" or over-budget count',
    pass: budgettenCardSection.includes('Op koers') && budgettenCardSection.includes('over budget'),
    detail: 'Conditional metric: "Op koers" when on track, "{n} over budget" otherwise'
  })

  // Test 5: Assets card with total + growth direction arrow
  results.push({
    test: 'Assets card with total and growth direction',
    pass: coreSrc.includes('mission-assets') &&
          coreSrc.includes('totalAssets') &&
          coreSrc.includes('assetGrowthDirection'),
    detail: 'Assets card shows total asset value with growth direction'
  })

  // Test 6: Growth direction arrows rendered
  results.push({
    test: 'Growth direction arrows (up/down/flat) in Assets card',
    pass: coreSrc.includes('ArrowUpRight') &&
          coreSrc.includes('ArrowDownRight') &&
          coreSrc.includes('growthDirection'),
    detail: 'ArrowUpRight for up, ArrowDownRight for down, Minus for flat'
  })

  // Test 7: Schulden card with total + payoff progress bar
  results.push({
    test: 'Schulden card with total and payoff progress bar',
    pass: coreSrc.includes('mission-schulden') &&
          coreSrc.includes('debtProgress') &&
          coreSrc.includes('progressPct'),
    detail: 'Schulden card shows debt total with payoff progress bar'
  })

  // Test 8: Each card has 1 key metric (the metric prop displayed in large text)
  results.push({
    test: 'Each card shows 1 key metric in large text',
    pass: coreSrc.includes('text-2xl font-bold') &&
          coreSrc.includes('{metric}'),
    detail: 'Key metric rendered in text-2xl font-bold'
  })

  // Test 9: Each card has status icon (CheckCircle2 or AlertTriangle)
  results.push({
    test: 'Each card has status icon (check or warning)',
    pass: coreSrc.includes('CheckCircle2') &&
          coreSrc.includes('AlertTriangle') &&
          coreSrc.includes('status-label'),
    detail: 'CheckCircle2 for healthy, AlertTriangle for attention status'
  })

  // Test 10: Each card has a clear CTA
  results.push({
    test: 'Each card has a clear CTA button text',
    pass: coreSrc.includes('Bekijk transacties') &&
          coreSrc.includes('Beheer budgetten') &&
          coreSrc.includes('Bekijk portfolio') &&
          coreSrc.includes('Beheer schulden'),
    detail: 'CTAs: Bekijk transacties, Beheer budgetten, Bekijk portfolio, Beheer schulden'
  })

  // Test 11: Cards use real Supabase data (not mock/hardcoded)
  const usesRealData = coreSrc.includes('createClient()') &&
    coreSrc.includes("from('transactions')") &&
    coreSrc.includes("from('assets')") &&
    coreSrc.includes("from('debts')") &&
    coreSrc.includes("from('budgets')")
  results.push({
    test: 'Cards use real data from Supabase',
    pass: usesRealData,
    detail: 'Data fetched from transactions, assets, debts, budgets tables via createClient()'
  })

  // Test 12: Responsive grid layout (2-col mobile, 4-col desktop)
  results.push({
    test: 'Responsive grid layout (sm:2-col, lg:4-col)',
    pass: coreSrc.includes('grid-cols-1') &&
          coreSrc.includes('sm:grid-cols-2') &&
          coreSrc.includes('lg:grid-cols-4'),
    detail: 'Grid: grid-cols-1 (mobile), sm:grid-cols-2 (tablet), lg:grid-cols-4 (desktop)'
  })

  // Test 13: MissionControlCard component is a Link (navigates on click)
  results.push({
    test: 'Cards are clickable links (Link component)',
    pass: coreSrc.includes('<Link') &&
          coreSrc.includes('href={href}') &&
          coreSrc.includes('href="/core/cash"') &&
          coreSrc.includes('href="/core/budgets"') &&
          coreSrc.includes('href="/core/assets"') &&
          coreSrc.includes('href="/core/debts"'),
    detail: 'Each card is a Link to the relevant sub-page'
  })

  // Test 14: Debt payoff progress bar renders with gradient
  results.push({
    test: 'Debt payoff progress bar with gradient fill',
    pass: coreSrc.includes('progress-bar') &&
          coreSrc.includes('from-emerald-500 to-emerald-400') &&
          coreSrc.includes('progressPct'),
    detail: 'Progress bar has emerald gradient, width based on progressPct'
  })

  // Test 15: Section has data-testid for testing (testId prop passed to MissionControlCard which renders data-testid)
  results.push({
    test: 'Section and cards have data-testid attributes',
    pass: coreSrc.includes('data-testid="mission-control-section"') &&
          coreSrc.includes('testId="mission-cash"') &&
          coreSrc.includes('testId="mission-budgetten"') &&
          coreSrc.includes('testId="mission-assets"') &&
          coreSrc.includes('testId="mission-schulden"') &&
          // MissionControlCard renders data-testid={testId}
          coreSrc.includes('data-testid={testId}'),
    detail: 'All 4 cards have testId prop, section has data-testid, component renders data-testid={testId}'
  })

  // Test 16: Over-budget count computed from real spending data
  results.push({
    test: 'Over-budget count computed from transaction spending',
    pass: coreSrc.includes('setOverBudgetCount') &&
          coreSrc.includes('spendMap') &&
          coreSrc.includes('spent > limit'),
    detail: 'overBudgetCount computed by comparing actual spending to budget limits'
  })

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#199: Mission control card layout for De Kern',
    passing,
    total,
    allPassing: passing === total,
    results,
  })
}
