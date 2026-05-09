import { NextResponse } from 'next/server'
import {
  type Debt,
  simulatePayoff,
  payoffSummary,
} from '@/lib/debt-data'

/**
 * Verification API for Feature #223: Debt payoff trajectory chart in UI.
 *
 * Updated for the multi-strategy refactor: chart now renders all four
 * payoff strategies (snowball, avalanche, highest_balance, custom) where
 * the active one is rendered thick and the others as thin context lines.
 * Tests inspect the canonical chart component
 * (components/app/core/debts/debt-comparison-chart.tsx) and the wrapper
 * that consumes it (components/core/deepenings/debt-payoff-strategy.tsx).
 */
export async function GET() {
  const tests: { name: string; pass: boolean; detail: string }[] = []

  const testDebts: Debt[] = [
    {
      id: 'test-1', user_id: 'test', name: 'Persoonlijke lening',
      debt_type: 'personal_loan', original_amount: 5000, current_balance: 2800,
      interest_rate: 6.9, minimum_payment: 60, monthly_payment: 60,
      start_date: '2023-01-15', end_date: null, creditor: 'ING',
      notes: null, is_active: true, sort_order: 0,
      created_at: '', updated_at: '', subtype: 'aflopend',
      is_tax_deductible: null, fixed_rate_end_date: null, nhg: null,
      linked_asset_id: null, credit_limit: null, repayment_type: null,
      draagkrachtmeting_date: null, ownership: 'personal', household_id: null,
      net_worth_inclusion_pct: 100, partner_split_pct: null, tax_year: null,
      has_payment_plan: false, has_written_agreement: false,
      include_aflossing_in_savings: false, custom_aflossing_amount: null,
      has_hypotheekplanner_tracking: false,
    },
    {
      id: 'test-2', user_id: 'test', name: 'Studielening DUO',
      debt_type: 'student_loan', original_amount: 18500, current_balance: 14200,
      interest_rate: 0.46, minimum_payment: 85, monthly_payment: 85,
      start_date: '2019-09-01', end_date: null, creditor: 'DUO',
      notes: null, is_active: true, sort_order: 1,
      created_at: '', updated_at: '', subtype: 'oud_stelsel',
      is_tax_deductible: null, fixed_rate_end_date: null, nhg: null,
      linked_asset_id: null, credit_limit: null, repayment_type: null,
      draagkrachtmeting_date: null, ownership: 'personal', household_id: null,
      net_worth_inclusion_pct: 100, partner_split_pct: null, tax_year: null,
      has_payment_plan: false, has_written_agreement: false,
      include_aflossing_in_savings: false, custom_aflossing_amount: null,
      has_hypotheekplanner_tracking: false,
    },
  ]

  const STRATEGIES = ['snowball', 'avalanche', 'highest_balance', 'custom'] as const

  // Test 1-4: alle vier strategieën produceren een geldige simulatie.
  for (const strategy of STRATEGIES) {
    try {
      const months = simulatePayoff(testDebts, strategy, 0)
      const summary = payoffSummary(months)
      tests.push({
        name: `simulatePayoff (${strategy}) produces valid monthly schedule`,
        pass: months.length > 0 && summary.totalMonths > 0 && summary.totalInterest >= 0,
        detail: `Months: ${summary.totalMonths}, Interest: ${summary.totalInterest.toFixed(2)}, Payoff: ${summary.payoffDate}`,
      })
    } catch (e) {
      tests.push({ name: `simulatePayoff ${strategy} works`, pass: false, detail: String(e) })
    }
  }

  // Test 5: extraPayment beïnvloedt de simulatie (ten minste maanden of rente
  // verschilt).
  try {
    const baseline = simulatePayoff(testDebts, 'avalanche', 0)
    const extra = simulatePayoff(testDebts, 'avalanche', 200)
    const baseSummary = payoffSummary(baseline)
    const extraSummary = payoffSummary(extra)
    const monthsDiffer = baseSummary.totalMonths !== extraSummary.totalMonths
    const interestDiffers = Math.abs(baseSummary.totalInterest - extraSummary.totalInterest) > 1
    tests.push({
      name: 'extraPayment shifts payoff timeline (chart reageert op slider)',
      pass: monthsDiffer || interestDiffers,
      detail: `Baseline: ${baseSummary.totalMonths}m / €${baseSummary.totalInterest.toFixed(0)}, +€200: ${extraSummary.totalMonths}m / €${extraSummary.totalInterest.toFixed(0)}`,
    })
  } catch (e) {
    tests.push({ name: 'extraPayment shifts timeline', pass: false, detail: String(e) })
  }

  // Test 6: simulatie bevat per-debt breakdown (chart-data-shape).
  try {
    const snowball = simulatePayoff(testDebts, 'snowball', 0)
    const firstMonth = snowball[0]
    const hasPerDebt = firstMonth?.debts?.length === testDebts.length
    const allHaveBalance = firstMonth?.debts?.every(d => typeof d.balance === 'number') ?? false
    tests.push({
      name: 'Simulation includes per-debt balance decline data',
      pass: hasPerDebt && allHaveBalance,
      detail: `Debts in month 1: ${firstMonth?.debts?.length ?? 0}, All have balance: ${allHaveBalance}`,
    })
  } catch (e) {
    tests.push({ name: 'Per-debt breakdown', pass: false, detail: String(e) })
  }

  // Test 7: chart-component bestaat en exporteert de nieuwe API.
  try {
    const fs = await import('fs')
    const path = await import('path')
    const chartPath = path.join(process.cwd(), 'components/app/core/debts/debt-comparison-chart.tsx')
    const content = fs.readFileSync(chartPath, 'utf-8')
    const hasChart = content.includes('export const DebtPayoffTrajectoryChart')
    const hasMessage = content.includes('export const StrategyComparisonMessage')
    const hasStrategiesProp = content.includes('strategies: StrategyTrajectory[]') || content.includes('strategies,')
    const hasActiveProp = content.includes('activeStrategyId')
    const hasExtraProp = content.includes('extraPayment')
    tests.push({
      name: 'DebtPayoffTrajectoryChart exports new multi-strategy API',
      pass: hasChart && hasMessage && hasStrategiesProp && hasActiveProp && hasExtraProp,
      detail: `Chart: ${hasChart}, Message: ${hasMessage}, strategies prop: ${hasStrategiesProp}, activeStrategyId: ${hasActiveProp}, extraPayment: ${hasExtraProp}`,
    })
  } catch (e) {
    tests.push({ name: 'Chart component API', pass: false, detail: String(e) })
  }

  // Test 8: alle vier strategieën zijn herkend in chart-kleur-palet.
  try {
    const fs = await import('fs')
    const path = await import('path')
    const chartPath = path.join(process.cwd(), 'components/app/core/debts/debt-comparison-chart.tsx')
    const content = fs.readFileSync(chartPath, 'utf-8')
    const hasSnowball = content.includes("snowball: '#3b82f6'")
    const hasAvalanche = content.includes("avalanche: '#ef4444'")
    const hasHighest = content.includes("highest_balance: '#f59e0b'")
    const hasCustom = content.includes("custom: '#8b5cf6'")
    tests.push({
      name: 'Chart palette covers all four strategies (no color collision)',
      pass: hasSnowball && hasAvalanche && hasHighest && hasCustom,
      detail: `snowball:${hasSnowball}, avalanche:${hasAvalanche}, highest_balance:${hasHighest}, custom:${hasCustom}`,
    })
  } catch (e) {
    tests.push({ name: 'Chart palette', pass: false, detail: String(e) })
  }

  // Test 9: caller (debt-payoff-strategy) levert alle vier strategieën aan.
  try {
    const fs = await import('fs')
    const path = await import('path')
    const wrapperPath = path.join(process.cwd(), 'components/core/deepenings/debt-payoff-strategy.tsx')
    const content = fs.readFileSync(wrapperPath, 'utf-8')
    const passesStrategies = content.includes('strategies={strategyTrajectories}')
    const passesActive = content.includes('activeStrategyId={strategy}')
    const passesExtra = content.includes('extraPayment={extraPayment}')
    tests.push({
      name: 'Wrapper passes all four strategy trajectories + active + extra to chart',
      pass: passesStrategies && passesActive && passesExtra,
      detail: `strategies: ${passesStrategies}, activeStrategyId: ${passesActive}, extraPayment: ${passesExtra}`,
    })
  } catch (e) {
    tests.push({ name: 'Wrapper wiring', pass: false, detail: String(e) })
  }

  // Test 10: per-debt thin lines zijn verwijderd uit chart-component.
  try {
    const fs = await import('fs')
    const path = await import('path')
    const chartPath = path.join(process.cwd(), 'components/app/core/debts/debt-comparison-chart.tsx')
    const content = fs.readFileSync(chartPath, 'utf-8')
    const hasPerDebtLoop = content.includes('perDebtPaths') || content.includes('perDebtColors')
    tests.push({
      name: 'Per-debt thin lines removed from chart (visuele ruis weg)',
      pass: !hasPerDebtLoop,
      detail: hasPerDebtLoop ? 'Per-debt loop still present' : 'Per-debt rendering removed',
    })
  } catch (e) {
    tests.push({ name: 'Per-debt removal', pass: false, detail: String(e) })
  }

  // Test 11: chart wordt gebruikt op /core/debts via DebtPayoffStrategy.
  try {
    const fs = await import('fs')
    const path = await import('path')
    const debtsPagePath = path.join(process.cwd(), 'app/(app)/core/debts/page.tsx')
    const content = fs.readFileSync(debtsPagePath, 'utf-8')
    const usesStrategy = content.includes('<DebtPayoffStrategy')
    const importsStrategy = content.includes("from '@/components/core/deepenings/debt-payoff-strategy'")
    tests.push({
      name: 'Strategy section displayed on /core/debts page',
      pass: usesStrategy && importsStrategy,
      detail: `<DebtPayoffStrategy>: ${usesStrategy}, import: ${importsStrategy}`,
    })
  } catch (e) {
    tests.push({ name: 'Display on debts page', pass: false, detail: String(e) })
  }

  const passing = tests.filter((t) => t.pass).length
  return NextResponse.json({
    feature: '#223 — Debt payoff trajectory chart in UI (multi-strategy)',
    passing,
    total: tests.length,
    allPassing: passing === tests.length,
    tests,
  })
}
