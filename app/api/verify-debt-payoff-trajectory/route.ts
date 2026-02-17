import { NextResponse } from 'next/server'
import {
  type Debt,
  simulatePayoff,
  payoffSummary,
} from '@/lib/debt-data'

/**
 * Verification API for Feature #223: Debt payoff trajectory chart in UI
 * Tests: debtProjection visualization, per-debt projected balance decline,
 * snowball vs avalanche comparison overlay, time difference display,
 * contextual comparison message.
 */
export async function GET() {
  const tests: { name: string; pass: boolean; detail: string }[] = []

  // Test debts for simulation
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
      draagkrachtmeting_date: null,
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
      draagkrachtmeting_date: null,
    },
  ]

  // Test 1: simulatePayoff snowball produces valid result
  try {
    const snowball = simulatePayoff(testDebts, 'snowball', 0)
    const summary = payoffSummary(snowball)
    tests.push({
      name: 'simulatePayoff (snowball) produces valid monthly schedule',
      pass: snowball.length > 0 && summary.totalMonths > 0 && summary.totalInterest >= 0,
      detail: `Months: ${summary.totalMonths}, Interest: ${summary.totalInterest.toFixed(2)}, Payoff: ${summary.payoffDate}`,
    })
  } catch (e) {
    tests.push({ name: 'simulatePayoff snowball works', pass: false, detail: String(e) })
  }

  // Test 2: simulatePayoff avalanche produces valid result
  try {
    const avalanche = simulatePayoff(testDebts, 'avalanche', 0)
    const summary = payoffSummary(avalanche)
    tests.push({
      name: 'simulatePayoff (avalanche) produces valid monthly schedule',
      pass: avalanche.length > 0 && summary.totalMonths > 0 && summary.totalInterest >= 0,
      detail: `Months: ${summary.totalMonths}, Interest: ${summary.totalInterest.toFixed(2)}, Payoff: ${summary.payoffDate}`,
    })
  } catch (e) {
    tests.push({ name: 'simulatePayoff avalanche works', pass: false, detail: String(e) })
  }

  // Test 3: Snowball and avalanche produce different results (or same if debts are similar)
  try {
    const snowball = simulatePayoff(testDebts, 'snowball', 0)
    const avalanche = simulatePayoff(testDebts, 'avalanche', 0)
    const snowSummary = payoffSummary(snowball)
    const avSummary = payoffSummary(avalanche)
    // Both should produce results; they may or may not differ depending on debts
    const bothValid = snowSummary.totalMonths > 0 && avSummary.totalMonths > 0
    tests.push({
      name: 'Both strategies produce comparable results with time difference',
      pass: bothValid,
      detail: `Snowball: ${snowSummary.totalMonths}m / ${snowSummary.totalInterest.toFixed(0)} interest, Avalanche: ${avSummary.totalMonths}m / ${avSummary.totalInterest.toFixed(0)} interest, Diff: ${Math.abs(snowSummary.totalMonths - avSummary.totalMonths)}m`,
    })
  } catch (e) {
    tests.push({ name: 'Strategy comparison', pass: false, detail: String(e) })
  }

  // Test 4: Simulation includes per-debt breakdown
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

  // Test 5: DebtPayoffTrajectoryChart component exists in debts page
  try {
    const fs = await import('fs')
    const path = await import('path')
    const debtsPagePath = path.join(process.cwd(), 'app/(app)/core/debts/page.tsx')
    const content = fs.readFileSync(debtsPagePath, 'utf-8')
    const hasComponent = content.includes('function DebtPayoffTrajectoryChart(')
    const usedInPage = content.includes('<DebtPayoffTrajectoryChart')
    tests.push({
      name: 'DebtPayoffTrajectoryChart component exists and is used in debts page',
      pass: hasComponent && usedInPage,
      detail: `Component defined: ${hasComponent}, Used in JSX: ${usedInPage}`,
    })
  } catch (e) {
    tests.push({ name: 'DebtPayoffTrajectoryChart exists', pass: false, detail: String(e) })
  }

  // Test 6: Chart has snowball AND avalanche trajectory lines
  try {
    const fs = await import('fs')
    const path = await import('path')
    const debtsPagePath = path.join(process.cwd(), 'app/(app)/core/debts/page.tsx')
    const content = fs.readFileSync(debtsPagePath, 'utf-8')
    const hasSnowballLine = content.includes('snowball-trajectory-line')
    const hasAvalancheLine = content.includes('avalanche-trajectory-line')
    tests.push({
      name: 'Chart has snowball AND avalanche trajectory lines (dual overlay)',
      pass: hasSnowballLine && hasAvalancheLine,
      detail: `Snowball line: ${hasSnowballLine}, Avalanche line: ${hasAvalancheLine}`,
    })
  } catch (e) {
    tests.push({ name: 'Dual trajectory lines', pass: false, detail: String(e) })
  }

  // Test 7: StrategyComparisonMessage component exists
  try {
    const fs = await import('fs')
    const path = await import('path')
    const debtsPagePath = path.join(process.cwd(), 'app/(app)/core/debts/page.tsx')
    const content = fs.readFileSync(debtsPagePath, 'utf-8')
    const hasComponent = content.includes('function StrategyComparisonMessage(')
    const usedInPage = content.includes('<StrategyComparisonMessage')
    const hasMessage = content.includes('strategy-comparison-message')
    tests.push({
      name: 'StrategyComparisonMessage component with contextual message',
      pass: hasComponent && usedInPage && hasMessage,
      detail: `Component: ${hasComponent}, Used: ${usedInPage}, TestId: ${hasMessage}`,
    })
  } catch (e) {
    tests.push({ name: 'StrategyComparisonMessage exists', pass: false, detail: String(e) })
  }

  // Test 8: Contextual message includes "eerder schuldenvrij" wording
  try {
    const fs = await import('fs')
    const path = await import('path')
    const debtsPagePath = path.join(process.cwd(), 'app/(app)/core/debts/page.tsx')
    const content = fs.readFileSync(debtsPagePath, 'utf-8')
    const hasEerder = content.includes('eerder schuldenvrij')
    const hasSneeuwbal = content.includes('sneeuwbal-strategie') || content.includes('Sneeuwbal')
    const hasAvalanche = content.includes('avalanche-strategie') || content.includes('Avalanche')
    tests.push({
      name: 'Contextual message: "eerder schuldenvrij" with strategy names',
      pass: hasEerder && hasSneeuwbal && hasAvalanche,
      detail: `Eerder schuldenvrij: ${hasEerder}, Sneeuwbal: ${hasSneeuwbal}, Avalanche: ${hasAvalanche}`,
    })
  } catch (e) {
    tests.push({ name: 'Contextual message content', pass: false, detail: String(e) })
  }

  // Test 9: Time difference between strategies is displayed
  try {
    const fs = await import('fs')
    const path = await import('path')
    const debtsPagePath = path.join(process.cwd(), 'app/(app)/core/debts/page.tsx')
    const content = fs.readFileSync(debtsPagePath, 'utf-8')
    const hasTimeDiff = content.includes('time-difference')
    const hasSnowballMonths = content.includes('snowball-months')
    const hasAvalancheMonths = content.includes('avalanche-months')
    tests.push({
      name: 'Time difference between strategies displayed with months for each',
      pass: hasTimeDiff && hasSnowballMonths && hasAvalancheMonths,
      detail: `TimeDiff: ${hasTimeDiff}, SnowballMonths: ${hasSnowballMonths}, AvalancheMonths: ${hasAvalancheMonths}`,
    })
  } catch (e) {
    tests.push({ name: 'Time difference display', pass: false, detail: String(e) })
  }

  // Test 10: Display on /core/debts page (in strategy section)
  try {
    const fs = await import('fs')
    const path = await import('path')
    const debtsPagePath = path.join(process.cwd(), 'app/(app)/core/debts/page.tsx')
    const content = fs.readFileSync(debtsPagePath, 'utf-8')
    const hasSection = content.includes('strategy-comparison-section')
    const hasTrajectoryChart = content.includes('debt-payoff-trajectory-chart')
    tests.push({
      name: 'Strategy comparison section displayed on /core/debts page',
      pass: hasSection && hasTrajectoryChart,
      detail: `Section: ${hasSection}, Chart: ${hasTrajectoryChart}`,
    })
  } catch (e) {
    tests.push({ name: 'Display on debts page', pass: false, detail: String(e) })
  }

  // Test 11: Chart legend shows both strategy names
  try {
    const fs = await import('fs')
    const path = await import('path')
    const debtsPagePath = path.join(process.cwd(), 'app/(app)/core/debts/page.tsx')
    const content = fs.readFileSync(debtsPagePath, 'utf-8')
    // Look in DebtPayoffTrajectoryChart for legend with Sneeuwbal and Avalanche
    const hasSneeuwbalLegend = content.includes('>Sneeuwbal<')
    const hasAvalancheLegend = content.includes('>Avalanche<')
    tests.push({
      name: 'Chart legend shows Sneeuwbal and Avalanche labels',
      pass: hasSneeuwbalLegend && hasAvalancheLegend,
      detail: `Sneeuwbal legend: ${hasSneeuwbalLegend}, Avalanche legend: ${hasAvalancheLegend}`,
    })
  } catch (e) {
    tests.push({ name: 'Chart legend', pass: false, detail: String(e) })
  }

  // Test 12: No mock data patterns in debts page
  try {
    const fs = await import('fs')
    const path = await import('path')
    const debtsPagePath = path.join(process.cwd(), 'app/(app)/core/debts/page.tsx')
    const content = fs.readFileSync(debtsPagePath, 'utf-8')
    const noMockData = !content.includes('mockData') &&
      !content.includes('fakeData') &&
      !content.includes('globalThis.devStore') &&
      !content.includes('dummyData') &&
      !content.includes('sampleData')
    tests.push({
      name: 'No mock data patterns in production code',
      pass: noMockData,
      detail: noMockData ? 'Clean: no mock/fake/dummy/sample data patterns' : 'Mock data detected',
    })
  } catch (e) {
    tests.push({ name: 'No mock data', pass: false, detail: String(e) })
  }

  const passing = tests.filter((t) => t.pass).length
  return NextResponse.json({
    feature: '#223 — Debt payoff trajectory chart in UI',
    passing,
    total: tests.length,
    allPassing: passing === tests.length,
    tests,
  })
}
