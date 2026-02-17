'use client'

import { useEffect, useState } from 'react'
import {
  DailyExpenseProvider,
  useDailyExpenseRate,
  eurToFreedomTime,
} from '@/components/app/freedom-time-label'

function TestContent() {
  const { dailyExpenseRate, loading, source, dataMonths } = useDailyExpenseRate()
  const [verifyData, setVerifyData] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    fetch('/api/verify-budget-freedom-time')
      .then(r => r.json())
      .then(setVerifyData)
      .catch(() => setVerifyData({ error: 'Failed to fetch' }))
  }, [])

  // Test amounts simulating budget scenarios
  const budgetScenarios = [
    { label: 'Boodschappen (net over)', limit: 400, spent: 432 },
    { label: 'Transport (ruim onder)', limit: 150, spent: 60 },
    { label: 'Kleding (exact op)', limit: 100, spent: 100 },
    { label: 'Uit eten (flink over)', limit: 200, spent: 380 },
    { label: 'Sport (amper besteed)', limit: 80, spent: 15 },
  ]

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">
      <h1 className="text-2xl font-bold text-zinc-900">Feature #181: Freedom-time in Budget Displays</h1>
      <p className="text-sm text-zinc-500">
        Budget bars show remaining as days, alerts show freedom-time, modal shows freedom days.
      </p>

      {/* Context Status */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="font-semibold text-zinc-900 mb-4">Daily Expense Rate Context</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-zinc-500">Loading:</span>{' '}
            <span className={loading ? 'text-amber-600' : 'text-emerald-600'}>
              {loading ? 'Yes' : 'No'}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">Source:</span>{' '}
            <span className={source === 'transactions' ? 'text-emerald-600 font-semibold' : 'text-red-500'}>
              {source}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">Daily Rate:</span>{' '}
            <span className="font-mono font-semibold" data-testid="daily-rate">
              €{dailyExpenseRate.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">Data Months:</span>{' '}
            <span className="font-mono">{dataMonths}</span>
          </div>
        </div>
      </section>

      {/* formattedDagen Demo */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="font-semibold text-zinc-900 mb-4">formattedDagen Format Demo</h2>
        <p className="text-xs text-zinc-400 mb-4">
          Shows the Dutch-locale decimal format used in budget displays (e.g., &quot;2,4 dagen&quot;)
        </p>
        {dailyExpenseRate > 0 ? (
          <div className="space-y-3">
            {budgetScenarios.map((scenario, i) => {
              const remaining = scenario.limit - scenario.spent
              const overBudget = scenario.spent > scenario.limit
              const amount = overBudget ? Math.abs(remaining) : remaining
              const freedom = eurToFreedomTime(amount, dailyExpenseRate)

              return (
                <div key={i} className="flex items-center justify-between border-b border-zinc-50 pb-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-700">{scenario.label}</p>
                    <p className="text-xs text-zinc-400">
                      €{scenario.spent} / €{scenario.limit}
                    </p>
                  </div>
                  <div className="text-right">
                    {overBudget ? (
                      <p className="text-sm italic text-zinc-500" data-testid={`demo-over-${i}`}>
                        <span className="text-red-500">
                          €{Math.abs(remaining)} over — {freedom.formattedDagen} ingeleverd
                        </span>
                      </p>
                    ) : remaining > 0 ? (
                      <p className="text-sm italic text-zinc-500" data-testid={`demo-remaining-${i}`}>
                        nog {freedom.formattedDagen} deze maand
                      </p>
                    ) : (
                      <p className="text-sm italic text-zinc-500">exact op limiet</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">
            No daily expense rate available — demo requires transaction data.
          </p>
        )}
      </section>

      {/* Verification Tests */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="font-semibold text-zinc-900 mb-4">Verification Tests (12 total)</h2>
        {verifyData && 'results' in verifyData ? (
          <div className="space-y-2">
            {(verifyData.results as { test: string; passed: boolean; details: string }[]).map((r, i) => (
              <div key={i} className={`rounded-lg p-3 text-sm ${r.passed ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <div className="flex items-center gap-2">
                  <span>{r.passed ? '✅' : '❌'}</span>
                  <span className={`font-medium ${r.passed ? 'text-emerald-700' : 'text-red-700'}`}>
                    {r.test}
                  </span>
                </div>
                <p className={`mt-1 text-xs ${r.passed ? 'text-emerald-600' : 'text-red-600'}`}>
                  {r.details}
                </p>
              </div>
            ))}
            <div className={`mt-4 rounded-lg p-4 text-center font-semibold ${
              verifyData.allPassing ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
            }`} data-testid="verification-summary">
              {verifyData.summary as string}
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">Loading verification tests...</p>
        )}
      </section>
    </div>
  )
}

export default function TestBudgetFreedomTimePage() {
  return (
    <DailyExpenseProvider>
      <TestContent />
    </DailyExpenseProvider>
  )
}
