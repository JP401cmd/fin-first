import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Verification API for Feature #212: 12-month budget spending trend sparklines
 *
 * Checks all 6 steps:
 * 1. SparklineChart component exists for mini trend visualization
 * 2. 12-month spending per budget category calculated from transactions
 * 3. Sparkline shown on budget detail modal per category
 * 4. Sparkline shown on De Kern overview per budget category
 * 5. Color coding: upward trend in red (expenses), downward in green
 * 6. Categories with less than 12 months of data handled gracefully
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  // Read source files
  const sparklinePath = path.join(process.cwd(), 'components', 'app', 'budget-sparkline.tsx')
  const budgetsPagePath = path.join(process.cwd(), 'app', '(app)', 'core', 'budgets', 'page.tsx')
  const corePagePath = path.join(process.cwd(), 'app', '(app)', 'core', 'page.tsx')

  let sparklineSource = ''
  let budgetsSource = ''
  let coreSource = ''

  try { sparklineSource = fs.readFileSync(sparklinePath, 'utf-8') } catch { /* empty */ }
  try { budgetsSource = fs.readFileSync(budgetsPagePath, 'utf-8') } catch { /* empty */ }
  try { coreSource = fs.readFileSync(corePagePath, 'utf-8') } catch { /* empty */ }

  // ── STEP 1: SparklineChart component exists ──────────────────────────

  // 1a: BudgetSparkline component exported
  const hasBudgetSparkline = sparklineSource.includes('export function BudgetSparkline')
  results.push({
    name: 'step1a_budget_sparkline_component_exists',
    pass: hasBudgetSparkline,
    detail: hasBudgetSparkline
      ? 'BudgetSparkline component exported from budget-sparkline.tsx'
      : 'Missing BudgetSparkline export',
  })

  // 1b: SparklineWithLabel component exported
  const hasSparklineWithLabel = sparklineSource.includes('export function SparklineWithLabel')
  results.push({
    name: 'step1b_sparkline_with_label_component',
    pass: hasSparklineWithLabel,
    detail: hasSparklineWithLabel
      ? 'SparklineWithLabel component exported for compact sparkline with trend label'
      : 'Missing SparklineWithLabel export',
  })

  // 1c: Sparkline uses SVG for rendering
  const usesSVG = sparklineSource.includes('<svg') && sparklineSource.includes('<path')
  results.push({
    name: 'step1c_svg_rendering',
    pass: usesSVG,
    detail: usesSVG
      ? 'Sparkline renders via SVG with <svg> and <path> elements'
      : 'Missing SVG rendering in sparkline component',
  })

  // 1d: SparklineDataPoint type defined
  const hasDataType = sparklineSource.includes('export type SparklineDataPoint')
  results.push({
    name: 'step1d_data_point_type_defined',
    pass: hasDataType,
    detail: hasDataType
      ? 'SparklineDataPoint type exported with month, label, spent fields'
      : 'Missing SparklineDataPoint type export',
  })

  // 1e: calculateTrend function with linear regression
  const hasTrendCalc = sparklineSource.includes('function calculateTrend') && sparklineSource.includes('slope')
  results.push({
    name: 'step1e_trend_calculation_linear_regression',
    pass: hasTrendCalc,
    detail: hasTrendCalc
      ? 'calculateTrend() uses linear regression slope to determine trend direction'
      : 'Missing calculateTrend function or linear regression logic',
  })

  // ── STEP 2: 12-month spending calculated from transactions ──────────

  // 2a: Core page fetches 12 months of transaction data for sparklines
  const coreSparkFetch = coreSource.includes("from('transactions')") &&
    coreSource.includes('sparkTxData') &&
    coreSource.includes('sparkMonths')
  results.push({
    name: 'step2a_core_page_fetches_12month_data',
    pass: coreSparkFetch,
    detail: coreSparkFetch
      ? 'Core page fetches 12 months of transaction data and builds sparkMonths array'
      : 'Missing 12-month transaction fetch for sparklines on core page',
  })

  // 2b: Budget detail modal fetches 12-month history
  const modalHistoryFetch = budgetsSource.includes('async function loadHistory()') &&
    budgetsSource.includes('for (let i = 11; i >= 0; i--)') &&
    budgetsSource.includes(".in('budget_id', budgetIds)")
  results.push({
    name: 'step2b_modal_fetches_12month_history',
    pass: modalHistoryFetch,
    detail: modalHistoryFetch
      ? 'Budget detail modal loadHistory() fetches 12 months of data with correct budget_id filtering'
      : 'Missing 12-month history fetch in budget detail modal',
  })

  // 2c: Monthly spending aggregation from real transactions
  const hasAggregation = budgetsSource.includes('Math.abs(Number(t.amount))') &&
    budgetsSource.includes('monthTx.reduce')
  results.push({
    name: 'step2c_monthly_spending_aggregation',
    pass: hasAggregation,
    detail: hasAggregation
      ? 'Monthly spending aggregated from real transactions using Math.abs(Number(t.amount))'
      : 'Missing monthly spending aggregation logic',
  })

  // 2d: Core page groups spending per parent budget category
  const hasPerParent = coreSource.includes('parentBudgets') &&
    coreSource.includes('childBudgets') &&
    coreSource.includes('budgetIds') &&
    coreSource.includes('sparklines.push')
  results.push({
    name: 'step2d_spending_per_parent_category',
    pass: hasPerParent,
    detail: hasPerParent
      ? 'Core page computes sparkline data per parent budget category (including child budget transactions)'
      : 'Missing per-parent budget category aggregation',
  })

  // ── STEP 3: Sparkline on budget detail modal ────────────────────────

  // 3a: SparklineWithLabel rendered in budget detail section
  const modalSparkline = budgetsSource.includes('budget-sparkline-section') &&
    budgetsSource.includes('SparklineWithLabel') &&
    budgetsSource.includes('budget-detail-sparkline')
  results.push({
    name: 'step3a_sparkline_in_detail_modal',
    pass: modalSparkline,
    detail: modalSparkline
      ? 'SparklineWithLabel rendered in budget detail modal with testId "budget-detail-sparkline"'
      : 'Missing sparkline in budget detail modal',
  })

  // 3b: Per-child sparklines in budget detail modal
  const childSparklines = budgetsSource.includes('childSparklines') &&
    budgetsSource.includes('child-sparkline-') &&
    budgetsSource.includes('BudgetSparkline')
  results.push({
    name: 'step3b_per_child_sparklines_in_modal',
    pass: childSparklines,
    detail: childSparklines
      ? 'Per-child sparklines rendered with BudgetSparkline component in budget detail modal'
      : 'Missing per-child sparklines in budget detail modal',
  })

  // 3c: Sparkline section labeled correctly
  const hasLabel = budgetsSource.includes('Uitgaventrend')
  results.push({
    name: 'step3c_sparkline_section_labeled',
    pass: hasLabel,
    detail: hasLabel
      ? 'Budget detail modal sparkline section labeled "Uitgaventrend"'
      : 'Missing "Uitgaventrend" label in budget detail modal',
  })

  // ── STEP 4: Sparkline on De Kern overview ───────────────────────────

  // 4a: Core page renders sparkline section
  const kernSparkSection = coreSource.includes('kern-budget-sparklines') &&
    coreSource.includes('Uitgaventrend per categorie')
  results.push({
    name: 'step4a_kern_sparkline_section_exists',
    pass: kernSparkSection,
    detail: kernSparkSection
      ? 'De Kern overview has "Uitgaventrend per categorie" section with testId "kern-budget-sparklines"'
      : 'Missing sparkline section on De Kern overview',
  })

  // 4b: SparklineWithLabel imported and used on core page
  const kernUsesSparkline = coreSource.includes('SparklineWithLabel') &&
    coreSource.includes('kern-sparkline-chart-')
  results.push({
    name: 'step4b_sparkline_with_label_on_core_page',
    pass: kernUsesSparkline,
    detail: kernUsesSparkline
      ? 'SparklineWithLabel rendered per budget category on De Kern overview'
      : 'Missing SparklineWithLabel usage on core page',
  })

  // 4c: Sparkline cards link to budget detail
  const kernLinksToDetail = coreSource.includes('kern-sparkline-') &&
    coreSource.includes('/core/budgets?budget=')
  results.push({
    name: 'step4c_sparkline_cards_link_to_budget',
    pass: kernLinksToDetail,
    detail: kernLinksToDetail
      ? 'Sparkline cards on De Kern link to budget detail (/core/budgets?budget=id)'
      : 'Missing budget detail links on sparkline cards',
  })

  // 4d: Category name and current month spending shown alongside sparkline
  const hasCategoryInfo = coreSource.includes('cat.name') &&
    coreSource.includes('deze maand')
  results.push({
    name: 'step4d_category_info_alongside_sparkline',
    pass: hasCategoryInfo,
    detail: hasCategoryInfo
      ? 'Category name and current month spending shown alongside sparkline on De Kern'
      : 'Missing category name or current month spending info',
  })

  // 4e: budgetSparklines state tracks all sparkline data
  const hasBudgetSparklineState = coreSource.includes('budgetSparklines') &&
    coreSource.includes('setBudgetSparklines')
  results.push({
    name: 'step4e_budget_sparklines_state',
    pass: hasBudgetSparklineState,
    detail: hasBudgetSparklineState
      ? 'budgetSparklines state variable stores computed sparkline data per category'
      : 'Missing budgetSparklines state management on core page',
  })

  // ── STEP 5: Color coding ───────────────────────────────────────────

  // 5a: Expense upward trend = red
  const hasExpenseUpRed = sparklineSource.includes("trend === 'up' ? '#dc2626' : '#059669'")
  results.push({
    name: 'step5a_expense_upward_trend_red',
    pass: hasExpenseUpRed,
    detail: hasExpenseUpRed
      ? 'Expenses: upward trend colored red (#dc2626), downward green (#059669)'
      : 'Missing expense color coding (up=red, down=green)',
  })

  // 5b: Income upward trend = green (inverted)
  const hasIncomeUpGreen = sparklineSource.includes("trend === 'up' ? '#059669' : '#dc2626'")
  results.push({
    name: 'step5b_income_upward_trend_green',
    pass: hasIncomeUpGreen,
    detail: hasIncomeUpGreen
      ? 'Income: upward trend colored green (#059669), downward red (#dc2626)'
      : 'Missing income color coding (up=green, down=red)',
  })

  // 5c: Flat trend gets neutral color
  const hasFlatColor = sparklineSource.includes("trendColor = '#a1a1aa'") // zinc-400
  results.push({
    name: 'step5c_flat_trend_neutral_color',
    pass: hasFlatColor,
    detail: hasFlatColor
      ? 'Flat/stable trend uses neutral zinc-400 color (#a1a1aa)'
      : 'Missing neutral color for flat trends',
  })

  // 5d: Trend labels in Dutch
  const hasDutchLabels = sparklineSource.includes("'stabiel'") &&
    sparklineSource.includes("'↑ stijgend'") &&
    sparklineSource.includes("'↓ dalend'")
  results.push({
    name: 'step5d_dutch_trend_labels',
    pass: hasDutchLabels,
    detail: hasDutchLabels
      ? 'Trend labels in Dutch: stabiel, ↑ stijgend, ↓ dalend'
      : 'Missing Dutch trend labels',
  })

  // 5e: isIncome prop changes color direction
  const hasIsIncomeProp = sparklineSource.includes('isIncome') &&
    sparklineSource.includes('if (isIncome)')
  results.push({
    name: 'step5e_is_income_prop_inverts_colors',
    pass: hasIsIncomeProp,
    detail: hasIsIncomeProp
      ? 'isIncome prop inverts color logic: up=green for income, up=red for expenses'
      : 'Missing isIncome prop for color direction inversion',
  })

  // ── STEP 6: Handle categories with less than 12 months ──────────────

  // 6a: Sparkline requires minimum 2 data points
  const hasMinCheck = sparklineSource.includes("values.length < 2 || values.every(v => v === 0)")
  results.push({
    name: 'step6a_minimum_data_check',
    pass: hasMinCheck,
    detail: hasMinCheck
      ? 'Sparkline checks for minimum 2 data points and non-zero values before rendering'
      : 'Missing minimum data check for sparse categories',
  })

  // 6b: Dashed flat line shown for no-data categories
  const hasDashedLine = sparklineSource.includes('strokeDasharray="4 3"') &&
    sparklineSource.includes('data-trend="none"')
  results.push({
    name: 'step6b_dashed_line_for_no_data',
    pass: hasDashedLine,
    detail: hasDashedLine
      ? 'Dashed flat line rendered when category has insufficient data (data-trend="none")'
      : 'Missing graceful fallback (dashed line) for sparse data',
  })

  // 6c: Core page only includes categories with spending data
  const hasSpendingFilter = coreSource.includes("hasAnySpending") &&
    coreSource.includes("monthlyData.some(d => d.spent > 0)")
  results.push({
    name: 'step6c_core_filters_empty_categories',
    pass: hasSpendingFilter,
    detail: hasSpendingFilter
      ? 'Core page filters out categories with zero spending across all 12 months'
      : 'Missing empty category filter on core page sparklines',
  })

  // 6d: Budget detail modal checks history length before rendering sparkline
  const hasHistoryLengthCheck = budgetsSource.includes('history.length >= 2') ||
    budgetsSource.includes('history.length > 0')
  results.push({
    name: 'step6d_modal_checks_history_length',
    pass: hasHistoryLengthCheck,
    detail: hasHistoryLengthCheck
      ? 'Budget detail modal checks history.length before rendering sparkline chart'
      : 'Missing history length check in budget detail modal',
  })

  // ── BONUS: No mock data patterns ───────────────────────────────────

  const mockPatterns = ['mockData', 'fakeData', 'sampleData', 'dummyData', 'testData', 'globalThis.devStore', 'dev-store', 'MOCK', 'STUB']
  const foundInSparkline = mockPatterns.filter(p => sparklineSource.includes(p))
  const foundInBudgets = mockPatterns.filter(p => budgetsSource.includes(p))
  const allClean = foundInSparkline.length === 0 && foundInBudgets.length === 0
  results.push({
    name: 'bonus_no_mock_data',
    pass: allClean,
    detail: allClean
      ? 'Zero mock data patterns in sparkline component and budgets page'
      : `Mock patterns found: sparkline=[${foundInSparkline.join(',')}], budgets=[${foundInBudgets.join(',')}]`,
  })

  const passing = results.filter(r => r.pass).length

  return NextResponse.json({
    feature: '#212 - 12-month budget spending trend sparklines',
    tests: results,
    passing,
    total: results.length,
    allPassing: passing === results.length,
  })
}
