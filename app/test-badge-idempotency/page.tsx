'use client'

import { useState } from 'react'

type TestResult = {
  test: string
  pass: boolean
  details: string
}

type VerificationResponse = {
  feature: string
  summary?: {
    total: number
    passing: number
    failing: number
    all_pass: boolean
  }
  authenticated?: boolean
  structural_tests?: number
  live_tests?: number
  results: TestResult[]
  error?: string
}

export default function TestBadgeIdempotencyPage() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<VerificationResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runTests = async () => {
    setLoading(true)
    setError(null)
    setData(null)

    try {
      const res = await fetch('/api/verify-badge-idempotency')
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-2" data-testid="page-title">
          Feature #155: Badge Evaluation Idempotency
        </h1>
        <p className="text-zinc-400 mb-6">
          Verifies that calling badge evaluation twice does not double-award badges
          and returns the same result.
        </p>

        <button
          onClick={runTests}
          disabled={loading}
          className="px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 rounded-lg font-medium mb-8 transition-colors"
          data-testid="run-tests-btn"
        >
          {loading ? 'Evaluating...' : 'Run Idempotency Tests'}
        </button>

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {data && (
          <>
            {/* Summary */}
            {data.summary && (
              <div
                className={`rounded-lg p-6 mb-6 border ${
                  data.summary.all_pass
                    ? 'bg-emerald-900/20 border-emerald-700'
                    : 'bg-red-900/20 border-red-700'
                }`}
                data-testid="test-summary"
                data-all-pass={data.summary.all_pass}
              >
                <h2 className="text-lg font-semibold mb-2">
                  {data.summary.all_pass ? '✅ All Tests Passing' : '❌ Some Tests Failing'}
                </h2>
                <p className="text-zinc-300">
                  {data.summary.passing}/{data.summary.total} tests passing
                </p>
                <div className="flex gap-4 mt-2 text-sm text-zinc-400">
                  <span>Structural: {data.structural_tests ?? 0}</span>
                  <span>Live: {data.live_tests ?? 0}</span>
                  <span>Authenticated: {data.authenticated ? 'Yes' : 'No'}</span>
                </div>
              </div>
            )}

            {/* Test Results */}
            <div className="space-y-3" data-testid="test-results">
              {data.results.map((result, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg p-4 border ${
                    result.pass
                      ? 'bg-emerald-900/10 border-emerald-800'
                      : 'bg-red-900/10 border-red-800'
                  }`}
                  data-testid={`test-result-${idx + 1}`}
                  data-pass={result.pass}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{result.pass ? '✅' : '❌'}</span>
                    <span className="font-medium">{result.test}</span>
                  </div>
                  <p className="text-sm text-zinc-400 ml-8">{result.details}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Architecture explanation */}
        <div className="mt-8 bg-zinc-800/50 rounded-lg p-6 border border-zinc-700">
          <h2 className="text-lg font-semibold mb-3">How Idempotency Works</h2>
          <div className="text-sm text-zinc-400 space-y-2">
            <p><strong className="text-zinc-300">1. Existing badge check:</strong> Before evaluation, all currently earned badges are fetched and put in a Set.</p>
            <p><strong className="text-zinc-300">2. Skip already earned:</strong> evaluateBadges() only returns badges NOT in the existing set.</p>
            <p><strong className="text-zinc-300">3. Upsert on save:</strong> saveEarnedBadges() uses upsert with onConflict constraint, preventing duplicates.</p>
            <p><strong className="text-zinc-300">4. DB constraint:</strong> user_badges table has UNIQUE(user_id, badge_id) constraint as safety net.</p>
            <p><strong className="text-zinc-300">Result:</strong> Second call finds all badges already earned, returns empty newly_earned, no changes to database.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
