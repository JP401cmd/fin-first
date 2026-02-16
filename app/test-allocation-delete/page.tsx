'use client'

import { useEffect, useState } from 'react'

type TestResult = {
  test: string
  pass: boolean
  detail: string
}

export default function TestAllocationDeletePage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function runTests() {
      try {
        const res = await fetch('/api/verify-allocation-delete')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setResults(data.results || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    runTests()
  }, [])

  const passCount = results.filter((r) => r.pass).length

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">
        Feature #163: Deleted holding removed from portfolio allocation chart
      </h1>
      <p className="text-sm text-zinc-500 mb-6">
        Verifies that when a holding is deleted, the portfolio allocation chart updates correctly:
        the deleted holding disappears from the donut chart, percentages are recalculated, and
        totals are updated.
      </p>

      {loading && (
        <div className="flex items-center gap-2 py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <span className="text-sm text-zinc-500">Running verification tests...</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <span className={`text-3xl font-bold ${passCount === results.length ? 'text-emerald-600' : 'text-amber-600'}`}>
                {passCount}/{results.length}
              </span>
              <span className="text-sm text-zinc-500">tests passing</span>
              {passCount === results.length && (
                <span className="ml-auto rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  ALL PASS ✓
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {results.map((r, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 ${
                  r.pass
                    ? 'border-emerald-200 bg-emerald-50/50'
                    : 'border-red-200 bg-red-50/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${r.pass ? 'text-emerald-600' : 'text-red-600'}`}>
                    {r.pass ? '✅' : '❌'}
                  </span>
                  <span className="text-sm font-medium text-zinc-800">{r.test}</span>
                </div>
                <p className="mt-1 ml-6 text-xs text-zinc-500">{r.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <h2 className="text-sm font-semibold text-blue-800 mb-2">How it works</h2>
            <ul className="space-y-1 text-xs text-blue-700">
              <li>1. <code className="bg-blue-100 px-1 rounded">handleDelete()</code> calls DELETE /api/holdings to remove the holding from the database</li>
              <li>2. On success, it filters the holding from the <code className="bg-blue-100 px-1 rounded">holdings</code> state array</li>
              <li>3. It also recalculates <code className="bg-blue-100 px-1 rounded">totalValue</code> and <code className="bg-blue-100 px-1 rounded">totalCost</code> from the remaining holdings</li>
              <li>4. The <code className="bg-blue-100 px-1 rounded">allocationData</code> useMemo recomputes automatically since it depends on <code className="bg-blue-100 px-1 rounded">[holdings]</code></li>
              <li>5. The donut chart re-renders with updated slices, and the legend shows recalculated percentages</li>
              <li>6. If all holdings are deleted, the chart section is hidden entirely</li>
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
