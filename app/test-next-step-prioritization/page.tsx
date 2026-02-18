'use client'

import { useState, useEffect } from 'react'
import { NextStepSection, computeAllKernSteps, type NextStepSuggestion } from '@/components/app/next-step-card'

type TestResult = {
  name: string
  pass: boolean
  detail: string
}

type VerifyResponse = {
  feature: string
  passing: number
  total: number
  all_pass: boolean
  results: TestResult[]
}

/**
 * Test page for Feature #255: Smart next step algorithm prioritization.
 *
 * Demonstrates the priority ordering:
 * 1. No transactions (import first)
 * 2. No assets (add wealth)
 * 3. Budget alerts (needs attention)
 * 4. No goals (set goals)
 * 5. FIRE unreachable (try scenarios)
 *
 * Maximum 1-2 suggestions per page.
 */
export default function TestNextStepPrioritization() {
  const [verifyData, setVerifyData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-next-step-prioritization')
      .then(r => r.json())
      .then(setVerifyData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Scenario 1: Brand new user — should show import_transactions first
  const scenario1 = computeAllKernSteps({
    totalAssets: 0, totalDebts: 0, monthlyIncome: 0, monthlyExpenses: 0,
    budgetCount: 0, snapshotCount: 0, hasTransactions: false,
    alertBudgetCount: 0, hasGoals: false, fireUnreachable: false,
  })

  // Scenario 2: Has transactions, no assets — should show add_assets first
  const scenario2 = computeAllKernSteps({
    totalAssets: 0, totalDebts: 0, monthlyIncome: 3000, monthlyExpenses: 2500,
    budgetCount: 3, snapshotCount: 1, hasTransactions: true,
    alertBudgetCount: 0, hasGoals: true, fireUnreachable: false,
  })

  // Scenario 3: Has transactions + assets, budget alerts — should show budget_attention first
  const scenario3 = computeAllKernSteps({
    totalAssets: 50000, totalDebts: 0, monthlyIncome: 4000, monthlyExpenses: 3200,
    budgetCount: 5, snapshotCount: 2, hasTransactions: true,
    alertBudgetCount: 3, hasGoals: true, fireUnreachable: false,
  })

  // Scenario 4: Has everything but no goals — should show set_goals first
  const scenario4 = computeAllKernSteps({
    totalAssets: 50000, totalDebts: 0, monthlyIncome: 4000, monthlyExpenses: 3200,
    budgetCount: 5, snapshotCount: 2, hasTransactions: true,
    alertBudgetCount: 0, hasGoals: false, fireUnreachable: false,
  })

  // Scenario 5: Has everything but FIRE unreachable — should show fire_unreachable first
  const scenario5 = computeAllKernSteps({
    totalAssets: 50000, totalDebts: 0, monthlyIncome: 4000, monthlyExpenses: 3200,
    budgetCount: 5, snapshotCount: 2, hasTransactions: true,
    alertBudgetCount: 0, hasGoals: true, fireUnreachable: true,
  })

  // Scenario 6: All priorities satisfied — should show lower-priority steps
  const scenario6 = computeAllKernSteps({
    totalAssets: 100000, totalDebts: 0, monthlyIncome: 5000, monthlyExpenses: 3000,
    budgetCount: 8, snapshotCount: 5, hasTransactions: true,
    alertBudgetCount: 0, hasGoals: true, fireUnreachable: false,
  })

  const scenarios = [
    { title: 'Scenario 1: New User (No Data)', steps: scenario1, expected: 'import_transactions', color: 'amber' as const, description: 'Should show "Importeer je eerste bankafschrift" (P1)' },
    { title: 'Scenario 2: No Assets', steps: scenario2, expected: 'add_assets', color: 'amber' as const, description: 'Should show "Voeg je vermogen toe" (P2)' },
    { title: 'Scenario 3: Budget Alerts', steps: scenario3, expected: 'budget_attention', color: 'amber' as const, description: 'Should show "3 budgetten hebben aandacht nodig" (P3)' },
    { title: 'Scenario 4: No Goals', steps: scenario4, expected: 'set_goals', color: 'amber' as const, description: 'Should show "Stel een financieel doel" (P4)' },
    { title: 'Scenario 5: FIRE Unreachable', steps: scenario5, expected: 'fire_unreachable', color: 'amber' as const, description: 'Should show "FIRE-doel niet haalbaar" (P5)' },
    { title: 'Scenario 6: All Done', steps: scenario6, expected: 'check_tax', color: 'amber' as const, description: 'Only lower-priority steps remain' },
  ]

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">Feature #255: Smart Next Step Algorithm Prioritization</h1>
      <p className="text-sm text-zinc-500 mb-8">
        Tests priority ordering: 1) No transactions, 2) No assets, 3) Budget alerts, 4) No goals, 5) FIRE unreachable
      </p>

      {/* Verification Results */}
      {loading ? (
        <div className="flex items-center gap-2 py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
          <span className="text-sm text-zinc-500">Running verification tests...</span>
        </div>
      ) : verifyData && (
        <section className="mb-8">
          <div className={`rounded-lg border p-4 mb-4 ${verifyData.all_pass ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
            <p className={`font-bold text-lg ${verifyData.all_pass ? 'text-green-700' : 'text-yellow-700'}`}>
              {verifyData.all_pass ? '✅ ALL TESTS PASSING' : `⚠️ ${verifyData.passing}/${verifyData.total} passing`}
            </p>
          </div>
          <div className="space-y-2">
            {verifyData.results.map((r, i) => (
              <div key={i} className={`rounded-lg border p-3 ${r.pass ? 'bg-white border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-2">
                  <span>{r.pass ? '✅' : '❌'}</span>
                  <span className="font-medium text-sm">{r.name}</span>
                </div>
                <p className="text-xs text-zinc-500 mt-1 ml-7">{r.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Priority Scenarios */}
      <h2 className="text-lg font-bold text-zinc-800 mb-4">Priority Scenarios (Live Demo)</h2>
      {scenarios.map((scenario, i) => {
        const firstStep = scenario.steps[0]
        const isCorrect = firstStep?.key === scenario.expected
        return (
          <section key={i} className="mb-6" data-testid={`scenario-${i + 1}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={isCorrect ? 'text-green-600' : 'text-red-600'}>{isCorrect ? '✅' : '❌'}</span>
              <h3 className="text-sm font-semibold text-zinc-700">{scenario.title}</h3>
            </div>
            <p className="text-xs text-zinc-400 mb-2">
              {scenario.description} — First step: <code className="bg-zinc-100 px-1 rounded">{firstStep?.key ?? 'none'}</code>
              {!isCorrect && <span className="text-red-500 ml-1">(expected: {scenario.expected})</span>}
            </p>
            <NextStepSection steps={scenario.steps} moduleColor={scenario.color} />
            <p className="text-xs text-zinc-400 mt-1">Total steps in queue: {scenario.steps.length}</p>
          </section>
        )
      })}

      {/* Max 1-2 Rule */}
      <section className="mt-8 mb-6">
        <h2 className="text-lg font-bold text-zinc-800 mb-2">Max 1-2 Suggestions Rule</h2>
        <p className="text-xs text-zinc-400 mb-3">
          NextStepSection always shows exactly 1 card (the highest-priority non-dismissed step).
          Below, Scenario 1 has {scenario1.length} steps in queue but only 1 is shown.
        </p>
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <NextStepSection steps={scenario1} moduleColor="amber" />
          <p className="text-xs text-zinc-400 mt-2">
            Queue contains: {scenario1.map(s => s.key).join(' → ')}
          </p>
        </div>
      </section>
    </div>
  )
}
