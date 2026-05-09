'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  type Debt,
  simulatePayoff,
  payoffSummary,
  type PayoffStrategy,
} from '@/lib/debt-data'
import { formatCurrency } from '@/components/app/budget-shared'
import {
  DebtPayoffTrajectoryChart,
  StrategyComparisonMessage,
} from '@/components/app/core/debts/debt-comparison-chart'

/**
 * Test page for Feature #223: Debt payoff trajectory chart in UI.
 *
 * Demonstrates the multi-strategy chart:
 * 1. Alle vier strategie-lijnen op de chart, actieve dik gerenderd
 * 2. Chart reageert op extra-aflos parameter
 * 3. Vergelijkings-message volgt de actieve strategie
 */

export default function TestDebtPayoffTrajectoryPage() {
  const [results, setResults] = useState<{ name: string; pass: boolean; detail: string }[]>([])

  const testDebts: Debt[] = useMemo(() => [
    {
      id: 'test-cc', user_id: 'test', name: 'Creditcard',
      debt_type: 'credit_card', original_amount: 3000, current_balance: 2500,
      interest_rate: 18.9, minimum_payment: 50, monthly_payment: 50,
      start_date: '2024-06-01', end_date: null, creditor: 'VISA',
      notes: null, is_active: true, sort_order: 0,
      created_at: '', updated_at: '', subtype: 'regulier',
      is_tax_deductible: null, fixed_rate_end_date: null, nhg: null,
      linked_asset_id: null, credit_limit: 5000, repayment_type: null,
      draagkrachtmeting_date: null,
      ownership: 'personal', household_id: null, net_worth_inclusion_pct: 100, partner_split_pct: null, tax_year: null, has_payment_plan: false, has_written_agreement: false,
      include_aflossing_in_savings: false, custom_aflossing_amount: null, has_hypotheekplanner_tracking: false,
    },
    {
      id: 'test-pl', user_id: 'test', name: 'Persoonlijke lening',
      debt_type: 'personal_loan', original_amount: 8000, current_balance: 5200,
      interest_rate: 6.5, minimum_payment: 120, monthly_payment: 120,
      start_date: '2023-03-01', end_date: null, creditor: 'ING',
      notes: null, is_active: true, sort_order: 1,
      created_at: '', updated_at: '', subtype: 'aflopend',
      is_tax_deductible: null, fixed_rate_end_date: null, nhg: null,
      linked_asset_id: null, credit_limit: null, repayment_type: null,
      draagkrachtmeting_date: null,
      ownership: 'personal', household_id: null, net_worth_inclusion_pct: 100, partner_split_pct: null, tax_year: null, has_payment_plan: false, has_written_agreement: false,
      include_aflossing_in_savings: false, custom_aflossing_amount: null, has_hypotheekplanner_tracking: false,
    },
    {
      id: 'test-sl', user_id: 'test', name: 'Studielening DUO',
      debt_type: 'student_loan', original_amount: 15000, current_balance: 12000,
      interest_rate: 0.46, minimum_payment: 85, monthly_payment: 85,
      start_date: '2019-09-01', end_date: null, creditor: 'DUO',
      notes: null, is_active: true, sort_order: 2,
      created_at: '', updated_at: '', subtype: 'oud_stelsel',
      is_tax_deductible: null, fixed_rate_end_date: null, nhg: null,
      linked_asset_id: null, credit_limit: null, repayment_type: null,
      draagkrachtmeting_date: null,
      ownership: 'personal', household_id: null, net_worth_inclusion_pct: 100, partner_split_pct: null, tax_year: null, has_payment_plan: false, has_written_agreement: false,
      include_aflossing_in_savings: false, custom_aflossing_amount: null, has_hypotheekplanner_tracking: false,
    },
  ], [])

  const dailyExpenses = 80

  const ALL_STRATEGIES: PayoffStrategy[] = useMemo(
    () => ['snowball', 'avalanche', 'highest_balance', 'custom'],
    [],
  )

  // Baseline (€0 extra) trajectories voor chart 1.
  const trajectoriesBaseline = useMemo(
    () =>
      ALL_STRATEGIES.map((id) => {
        const months = simulatePayoff(testDebts, id, 0)
        return { id, months, summary: payoffSummary(months) }
      }),
    [testDebts, ALL_STRATEGIES],
  )

  // +€100/m extra trajectories voor chart 2.
  const trajectoriesExtra = useMemo(
    () =>
      ALL_STRATEGIES.map((id) => {
        const months = simulatePayoff(testDebts, id, 100)
        return { id, months, summary: payoffSummary(months) }
      }),
    [testDebts, ALL_STRATEGIES],
  )

  const baselineSummariesMap = useMemo(() => {
    const map: Partial<Record<PayoffStrategy, ReturnType<typeof payoffSummary>>> = {}
    for (const t of trajectoriesBaseline) map[t.id] = t.summary
    return map
  }, [trajectoriesBaseline])

  const snowballSummary = trajectoriesBaseline.find((t) => t.id === 'snowball')!.summary
  const avalancheSummary = trajectoriesBaseline.find((t) => t.id === 'avalanche')!.summary

  useEffect(() => {
    setTimeout(() => {
      const tests: { name: string; pass: boolean; detail: string }[] = []

      const charts = document.querySelectorAll('[data-testid="debt-payoff-trajectory-chart"]')
      tests.push({
        name: 'Debt payoff trajectory chart renders',
        pass: charts.length >= 1,
        detail: `Charts found: ${charts.length}`,
      })

      const snowballLine = document.querySelector('[data-testid="snowball-trajectory-line"]')
      tests.push({
        name: 'Snowball trajectory line rendered',
        pass: !!snowballLine,
        detail: snowballLine ? 'Snowball line found' : 'Missing snowball line',
      })

      const avalancheLine = document.querySelector('[data-testid="avalanche-trajectory-line"]')
      tests.push({
        name: 'Avalanche trajectory line rendered',
        pass: !!avalancheLine,
        detail: avalancheLine ? 'Avalanche line found' : 'Missing avalanche line',
      })

      const highestLine = document.querySelector('[data-testid="highest_balance-trajectory-line"]')
      tests.push({
        name: 'Highest_balance trajectory line rendered',
        pass: !!highestLine,
        detail: highestLine ? 'Highest_balance line found' : 'Missing highest_balance line',
      })

      const customLine = document.querySelector('[data-testid="custom-trajectory-line"]')
      tests.push({
        name: 'Custom trajectory line rendered',
        pass: !!customLine,
        detail: customLine ? 'Custom line found' : 'Missing custom line',
      })

      const message = document.querySelectorAll('[data-testid="strategy-comparison-message"]')
      tests.push({
        name: 'Comparison message renders',
        pass: message.length >= 1,
        detail: `Messages: ${message.length}`,
      })

      tests.push({
        name: 'Simulation produces valid payoff data',
        pass: snowballSummary.totalMonths > 0 && avalancheSummary.totalMonths > 0,
        detail: `Snowball: ${snowballSummary.totalMonths}m, Avalanche: ${avalancheSummary.totalMonths}m`,
      })

      tests.push({
        name: 'Both charts render (baseline + extra)',
        pass: charts.length >= 2,
        detail: `Total charts: ${charts.length}`,
      })

      setResults(tests)
    }, 200)
  }, [snowballSummary, avalancheSummary])

  const passing = results.filter((r) => r.pass).length
  const total = results.length

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-bold text-zinc-900">
        Test: Schuld-aflostraject — alle 4 strategieën
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Feature #223 — Multi-strategy debt payoff trajectory chart
      </p>

      {results.length > 0 && (
        <div className={`mt-4 border p-4 ${passing === total ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <p className={`text-sm font-bold ${passing === total ? 'text-emerald-700' : 'text-amber-700'}`}>
            {passing}/{total} tests passing
          </p>
          <div className="mt-2 space-y-1">
            {results.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={r.pass ? 'text-emerald-600' : 'text-red-600'}>{r.pass ? 'OK' : 'FAIL'}</span>
                <div>
                  <span className="font-medium text-zinc-900">{r.name}</span>
                  <span className="ml-2 text-zinc-500">{r.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <section className="mt-6 border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-700 mb-1">
          1. Vergelijking zonder extra aflossing — actief: avalanche
        </h2>
        <div className="mb-3 text-xs text-zinc-500">
          3 schulden: Creditcard (€2.500, 18,9%), Pers. lening (€5.200, 6,5%), Studielening (€12.000, 0,46%)
        </div>
        <DebtPayoffTrajectoryChart
          strategies={trajectoriesBaseline}
          activeStrategyId="avalanche"
          extraPayment={0}
        />
        <StrategyComparisonMessage
          baselineSummaries={baselineSummariesMap}
          activeStrategyId="avalanche"
          activeWithExtraSummary={avalancheSummary}
          extraPayment={0}
          dailyExpenses={dailyExpenses}
        />
        <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
          {trajectoriesBaseline.map((t) => (
            <div key={t.id} className="bg-zinc-50 p-3">
              <p className="font-semibold text-zinc-900">{t.id}</p>
              <p className="text-zinc-600">Maanden: {t.summary.totalMonths}</p>
              <p className="text-zinc-600">Totale rente: {formatCurrency(t.summary.totalInterest)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-700 mb-1">
          2. Met €100 extra per maand — actief: avalanche
        </h2>
        <DebtPayoffTrajectoryChart
          strategies={trajectoriesExtra}
          activeStrategyId="avalanche"
          extraPayment={100}
        />
        <StrategyComparisonMessage
          baselineSummaries={baselineSummariesMap}
          activeStrategyId="avalanche"
          activeWithExtraSummary={trajectoriesExtra.find((t) => t.id === 'avalanche')!.summary}
          extraPayment={100}
          dailyExpenses={dailyExpenses}
        />
      </section>
    </div>
  )
}
