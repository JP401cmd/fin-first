'use client'

import { useState } from 'react'
import { NextStepCard, NextStepSection, computeAllKernSteps, computeAllWilSteps, computeAllHorizonSteps, type NextStepSuggestion } from '@/components/app/next-step-card'

/**
 * Test page for Feature #198: Smart Volgende Stap next step engine.
 * Demonstrates all scenarios: empty user, partial data, budget alerts, all modules.
 */
export default function TestSmartNextStep() {
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set())

  // Scenario 1: Brand new user (no data)
  const newUserKernSteps = computeAllKernSteps({
    totalAssets: 0,
    totalDebts: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    budgetCount: 0,
    snapshotCount: 0,
    hasTransactions: false,
    alertBudgetCount: 0,
  })

  // Scenario 2: User has transactions but nothing else
  const partialKernSteps = computeAllKernSteps({
    totalAssets: 0,
    totalDebts: 5000,
    monthlyIncome: 3000,
    monthlyExpenses: 2500,
    budgetCount: 0,
    snapshotCount: 0,
    hasTransactions: true,
    alertBudgetCount: 0,
  })

  // Scenario 3: User with budget alerts
  const alertKernSteps = computeAllKernSteps({
    totalAssets: 50000,
    totalDebts: 0,
    monthlyIncome: 4000,
    monthlyExpenses: 3200,
    budgetCount: 5,
    snapshotCount: 2,
    hasTransactions: true,
    alertBudgetCount: 3,
  })

  // Scenario 4: Wil steps - no goals
  const wilStepsNoGoals = computeAllWilSteps({
    pendingRecommendations: 2,
    openActions: 3,
    goalCount: 0,
    hasCompletedActions: false,
  })

  // Scenario 5: Horizon steps
  const horizonSteps = computeAllHorizonSteps({
    hasFireProjection: false,
    eventCount: 0,
    freedomPct: 25,
  })

  // All done scenario
  const allDoneKernSteps = computeAllKernSteps({
    totalAssets: 100000,
    totalDebts: 0,
    monthlyIncome: 5000,
    monthlyExpenses: 3000,
    budgetCount: 8,
    snapshotCount: 5,
    hasTransactions: true,
    alertBudgetCount: 0,
  })

  const handleDismiss = (step: NextStepSuggestion) => {
    const key = step.key || step.title
    setDismissedKeys(prev => new Set([...prev, key]))
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">Feature #198: Smart Volgende Stap Engine</h1>
      <p className="text-sm text-zinc-500 mb-8">Test page demonstrating all NextStep scenarios</p>

      {/* Scenario 1: New User */}
      <section className="mb-8" data-testid="scenario-new-user">
        <h2 className="text-lg font-semibold text-amber-700 mb-3">Scenario 1: Brand New User (De Kern)</h2>
        <p className="text-xs text-zinc-400 mb-2">No data — should show &apos;Importeer je eerste bankafschrift&apos;</p>
        <NextStepSection steps={newUserKernSteps} moduleColor="amber" />
        <p className="text-xs text-zinc-400 mt-2">Total steps available: {newUserKernSteps.length}</p>
      </section>

      {/* Scenario 2: Partial Data */}
      <section className="mb-8" data-testid="scenario-partial-data">
        <h2 className="text-lg font-semibold text-amber-700 mb-3">Scenario 2: Has Transactions, No Budgets</h2>
        <p className="text-xs text-zinc-400 mb-2">Should show &apos;Stel je budgetten in&apos;</p>
        <NextStepSection steps={partialKernSteps} moduleColor="amber" />
      </section>

      {/* Scenario 3: Budget Alerts */}
      <section className="mb-8" data-testid="scenario-budget-alerts">
        <h2 className="text-lg font-semibold text-amber-700 mb-3">Scenario 3: Budget Alerts (3 over limit)</h2>
        <p className="text-xs text-zinc-400 mb-2">Should show &apos;3 budgetten hebben aandacht nodig&apos;</p>
        <NextStepSection steps={alertKernSteps} moduleColor="amber" />
      </section>

      {/* Scenario 4: De Wil */}
      <section className="mb-8" data-testid="scenario-wil">
        <h2 className="text-lg font-semibold text-teal-700 mb-3">Scenario 4: De Wil (No Goals)</h2>
        <p className="text-xs text-zinc-400 mb-2">Should show recommendations first, then goals</p>
        <NextStepSection steps={wilStepsNoGoals} moduleColor="teal" />
      </section>

      {/* Scenario 5: De Horizon */}
      <section className="mb-8" data-testid="scenario-horizon">
        <h2 className="text-lg font-semibold text-purple-700 mb-3">Scenario 5: De Horizon (No FIRE)</h2>
        <p className="text-xs text-zinc-400 mb-2">Should show &apos;Bereken je FIRE-datum&apos;</p>
        <NextStepSection steps={horizonSteps} moduleColor="purple" />
      </section>

      {/* Scenario 6: All Done */}
      <section className="mb-8" data-testid="scenario-all-done">
        <h2 className="text-lg font-semibold text-green-700 mb-3">Scenario 6: Minimal Steps Left</h2>
        <p className="text-xs text-zinc-400 mb-2">User has most data — only tax step remains</p>
        <NextStepSection steps={allDoneKernSteps} moduleColor="amber" />
      </section>

      {/* Individual Card Demo with Dismiss */}
      <section className="mb-8" data-testid="scenario-dismiss">
        <h2 className="text-lg font-semibold text-zinc-700 mb-3">Dismiss Demo (Click X to dismiss)</h2>
        <div className="space-y-3">
          {newUserKernSteps
            .filter(s => !dismissedKeys.has(s.key || s.title))
            .slice(0, 3)
            .map(step => (
              <NextStepCard key={step.key} step={step} onDismiss={handleDismiss} />
            ))}
          {newUserKernSteps.filter(s => !dismissedKeys.has(s.key || s.title)).length === 0 && (
            <p className="text-sm text-zinc-500">All steps dismissed!</p>
          )}
          {dismissedKeys.size > 0 && (
            <p className="text-xs text-zinc-400 mt-2">Dismissed: {Array.from(dismissedKeys).join(', ')}</p>
          )}
        </div>
      </section>

      {/* API Test */}
      <section className="mb-8" data-testid="api-test">
        <h2 className="text-lg font-semibold text-zinc-700 mb-3">API Verification</h2>
        <p className="text-xs text-zinc-400">
          Visit <a href="/api/verify-smart-next-step" className="text-blue-600 underline">/api/verify-smart-next-step</a> for 14 automated checks.
        </p>
      </section>
    </div>
  )
}
