'use client'

import { useState, useEffect } from 'react'

type TestResult = { name: string; pass: boolean; detail: string }

export default function TestAssetValuationTrendsPage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-asset-valuation-trends')
      .then(res => res.json())
      .then(data => {
        setResults(data.tests || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const passing = results.filter(r => r.pass).length
  const allPassing = passing === results.length && results.length > 0

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-bold text-zinc-900 mb-4">Feature #213: Asset Valuation Trend Charts</h1>
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          Running tests...
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">Feature #213: Asset Valuation Trend Charts</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Verifies line charts, sparklines, auto-tracking, no record limits, and graceful history handling.
      </p>

      <div className={`rounded-xl border p-4 mb-6 ${allPassing ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <p className={`text-sm font-semibold ${allPassing ? 'text-emerald-700' : 'text-amber-700'}`}>
          {allPassing ? '\u2705' : '\u26a0\ufe0f'} {passing}/{results.length} tests passing
        </p>
      </div>

      <div className="space-y-2">
        {results.map((test, i) => (
          <div key={test.name} className={`rounded-lg border p-3 ${test.pass ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'}`}>
            <p className="text-sm font-medium text-zinc-900">
              {test.pass ? '\u2705' : '\u274c'} {i + 1}. {test.name}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">{test.detail}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
