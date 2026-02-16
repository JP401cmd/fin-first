'use client'

import { useState, useEffect } from 'react'

interface TestResult {
  test: string
  passed: boolean
  detail: string
}

interface VerifyResponse {
  feature: string
  passing: number
  total: number
  allPassing: boolean
  results: TestResult[]
}

export default function TestDiscoverCarouselPage() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadResults() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/verify-discover-carousel')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: VerifyResponse = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadResults()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8">
        <div className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-red-50 p-6">
          <h1 className="text-lg font-bold text-red-700">Fout</h1>
          <p className="text-sm text-red-600 mt-2">{error}</p>
          <button onClick={loadResults} className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm text-white">
            Opnieuw
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-zinc-900 mb-1" data-testid="page-title">
          Feature #123: Discover Carousel Verification
        </h1>
        <p className="text-sm text-zinc-500 mb-6">
          {data.feature}
        </p>

        {/* Summary */}
        <div
          className={`rounded-xl border p-6 mb-6 ${
            data.allPassing
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-amber-200 bg-amber-50'
          }`}
          data-testid="summary"
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl" data-testid="summary-icon">
              {data.allPassing ? '✅' : '⚠️'}
            </span>
            <div>
              <p className="text-lg font-bold text-zinc-900" data-testid="summary-score">
                {data.passing}/{data.total} tests passing
              </p>
              <p className="text-sm text-zinc-500">
                {data.allPassing ? 'All verification checks pass!' : 'Some checks need attention.'}
              </p>
            </div>
          </div>
        </div>

        {/* Individual Results */}
        <div className="space-y-3" data-testid="results-list">
          {data.results.map((result, i) => (
            <div
              key={i}
              className={`rounded-xl border p-4 ${
                result.passed
                  ? 'border-emerald-100 bg-white'
                  : 'border-red-200 bg-red-50'
              }`}
              data-testid={`test-result-${i}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5" data-testid={`test-icon-${i}`}>
                  {result.passed ? '✅' : '❌'}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-zinc-800">
                    {result.test}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {result.detail}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Refresh */}
        <div className="mt-6 text-center">
          <button
            onClick={loadResults}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Vernieuwen
          </button>
        </div>
      </div>
    </div>
  )
}
