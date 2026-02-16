'use client'

import { useState, useEffect } from 'react'

interface TestResult {
  name: string
  pass: boolean
  details: string
}

interface VerifyResponse {
  feature: string
  passing: number
  total: number
  allPassing: boolean
  results: TestResult[]
}

export default function TestFeatureVisitPersistencePage() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadResults() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/verify-feature-visit-persistence')
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

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">
          Feature #133: Visit Tracking Persistence
        </h1>
        <p className="text-sm text-zinc-500 mb-6">
          Verifies that discovered features remain marked as visited across sessions (logout/login).
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-zinc-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-amber-500" />
            Verificatie laden...
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Error: {error}
          </div>
        )}

        {data && (
          <>
            {/* Summary */}
            <div className={`mb-6 rounded-xl border p-4 ${
              data.allPassing
                ? 'border-green-200 bg-green-50'
                : 'border-amber-200 bg-amber-50'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-zinc-900">
                    {data.allPassing ? '✅ All Tests Passing' : `⚠️ ${data.passing}/${data.total} Tests Passing`}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">{data.feature}</p>
                </div>
                <div className="text-3xl font-bold text-zinc-900">
                  {data.passing}/{data.total}
                </div>
              </div>
            </div>

            {/* Test Results */}
            <div className="space-y-3">
              {data.results.map((result, i) => (
                <div
                  key={i}
                  className={`rounded-xl border p-4 ${
                    result.pass
                      ? 'border-green-100 bg-white'
                      : 'border-red-200 bg-red-50'
                  }`}
                  data-testid={`test-${i}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-lg">
                      {result.pass ? '✅' : '❌'}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium text-zinc-900 text-sm">
                        {result.name}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                        {result.details}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Refresh */}
            <button
              onClick={loadResults}
              className="mt-6 rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
              data-testid="refresh-btn"
            >
              Opnieuw testen
            </button>
          </>
        )}
      </div>
    </div>
  )
}
