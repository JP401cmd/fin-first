'use client'

import { useState, useEffect } from 'react'

interface TestResult {
  test: string
  passed: boolean
  details: string
}

interface VerifyResponse {
  summary: string
  passing: number
  total: number
  results: TestResult[]
}

export default function TestYearInReviewPage() {
  const [results, setResults] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function runTests() {
      try {
        const res = await fetch('/api/verify-year-in-review')
        if (!res.ok) throw new Error(`Status ${res.status}`)
        const data = await res.json()
        setResults(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Test failed')
      } finally {
        setLoading(false)
      }
    }
    runTests()
  }, [])

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900">
          Test: Year-in-Review Jaaroverzicht (#237)
        </h1>
        <p className="mb-6 text-sm text-zinc-500">
          Verification tests for the Year-in-Review annual summary feature
        </p>

        {loading && (
          <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-teal-500" />
            <span className="text-sm text-zinc-600">Running tests...</span>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Error: {error}
          </div>
        )}

        {results && (
          <div className="space-y-4">
            {/* Summary */}
            <div className={`rounded-xl border p-4 ${
              results.passing === results.total
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-amber-200 bg-amber-50'
            }`}>
              <p className="text-lg font-bold" data-testid="test-summary">
                {results.summary}
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-200">
                <div
                  className={`h-full rounded-full transition-all ${
                    results.passing === results.total ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${(results.passing / results.total) * 100}%` }}
                />
              </div>
            </div>

            {/* Individual tests */}
            <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100">
              {results.results.map((test, i) => (
                <div key={i} className="flex items-start gap-3 p-3">
                  <span className="mt-0.5 text-lg" data-testid={`test-${i}-status`}>
                    {test.passed ? '✅' : '❌'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800">{test.test}</p>
                    <p className="text-xs text-zinc-500 truncate">{test.details}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Links */}
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold text-zinc-700">Quick Links</h3>
              <div className="flex flex-wrap gap-2">
                <a
                  href="/identity/jaaroverzicht"
                  className="rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100"
                >
                  Open Jaaroverzicht →
                </a>
                <a
                  href="/api/year-in-review?year=2025"
                  className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                >
                  API Response →
                </a>
                <a
                  href="/api/verify-year-in-review"
                  className="rounded-lg bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100"
                >
                  Verification API →
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
