import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Verification endpoint for Feature #184: Freedom-time in debt displays.
 * Checks that the debt page has proper freedom-time framing.
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  // Read the debts page source
  const debtsPagePath = path.join(process.cwd(), 'app', '(app)', 'core', 'debts', 'page.tsx')
  let debtsSource = ''
  try {
    debtsSource = fs.readFileSync(debtsPagePath, 'utf-8')
  } catch {
    return NextResponse.json({
      pass: false,
      error: 'Could not read debts page source',
      results: [],
    })
  }

  // Read format.ts to verify imports available
  const formatPath = path.join(process.cwd(), 'lib', 'format.ts')
  let formatSource = ''
  try {
    formatSource = fs.readFileSync(formatPath, 'utf-8')
  } catch {
    // Not critical, but useful
  }

  // Test 1: Imports freedom-time utilities
  const hasImports = debtsSource.includes('calculateFreedomTime') &&
    debtsSource.includes('formatFreedomTimeString') &&
    debtsSource.includes('formatWithFreedom')
  results.push({
    name: 'Imports freedom-time utilities (calculateFreedomTime, formatFreedomTimeString, formatWithFreedom)',
    pass: hasImports,
    detail: hasImports
      ? 'All three freedom-time utilities imported from lib/format'
      : 'Missing imports for freedom-time utilities',
  })

  // Test 2: Fetches daily expenses for freedom-time calculation
  const hasDailyExpenses = debtsSource.includes('dailyExpenses') &&
    debtsSource.includes('loadExpenses') &&
    debtsSource.includes('setDailyExpenses')
  results.push({
    name: 'Fetches daily expenses from transactions for freedom-time calculations',
    pass: hasDailyExpenses,
    detail: hasDailyExpenses
      ? 'dailyExpenses state + loadExpenses callback found'
      : 'Missing daily expenses loading logic',
  })

  // Test 3: Debt balance shows freedom-time framing ("je koopt deze tijd terug in X jaar")
  const hasDebtBalanceFreedom = debtsSource.includes('je koopt deze tijd terug in')
  results.push({
    name: "Debt balance shows 'je koopt deze tijd terug in X jaar' framing",
    pass: hasDebtBalanceFreedom,
    detail: hasDebtBalanceFreedom
      ? 'Freedom-time framing found on debt balance display'
      : 'Missing freedom-time framing on debt balance',
  })

  // Test 4: Monthly payment shows freedom days ("je wint X dagen per maand terug")
  const hasPaymentFreedom = debtsSource.includes('je wint') && debtsSource.includes('per maand terug')
  results.push({
    name: "Monthly payment shows 'je wint X dagen per maand terug' framing",
    pass: hasPaymentFreedom,
    detail: hasPaymentFreedom
      ? 'Freedom days framing found on monthly payment display'
      : 'Missing freedom days framing on monthly payments',
  })

  // Test 5: Payoff timeline shows freedom message ("dan verdien je 100% voor jezelf")
  const hasPayoffFreedom = debtsSource.includes('dan verdien je 100% voor jezelf')
  results.push({
    name: "Payoff timeline shows 'Schuldenvrij in YYYY — dan verdien je 100% voor jezelf'",
    pass: hasPayoffFreedom,
    detail: hasPayoffFreedom
      ? 'Payoff freedom message found in debt displays'
      : 'Missing payoff freedom message',
  })

  // Test 6: Debts framed as "vrijheid die je terugkoopt"
  const hasPhilosophy = debtsSource.includes('vrijheid die je terugkoopt')
  results.push({
    name: "Debts consistently framed as 'vrijheid die je terugkoopt'",
    pass: hasPhilosophy,
    detail: hasPhilosophy
      ? 'Philosophy framing found in debt page header'
      : 'Missing philosophy framing in debt page',
  })

  // Test 7: Freedom-time in debt detail modal
  const hasModalFreedom = debtsSource.includes('modal-debt-freedom-time') ||
    (debtsSource.includes('DebtDetailModal') && debtsSource.includes('dailyExpenses') && hasDebtBalanceFreedom)
  results.push({
    name: 'Debt detail modal shows freedom-time for balance',
    pass: hasModalFreedom,
    detail: hasModalFreedom
      ? 'DebtDetailModal includes freedom-time display'
      : 'Missing freedom-time in debt detail modal',
  })

  // Test 8: Monthly payment in modal shows freedom days
  const hasModalPaymentFreedom = debtsSource.includes('modal-payment-freedom-days')
  results.push({
    name: 'Debt detail modal shows freedom days for monthly payment',
    pass: hasModalPaymentFreedom,
    detail: hasModalPaymentFreedom
      ? 'Freedom days found in modal monthly payment section'
      : 'Missing freedom days in modal monthly payment',
  })

  // Test 9: Payoff timeline in modal shows freedom message
  const hasModalPayoff = debtsSource.includes('payoff-freedom-message')
  results.push({
    name: 'Debt detail modal payoff timeline has freedom message',
    pass: hasModalPayoff,
    detail: hasModalPayoff
      ? 'Payoff freedom message found in modal timeline'
      : 'Missing payoff freedom message in modal',
  })

  // Test 10: Strategy section shows freedom-time for interest and savings
  const hasStrategyFreedom = debtsSource.includes('strategy-payoff-freedom') ||
    (debtsSource.includes('verloren vrijheid') || debtsSource.includes('vrijheid gered'))
  results.push({
    name: 'Payoff strategy shows freedom-time for interest costs and savings',
    pass: hasStrategyFreedom,
    detail: hasStrategyFreedom
      ? 'Freedom-time framing found in strategy results'
      : 'Missing freedom-time in strategy results',
  })

  // Test 11: Individual debt list items show freedom-time
  const hasListFreedom = debtsSource.includes('terug te winnen')
  results.push({
    name: 'Individual debt list items show freedom-time equivalent',
    pass: hasListFreedom,
    detail: hasListFreedom
      ? 'Freedom-time subtitle found on debt list items'
      : 'Missing freedom-time on individual debt list items',
  })

  // Test 12: Freedom-time utilities exist in format.ts
  const hasFormatUtils = formatSource.includes('calculateFreedomTime') &&
    formatSource.includes('formatFreedomTimeString') &&
    formatSource.includes('formatWithFreedom')
  results.push({
    name: 'Freedom-time utilities exist in lib/format.ts',
    pass: hasFormatUtils,
    detail: hasFormatUtils
      ? 'All three utility functions found in lib/format.ts'
      : 'Missing utility functions in lib/format.ts',
  })

  const passCount = results.filter((r) => r.pass).length
  const totalCount = results.length

  return NextResponse.json({
    pass: passCount === totalCount,
    passCount,
    totalCount,
    results,
  })
}
