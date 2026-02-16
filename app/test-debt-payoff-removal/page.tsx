'use client'

import { useEffect, useState } from 'react'

interface TestResult {
  test: string
  pass: boolean
  detail: string
}

interface VerifyResponse {
  feature: string
  summary: string
  allPassing: boolean
  results: TestResult[]
  error?: string
}

export default function TestDebtPayoffRemoval() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-debt-payoff-removal')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch((err) => {
        setData({ feature: 'Error', summary: err.message, allPassing: false, results: [] })
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold">Debt Payoff Removal Test</h1>
        <div className="mt-6 flex items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="text-zinc-600">Running verification tests...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold text-zinc-900" data-testid="test-title">
        Feature #168: Debt Payoff Removal
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        When debt balance reaches zero it should be marked as paid off and excluded from active calculations.
      </p>

      {data?.error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Error: {data.error}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4" data-testid="test-summary">
        <div className="flex items-center gap-3">
          <span className={`text-2xl ${data?.allPassing ? 'text-emerald-500' : 'text-red-500'}`}>
            {data?.allPassing ? '\u2705' : '\u274C'}
          </span>
          <div>
            <p className="text-lg font-bold text-zinc-900">{data?.summary}</p>
            <p className="text-sm text-zinc-500">{data?.feature}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3" data-testid="test-results">
        {data?.results.map((result, i) => (
          <div
            key={i}
            className={`rounded-lg border p-4 ${
              result.pass
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-red-200 bg-red-50'
            }`}
            data-testid={`test-${i}`}
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5">{result.pass ? '\u2705' : '\u274C'}</span>
              <div>
                <p className={`text-sm font-medium ${result.pass ? 'text-emerald-800' : 'text-red-800'}`}>
                  {result.test}
                </p>
                <p className={`mt-1 text-xs ${result.pass ? 'text-emerald-600' : 'text-red-600'}`}>
                  {result.detail}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50 p-6">
        <h2 className="text-sm font-bold text-zinc-700">How Debt Payoff Works</h2>
        <ul className="mt-3 space-y-2 text-sm text-zinc-600">
          <li><strong>1. Revalue to 0:</strong> When updating a debt balance to 0 via the Valuation Modal, the debt is automatically marked as <code>is_active = false</code>.</li>
          <li><strong>2. Edit to 0:</strong> When editing a debt and setting current_balance to 0 via the Debt Form, the debt is also marked as <code>is_active = false</code>.</li>
          <li><strong>3. Active calculations:</strong> The debts page filters active debts using <code>is_active && current_balance &gt; 0</code>, so paid-off debts are excluded from totals, payoff simulations, and KPIs.</li>
          <li><strong>4. Badge system:</strong> The Schuldenvrij (debt-free) badge evaluation now only counts debts where <code>is_active !== false && current_balance &gt; 0</code>.</li>
          <li><strong>5. API routes:</strong> All snapshot, AI context, and calculation routes already filter by <code>is_active = true</code>.</li>
        </ul>
      </div>
    </div>
  )
}
