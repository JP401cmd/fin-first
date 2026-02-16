'use client'

import { useEffect, useState } from 'react'

interface TestResult {
  test: string
  passed: boolean
  details: string
  data?: unknown
}

interface VerifyResponse {
  summary: string
  allPassing: boolean
  results: TestResult[]
  error?: string
  timestamp: string
}

export default function TestDashboardKPIs() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-dashboard-kpis')
      .then(r => r.json())
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-blue-600 mx-auto" />
          <p className="mt-4 text-zinc-600">Verifying dashboard KPI data sources...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8">
        <div className="max-w-3xl mx-auto bg-red-50 border border-red-200 rounded-lg p-6">
          <h1 className="text-xl font-bold text-red-800">Error</h1>
          <p className="mt-2 text-red-700">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">
          Feature #113: Dashboard KPI Cards Show Real-Time Supabase Data
        </h1>
        <p className="text-zinc-500 mb-6">
          Verifying that all dashboard metrics are fetched from Supabase, not hardcoded.
        </p>

        {/* Summary banner */}
        <div className={`rounded-lg p-4 mb-6 border ${
          data.allPassing
            ? 'bg-green-50 border-green-200'
            : 'bg-yellow-50 border-yellow-200'
        }`}>
          <p className={`text-lg font-semibold ${
            data.allPassing ? 'text-green-800' : 'text-yellow-800'
          }`}>
            {data.summary}
          </p>
          <p className="text-sm text-zinc-500 mt-1">
            Timestamp: {data.timestamp}
          </p>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {data.results.map((result, idx) => (
            <div
              key={idx}
              className={`rounded-lg border p-4 ${
                result.passed
                  ? 'bg-white border-green-200'
                  : 'bg-white border-red-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 text-lg ${
                  result.passed ? 'text-green-600' : 'text-red-600'
                }`}>
                  {result.passed ? '✅' : '❌'}
                </span>
                <div className="flex-1">
                  <h3 className="font-semibold text-zinc-900">
                    Test {idx + 1}: {result.test}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-600">{result.details}</p>
                  {result.data && (
                    <details className="mt-2">
                      <summary className="text-xs text-zinc-400 cursor-pointer hover:text-zinc-600">
                        Show raw data
                      </summary>
                      <pre className="mt-1 text-xs bg-zinc-50 rounded p-2 overflow-x-auto text-zinc-700">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Code evidence */}
        <div className="mt-8 bg-white rounded-lg border border-zinc-200 p-6">
          <h2 className="font-bold text-zinc-900 mb-3">Code Evidence</h2>
          <p className="text-sm text-zinc-600 mb-4">
            The dashboard page at <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-xs">app/(app)/dashboard/page.tsx</code> is an{' '}
            <strong>async server component</strong> that performs these Supabase queries on every page load:
          </p>
          <div className="bg-zinc-900 text-green-400 rounded-lg p-4 text-xs font-mono overflow-x-auto">
            <div className="text-zinc-500">{'// Lines 25-40 of dashboard/page.tsx'}</div>
            <div>{'const ['}</div>
            <div>{'  txResult, assetsResult, debtsResult, profileResult,'}</div>
            <div>{'  essentialBudgetsResult, actionsResult, eventsResult,'}</div>
            <div>{'  allBudgetsResult, recsResult, childBudgetsResult,'}</div>
            <div>{'] = await Promise.all(['}</div>
            <div className="text-amber-400">{'  supabase.from(\'transactions\').select(\'amount\')...'}</div>
            <div className="text-amber-400">{'  supabase.from(\'assets\').select(\'current_value, monthly_contribution\')...'}</div>
            <div className="text-amber-400">{'  supabase.from(\'debts\').select(\'current_balance, debt_type\')...'}</div>
            <div className="text-amber-400">{'  supabase.from(\'profiles\').select(\'date_of_birth, last_known_phase\')...'}</div>
            <div className="text-amber-400">{'  supabase.from(\'budgets\').select(...)...  // 3 budget queries'}</div>
            <div className="text-amber-400">{'  supabase.from(\'actions\').select(...)...'}</div>
            <div className="text-amber-400">{'  supabase.from(\'life_events\').select(\'id\')...'}</div>
            <div className="text-amber-400">{'  supabase.from(\'recommendations\').select(\'id, title\')...'}</div>
            <div>{'])'}</div>
          </div>
          <p className="text-xs text-zinc-400 mt-3">
            Every KPI metric is derived from these query results. No hardcoded financial values exist in the dashboard code.
          </p>
        </div>
      </div>
    </div>
  )
}
