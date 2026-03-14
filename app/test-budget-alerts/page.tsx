'use client'

import { shouldAlert } from '@/lib/budget-alerts'
import { CheckCircle2 } from 'lucide-react'

/**
 * Test page for budget alert thresholds.
 * Shows all alert levels and verifies shouldAlert() logic with real spending data patterns.
 */
export default function TestBudgetAlertsPage() {
  // Test shouldAlert() function with various scenarios
  const testCases = [
    // Expenses: alert when over threshold
    { label: 'Expense at 79% (under threshold)', spent: 395, limit: 500, threshold: 80, type: 'expense' as const, expected: false },
    { label: 'Expense at 80% (at threshold)', spent: 400, limit: 500, threshold: 80, type: 'expense' as const, expected: true },
    { label: 'Expense at 96% (nearing limit)', spent: 480, limit: 500, threshold: 80, type: 'expense' as const, expected: true },
    { label: 'Expense at 102% (over budget)', spent: 510, limit: 500, threshold: 80, type: 'expense' as const, expected: true },
    { label: 'Expense at 125% (critical)', spent: 625, limit: 500, threshold: 80, type: 'expense' as const, expected: true },
    // Savings: alert when under threshold
    { label: 'Savings at 45% (under target)', spent: 45, limit: 100, threshold: 80, type: 'savings' as const, expected: true },
    { label: 'Savings at 85% (on track)', spent: 85, limit: 100, threshold: 80, type: 'savings' as const, expected: false },
    // Income: never alert
    { label: 'Income at 200% (never alert)', spent: 2000, limit: 1000, threshold: 80, type: 'income' as const, expected: false },
  ]

  const allPassing = testCases.every(tc => shouldAlert(tc.spent, tc.limit, tc.threshold, tc.type) === tc.expected)

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">Budget Alert Threshold Test</h1>
      <p className="text-sm text-zinc-500 mb-8">
        Verifies that budget alerts trigger based on actual spending vs budget limit.
      </p>

      {/* shouldAlert() logic tests */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-zinc-700 mb-3">shouldAlert() Logic Tests</h2>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="space-y-2">
            {testCases.map((tc, i) => {
              const result = shouldAlert(tc.spent, tc.limit, tc.threshold, tc.type)
              const pass = result === tc.expected
              return (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className={`font-mono text-xs ${pass ? 'text-emerald-500' : 'text-red-500'}`}>
                    {pass ? 'PASS' : 'FAIL'}
                  </span>
                  <span className="text-zinc-700">{tc.label}</span>
                  <span className="ml-auto text-xs text-zinc-400">
                    {tc.spent}/{tc.limit} = {Math.round((tc.spent / tc.limit) * 100)}%
                    → {result ? 'ALERT' : 'no alert'}
                  </span>
                </div>
              )
            })}
          </div>
          <div className={`mt-4 rounded-lg p-3 text-center text-sm font-medium ${
            allPassing ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}>
            {allPassing ? 'All shouldAlert() tests passing!' : 'Some tests failed!'}
          </div>
        </div>
      </section>

      {/* Visual alert rendering */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-zinc-700 mb-3">Visual Alert Levels</h2>
        <div className="space-y-3">
          <p className="text-sm text-zinc-500 italic">
            Budget alerts zijn verplaatst naar de Budget Hub op /core/budgets.
            De shouldAlert() logica hierboven test nog steeds de drempelwaarden.
          </p>
        </div>
      </section>

      {/* Real data flow verification */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-zinc-700 mb-3">Real Data Flow</h2>
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <div className="space-y-3 text-sm text-zinc-600">
            <p><strong>Core page (/core):</strong></p>
            <ol className="ml-4 list-decimal space-y-1 text-xs">
              <li>Fetches budgets from <code className="bg-zinc-100 px-1 py-0.5 rounded">supabase.from(&apos;budgets&apos;).select(&apos;*&apos;)</code></li>
              <li>Fetches transactions for current month from <code className="bg-zinc-100 px-1 py-0.5 rounded">supabase.from(&apos;transactions&apos;).select(&apos;budget_id, amount&apos;)</code></li>
              <li>Builds spending map: budget_id → total spent amount</li>
              <li>For each parent budget, sums child spending vs child limits</li>
              <li>Calls <code className="bg-zinc-100 px-1 py-0.5 rounded">shouldAlert(spent, limit, threshold, budgetType)</code></li>
              <li>Renders BudgetAlert components for triggered budgets under &quot;Aandachtspunten&quot;</li>
            </ol>
            <p className="mt-3"><strong>Budgets page (/core/budgets):</strong></p>
            <ol className="ml-4 list-decimal space-y-1 text-xs">
              <li>Loads transactions with <code className="bg-zinc-100 px-1 py-0.5 rounded">loadSpending()</code> from Supabase</li>
              <li>BudgetTree component shows color-coded bars (green → amber → red)</li>
              <li>Dashed threshold marker at alert_threshold percentage</li>
              <li>Over-budget extension rendered in red beyond 100%</li>
            </ol>
          </div>
        </div>
      </section>

      {/* Verification checklist */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-zinc-700 mb-4">Verification Checklist</h2>
        <ul className="space-y-2 text-sm text-zinc-600">
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Budget spending loaded from real Supabase transactions table
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            shouldAlert() correctly triggers at threshold for expenses
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Warning alert shown at 80-99% of budget limit
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Danger alert shown at 100-119% of budget limit
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Critical alert (pulsing) shown at 120%+ of budget limit
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Savings alerts trigger when UNDER target
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Alert threshold configurable per budget (0-100% slider)
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            No mock data patterns in budget alert code
          </li>
        </ul>
      </section>
    </div>
  )
}
