import { NextResponse } from 'next/server'
import {
  type Debt,
  debtProjection,
  amortizationSchedule,
  linearAmortization,
  interestOnlySchedule,
} from '@/lib/debt-data'

/**
 * Verification API for Feature #214: Debt balance trajectory visualization
 * (Superset of Feature #125 — includes sparklines, auto-tracking, loadAllDebtValuations)
 */
export async function GET() {
  const tests: { name: string; pass: boolean; detail: string }[] = []

  // Test 1: amortizationSchedule produces decreasing balance
  try {
    const schedule = amortizationSchedule(10000, 5, 500)
    const firstBalance = schedule[0]?.balance ?? 0
    const lastBalance = schedule[schedule.length - 1]?.balance ?? 0
    const balanceDecreases = firstBalance > lastBalance
    const reachesZero = lastBalance < 1
    tests.push({
      name: 'amortizationSchedule produces decreasing balance ending at zero',
      pass: balanceDecreases && reachesZero,
      detail: `First month: ${firstBalance}, Last month: ${lastBalance}, Months: ${schedule.length}`,
    })
  } catch (e) {
    tests.push({ name: 'amortizationSchedule works', pass: false, detail: String(e) })
  }

  // Test 2: linearAmortization produces linearly decreasing balance
  try {
    const schedule = linearAmortization(10000, 5, 24)
    const firstBalance = schedule[0]?.balance ?? 0
    const midBalance = schedule[11]?.balance ?? 0
    const lastBalance = schedule[schedule.length - 1]?.balance ?? 0
    const linearDecline = firstBalance > midBalance && midBalance > lastBalance
    tests.push({
      name: 'linearAmortization produces linearly decreasing balance',
      pass: linearDecline && lastBalance < 500,
      detail: `Month 1: ${firstBalance.toFixed(0)}, Month 12: ${midBalance.toFixed(0)}, Last: ${lastBalance.toFixed(0)}`,
    })
  } catch (e) {
    tests.push({ name: 'linearAmortization works', pass: false, detail: String(e) })
  }

  // Test 3: interestOnlySchedule keeps balance constant
  try {
    const schedule = interestOnlySchedule(285000, 3.8, 120)
    const firstBalance = schedule[0]?.balance ?? 0
    const lastBalance = schedule[schedule.length - 1]?.balance ?? 0
    const balanceConstant = Math.abs(firstBalance - lastBalance) < 1
    tests.push({
      name: 'interestOnlySchedule keeps balance constant (aflossingsvrij)',
      pass: balanceConstant,
      detail: `First: ${firstBalance}, Last: ${lastBalance}, Months: ${schedule.length}`,
    })
  } catch (e) {
    tests.push({ name: 'interestOnlySchedule works', pass: false, detail: String(e) })
  }

  // Test 4: debtProjection handles annuity correctly
  try {
    const debt: any = {
      id: 'test', user_id: 'test', name: 'Test', debt_type: 'personal_loan',
      original_amount: 10000, current_balance: 6000, interest_rate: 5,
      minimum_payment: 300, monthly_payment: 300, start_date: '2024-01-01',
      end_date: null, creditor: null, notes: null, is_active: true, sort_order: 0,
      created_at: '', updated_at: '', subtype: null, is_tax_deductible: null,
      fixed_rate_end_date: null, nhg: null, linked_asset_id: null, credit_limit: null,
      repayment_type: null, draagkrachtmeting_date: null,
    }
    const proj = debtProjection(debt)
    tests.push({
      name: 'debtProjection (annuity) returns valid months and interest',
      pass: proj.isPayable && proj.monthsToPayoff > 0 && proj.totalInterest >= 0,
      detail: `Months: ${proj.monthsToPayoff}, Interest: ${proj.totalInterest.toFixed(2)}, Date: ${proj.payoffDate}`,
    })
  } catch (e) {
    tests.push({ name: 'debtProjection works', pass: false, detail: String(e) })
  }

  // Test 5: debtProjection handles aflossingsvrij correctly
  try {
    const debt: any = {
      id: 'test', user_id: 'test', name: 'Hypotheek', debt_type: 'mortgage',
      original_amount: 285000, current_balance: 285000, interest_rate: 3.8,
      minimum_payment: 750, monthly_payment: 750, start_date: '2020-06-01',
      end_date: '2050-06-01', creditor: null, notes: null, is_active: true, sort_order: 0,
      created_at: '', updated_at: '', subtype: 'aflossingsvrij', is_tax_deductible: false,
      fixed_rate_end_date: null, nhg: true, linked_asset_id: null, credit_limit: null,
      repayment_type: 'aflossingsvrij', draagkrachtmeting_date: null,
    }
    const proj = debtProjection(debt)
    tests.push({
      name: 'debtProjection (aflossingsvrij) returns valid schedule',
      pass: proj.isPayable && proj.monthsToPayoff > 0 && proj.totalInterest > 0,
      detail: `Months: ${proj.monthsToPayoff}, Interest: ${proj.totalInterest.toFixed(2)}`,
    })
  } catch (e) {
    tests.push({ name: 'debtProjection aflossingsvrij works', pass: false, detail: String(e) })
  }

  // Test 6: Projected data starts at current balance (transition point alignment)
  try {
    const currentBalance = 6000
    const schedule = amortizationSchedule(currentBalance, 5, 300, new Date())
    const firstRow = schedule[0]
    const firstPaymentBalance = firstRow?.balance ?? 0
    const reconstructedStart = firstPaymentBalance + (firstRow?.principal ?? 0)
    const alignsAtTransition = Math.abs(reconstructedStart - currentBalance) < 1
    tests.push({
      name: 'Projected schedule starts at current balance (transition alignment)',
      pass: alignsAtTransition,
      detail: `Current balance: ${currentBalance}, Reconstructed start: ${reconstructedStart.toFixed(2)}`,
    })
  } catch (e) {
    tests.push({ name: 'Transition point alignment', pass: false, detail: String(e) })
  }

  // Test 7: Valuations table exists in Supabase schema
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { error } = await supabase.from('valuations').select('id').limit(1)
    tests.push({
      name: 'Valuations table exists and is queryable',
      pass: !error,
      detail: error ? `Error: ${error.message}` : 'Table accessible',
    })
  } catch (e) {
    tests.push({ name: 'Valuations table exists', pass: false, detail: String(e) })
  }

  // Test 8: DebtTrajectoryChart integrated in debts page with proper data-testids
  try {
    const fs = await import('fs')
    const path = await import('path')
    const debtsPagePath = path.join(process.cwd(), 'app/(app)/core/debts/page.tsx')
    const content = fs.readFileSync(debtsPagePath, 'utf-8')
    const hasComponent = content.includes('DebtTrajectoryChart')
    const hasActualLine = content.includes('actual-balance-line')
    const hasProjectedLine = content.includes('projected-balance-line')
    const hasTransitionPoint = content.includes('transition-point')
    tests.push({
      name: 'DebtTrajectoryChart with actual/projected lines in debt modal',
      pass: hasComponent && hasActualLine && hasProjectedLine && hasTransitionPoint,
      detail: `Component: ${hasComponent}, ActualLine: ${hasActualLine}, ProjectedLine: ${hasProjectedLine}, Transition: ${hasTransitionPoint}`,
    })
  } catch (e) {
    tests.push({ name: 'DebtTrajectoryChart in debt modal', pass: false, detail: String(e) })
  }

  // Test 9: DebtMiniSparkline component exists on debt cards
  try {
    const fs = await import('fs')
    const path = await import('path')
    const debtsPagePath = path.join(process.cwd(), 'app/(app)/core/debts/page.tsx')
    const content = fs.readFileSync(debtsPagePath, 'utf-8')
    const hasMiniSparkline = content.includes('function DebtMiniSparkline(')
    const sparklineOnCards = content.includes('<DebtMiniSparkline')
    const sparklineTestId = content.includes('debt-sparkline-')
    tests.push({
      name: 'DebtMiniSparkline added to debt cards with data-testid',
      pass: hasMiniSparkline && sparklineOnCards && sparklineTestId,
      detail: `Component: ${hasMiniSparkline}, OnCards: ${sparklineOnCards}, TestId: ${sparklineTestId}`,
    })
  } catch (e) {
    tests.push({ name: 'DebtMiniSparkline on cards', pass: false, detail: String(e) })
  }

  // Test 10: Auto-track balance changes via valuations table
  try {
    const fs = await import('fs')
    const path = await import('path')
    const debtsPagePath = path.join(process.cwd(), 'app/(app)/core/debts/page.tsx')
    const content = fs.readFileSync(debtsPagePath, 'utf-8')
    const autoTracksValuations = content.includes("entity_type: 'debt'") &&
      content.includes("from('valuations').upsert") &&
      content.includes('onConflict')
    tests.push({
      name: 'Auto-track balance changes via valuations table on edit',
      pass: autoTracksValuations,
      detail: autoTracksValuations
        ? 'Valuations upsert with debt entity_type and onConflict found in DebtForm'
        : 'Missing auto-valuation tracking',
    })
  } catch (e) {
    tests.push({ name: 'Auto-track valuations', pass: false, detail: String(e) })
  }

  // Test 11: loadAllDebtValuations function loads all valuations for sparklines
  try {
    const fs = await import('fs')
    const path = await import('path')
    const debtsPagePath = path.join(process.cwd(), 'app/(app)/core/debts/page.tsx')
    const content = fs.readFileSync(debtsPagePath, 'utf-8')
    const hasLoadAll = content.includes('loadAllDebtValuations')
    const groupsByEntityId = content.includes('grouped[v.entity_id]') || content.includes('grouped[v.entity_id] = []')
    tests.push({
      name: 'loadAllDebtValuations bulk-loads all debt valuations for sparklines',
      pass: hasLoadAll && groupsByEntityId,
      detail: `loadAllDebtValuations: ${hasLoadAll}, Groups by entity_id: ${groupsByEntityId}`,
    })
  } catch (e) {
    tests.push({ name: 'loadAllDebtValuations', pass: false, detail: String(e) })
  }

  // Test 12: Sparkline has correct debt color logic (down=green, up=red)
  try {
    const fs = await import('fs')
    const path = await import('path')
    const debtsPagePath = path.join(process.cwd(), 'app/(app)/core/debts/page.tsx')
    const content = fs.readFileSync(debtsPagePath, 'utf-8')
    const hasCorrectTrend = content.includes('values[values.length - 1] <= values[0]')
    const hasEmerald = content.includes("'#059669'")
    const hasRed = content.includes("'#dc2626'")
    tests.push({
      name: 'Sparkline color logic: down=green (good for debts), up=red',
      pass: hasCorrectTrend && hasEmerald && hasRed,
      detail: `Trend check: ${hasCorrectTrend}, Green: ${hasEmerald}, Red: ${hasRed}`,
    })
  } catch (e) {
    tests.push({ name: 'Sparkline color logic', pass: false, detail: String(e) })
  }

  // Test 13: Chart legend shows Werkelijk and Verwacht
  try {
    const fs = await import('fs')
    const path = await import('path')
    const debtsPagePath = path.join(process.cwd(), 'app/(app)/core/debts/page.tsx')
    const content = fs.readFileSync(debtsPagePath, 'utf-8')
    const hasWerkelijk = content.includes('Werkelijk')
    const hasVerwacht = content.includes('Verwacht')
    tests.push({
      name: 'Chart legend shows Werkelijk and Verwacht labels',
      pass: hasWerkelijk && hasVerwacht,
      detail: `Werkelijk: ${hasWerkelijk}, Verwacht: ${hasVerwacht}`,
    })
  } catch (e) {
    tests.push({ name: 'Chart legend labels', pass: false, detail: String(e) })
  }

  // Test 14: No mock data patterns
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
      detail: noMockData ? 'No mock/fake/dummy/sample data patterns found' : 'Mock data patterns detected',
    })
  } catch (e) {
    tests.push({ name: 'No mock data', pass: false, detail: String(e) })
  }

  const passing = tests.filter((t) => t.pass).length
  return NextResponse.json({
    feature: '#214 — Debt balance trajectory visualization',
    passing,
    total: tests.length,
    allPassing: passing === tests.length,
    tests,
  })
}
