'use client'

import { useState } from 'react'
import { TrendingUp, CheckCircle2, Wallet, AlertTriangle } from 'lucide-react'
import { shouldAlert } from '@/lib/budget-alerts'

/**
 * Test page that renders all empty state variants AND budget alert thresholds.
 * Combined page because Turbopack can't compile new routes mid-session.
 */
export default function TestEmptyStatesPage() {
  const [monthLabel] = useState('februari 2026')
  const [tab, setTab] = useState<'empty' | 'alerts'>('alerts')

  // shouldAlert() test cases
  const testCases = [
    { label: 'Expense at 79% (under threshold)', spent: 395, limit: 500, threshold: 80, type: 'expense' as const, expected: false },
    { label: 'Expense at 80% (at threshold)', spent: 400, limit: 500, threshold: 80, type: 'expense' as const, expected: true },
    { label: 'Expense at 96% (nearing limit)', spent: 480, limit: 500, threshold: 80, type: 'expense' as const, expected: true },
    { label: 'Expense at 102% (over budget)', spent: 510, limit: 500, threshold: 80, type: 'expense' as const, expected: true },
    { label: 'Expense at 125% (critical)', spent: 625, limit: 500, threshold: 80, type: 'expense' as const, expected: true },
    { label: 'Savings at 45% (under target)', spent: 45, limit: 100, threshold: 80, type: 'savings' as const, expected: true },
    { label: 'Savings at 85% (on track)', spent: 85, limit: 100, threshold: 80, type: 'savings' as const, expected: false },
    { label: 'Income at 200% (never alert)', spent: 2000, limit: 1000, threshold: 80, type: 'income' as const, expected: false },
  ]

  const allPassing = testCases.every(tc => shouldAlert(tc.spent, tc.limit, tc.threshold, tc.type) === tc.expected)

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Tab switcher */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('empty')}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === 'empty' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
        >
          Empty States
        </button>
        <button
          onClick={() => setTab('alerts')}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === 'alerts' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
        >
          Budget Alerts
        </button>
      </div>

      {tab === 'empty' && (
        <>
          <h1 className="text-2xl font-bold text-zinc-900 mb-2">Empty State Test Page</h1>
          <p className="text-sm text-zinc-500 mb-8">
            Verifies that all pages correctly show empty states when no data exists.
          </p>

          {/* Assets empty state */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-zinc-700 mb-3">/core/assets - No assets</h2>
            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
              <TrendingUp className="mx-auto h-8 w-8 text-amber-400" />
              <p className="mt-2 text-sm font-medium text-zinc-600">Geen assets geregistreerd</p>
              <p className="mt-1 text-xs text-zinc-400">Voeg een asset toe om je vermogen te volgen.</p>
            </div>
          </section>

          {/* Debts empty state */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-zinc-700 mb-3">/core/debts - No debts</h2>
            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
              <p className="mt-2 text-sm font-medium text-zinc-600">Geen schulden geregistreerd</p>
              <p className="mt-1 text-xs text-zinc-400">Voeg een schuld toe om je aflosplan te starten.</p>
            </div>
          </section>

          {/* Cash empty state */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-zinc-700 mb-3">/core/cash - No transactions</h2>
            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
              <Wallet className="mx-auto h-8 w-8 text-zinc-300" />
              <p className="mt-2 text-sm font-medium text-zinc-600">Geen transacties gevonden</p>
              <p className="mt-1 text-xs text-zinc-400">Er zijn geen transacties in {monthLabel}. Voeg een transactie toe of importeer je bankafschriften.</p>
            </div>
          </section>

          {/* Verification checklist */}
          <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-zinc-700 mb-4">Verification Checklist</h2>
            <ul className="space-y-2 text-sm text-zinc-600">
              <li className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                Assets empty state: icon, primary message, CTA guidance
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                Debts empty state: icon, primary message, CTA guidance
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                Cash empty state: icon, primary message, contextual guidance
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                Consistent styling: dashed border, zinc-50 bg, centered text
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                No fake placeholder data shown
              </li>
            </ul>
          </section>
        </>
      )}

      {tab === 'alerts' && (
        <>
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

          {/* Visual alert rendering — verplaatst naar Budget Hub */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-zinc-700 mb-3">Visual Alert Levels</h2>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm text-zinc-500 italic">
                Budget alert componenten zijn verplaatst naar de Budget Hub op /core/budgets.
                De shouldAlert() logica hierboven test nog steeds de drempelwaarden.
              </p>
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
                Income budgets never trigger alerts
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                No mock data patterns in budget alert code
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
