'use client'

import { useEffect, useState } from 'react'

interface TestResult {
  name: string
  passed: boolean
  detail: string
}

interface VerifyResponse {
  feature: string
  passing: number
  total: number
  allPassed: boolean
  results: TestResult[]
}

export default function TestAssetDeletionNetWorth() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-asset-deletion-networth')
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent mx-auto" />
          <p className="mt-3 text-sm text-zinc-500">Running asset deletion net worth tests...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8">
        <div className="max-w-2xl mx-auto rounded-xl bg-red-50 border border-red-200 p-6">
          <h1 className="text-lg font-bold text-red-800">Error</h1>
          <p className="mt-2 text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-900" data-testid="test-title">
            Feature #167: Asset Deletion Updates Net Worth
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Verifies that removing an asset immediately reflects in net worth calculation
          </p>
        </div>

        {/* Summary */}
        <div
          className={`rounded-xl border p-4 text-center ${
            data.allPassed
              ? 'border-green-200 bg-green-50'
              : 'border-red-200 bg-red-50'
          }`}
          data-testid="test-summary"
        >
          <span
            className={`text-3xl font-bold ${
              data.allPassed ? 'text-green-700' : 'text-red-700'
            }`}
          >
            {data.passing}/{data.total}
          </span>
          <p className={`text-sm ${data.allPassed ? 'text-green-600' : 'text-red-600'}`}>
            {data.allPassed ? 'All tests passing ✅' : 'Some tests failing ❌'}
          </p>
        </div>

        {/* Individual results */}
        <div className="space-y-2">
          {data.results.map((r, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 ${
                r.passed
                  ? 'border-green-200 bg-green-50'
                  : 'border-red-200 bg-red-50'
              }`}
              data-testid={`test-result-${i}`}
            >
              <div className="flex items-center gap-2">
                <span>{r.passed ? '✅' : '❌'}</span>
                <span className="font-medium text-sm text-zinc-900">{r.name}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500 pl-7">{r.detail}</p>
            </div>
          ))}
        </div>

        {/* Explanation */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-700 mb-3">How it works</h2>
          <ul className="space-y-2 text-xs text-zinc-600">
            <li>
              <strong>Dashboard (server component):</strong> Queries assets &amp; debts fresh on each render.
              Net worth = sum(assets.current_value) - sum(debts.current_balance).
            </li>
            <li>
              <strong>Core page (client component):</strong> Same formula, fetched on mount.
              Displays net worth in hero section and KPI cards.
            </li>
            <li>
              <strong>Asset deletion:</strong> DELETE from assets table via Supabase.
              Client state updates immediately. Next page visit recalculates from DB.
            </li>
            <li>
              <strong>This test:</strong> Creates a €50,000 test asset, verifies net worth increased,
              deletes it, verifies net worth decreased back to original value.
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
