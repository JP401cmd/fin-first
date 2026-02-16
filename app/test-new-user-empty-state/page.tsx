'use client'

import { useEffect, useState } from 'react'

type TestResult = { test: string; passed: boolean; detail: string }
type ApiResponse = {
  feature: string
  summary: string
  allPassed: boolean
  results: TestResult[]
  error?: string
}

export default function TestNewUserEmptyStatePage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-new-user-empty-state')
      .then(r => r.json())
      .then(setData)
      .catch(e => setData({ feature: '#170', summary: 'Error', allPassed: false, results: [], error: String(e) }))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-amber-500 mx-auto" />
          <p className="mt-4 text-sm text-zinc-500">Running verification tests...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">
          Feature #170: New User Empty Financial State
        </h1>
        <p className="text-sm text-zinc-500 mb-6">
          Verifies that a fresh signup shows zero-state across all modules
        </p>

        {data?.error && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4">
            <p className="text-sm text-red-800 font-medium">Error: {data.error}</p>
          </div>
        )}

        <div className={`mb-6 rounded-lg p-4 border ${data?.allPassed ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <p className={`font-semibold ${data?.allPassed ? 'text-emerald-800' : 'text-amber-800'}`}>
            {data?.allPassed ? '✅ ALL TESTS PASSING' : '⚠️ SOME TESTS FAILING'}
          </p>
          <p className="text-sm mt-1 text-zinc-600">{data?.summary}</p>
        </div>

        <div className="space-y-3">
          {data?.results.map((result, i) => (
            <div
              key={i}
              className={`rounded-lg border p-4 ${result.passed ? 'border-emerald-200 bg-white' : 'border-red-200 bg-red-50'}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5">{result.passed ? '✅' : '❌'}</span>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${result.passed ? 'text-zinc-900' : 'text-red-900'}`}>
                    {result.test}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1 font-mono">{result.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="font-semibold text-zinc-900 mb-3">How New User Empty State Works</h2>
          <div className="space-y-3 text-sm text-zinc-600">
            <div>
              <h3 className="font-medium text-zinc-800">1. Sign Up</h3>
              <p>New user creates account via /signup with email + password. Supabase Auth handles user creation.</p>
            </div>
            <div>
              <h3 className="font-medium text-zinc-800">2. Dashboard (Zero State)</h3>
              <p>Dashboard shows all metrics as zero: €0 net worth, 0.0% freedom, 0 budgets, 0 actions, FIRE projection shows &quot;-&quot;. All calculations use safe defaults (?? []) to prevent errors.</p>
            </div>
            <div>
              <h3 className="font-medium text-zinc-800">3. Assets (Empty → Auto-Seed)</h3>
              <p>If no assets exist, page shows &quot;Geen assets geregistreerd&quot; empty state, then auto-seeds a default portfolio using seedAssets(). Race conditions prevented via seedingRef.</p>
            </div>
            <div>
              <h3 className="font-medium text-zinc-800">4. Debts (Empty → Auto-Seed)</h3>
              <p>If no debts exist, page shows &quot;Geen schulden geregistreerd&quot; empty state, then auto-seeds default debts using seedDebts(). Race conditions prevented via seedingRef.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
