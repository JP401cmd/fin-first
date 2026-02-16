'use client'

import { useState, useEffect } from 'react'
import { StreakIndicator } from '@/components/app/streak-indicator'

type VerificationResult = {
  feature: string
  all_pass: boolean
  results: Record<string, boolean>
  details: Record<string, string>
  summary: { total: number; passed: number; failed: number }
}

export default function TestStreakIndicatorPage() {
  const [verification, setVerification] = useState<VerificationResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadVerification() {
      try {
        const res = await fetch('/api/verify-streak-indicator')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setVerification(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    loadVerification()
  }, [])

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold mb-2">
        Test: Streak Indicator Shows Real Streak Count (Feature #119)
      </h1>
      <p className="text-zinc-500 mb-6">
        Verifies that the StreakIndicator component uses real user_streaks data from /api/streaks.
      </p>

      {/* Live StreakIndicator Preview */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Live StreakIndicator Component</h2>
        <div className="border rounded-lg p-6 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-bold text-zinc-900">Welkom terug, testuser</p>
              <p className="text-sm text-zinc-500">Simulated dashboard header</p>
            </div>
            <StreakIndicator />
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          The 🔥 indicator above is the real StreakIndicator component fetching live data from /api/streaks.
          Click it to perform a check-in via POST /api/streaks/checkin.
        </p>
      </section>

      {/* Verification Results */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Verification Results</h2>

        {loading && (
          <div className="rounded-lg border p-4 bg-zinc-50">
            <p className="text-zinc-500">Loading verification...</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        )}

        {verification && (
          <>
            {/* Summary banner */}
            <div className={`rounded-lg p-4 mb-4 ${
              verification.all_pass
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}>
              <p className={`font-bold text-lg ${
                verification.all_pass ? 'text-green-700' : 'text-red-700'
              }`}>
                {verification.all_pass
                  ? `✅ ALL ${verification.summary.total} CHECKS PASSED`
                  : `❌ ${verification.summary.failed}/${verification.summary.total} CHECKS FAILED`}
              </p>
            </div>

            {/* Individual results */}
            <div className="space-y-2">
              {Object.entries(verification.results).map(([key, pass]) => (
                <div
                  key={key}
                  className={`rounded-lg border p-3 ${
                    pass ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-medium ${pass ? 'text-green-700' : 'text-red-700'}`}>
                      {pass ? '✅' : '❌'} {key.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 mt-1">
                    {verification.details[key]}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Feature Steps */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Feature Steps</h2>
        <div className="bg-zinc-50 border rounded-lg p-4 text-sm space-y-2">
          <p><strong>1.</strong> Check streak data via GET /api/streaks</p>
          <p><strong>2.</strong> Navigate to page with streak indicator (dashboard)</p>
          <p><strong>3.</strong> Verify fire emoji and count match API data</p>
          <p><strong>4.</strong> Perform checkin to increment streak</p>
          <p><strong>5.</strong> Verify indicator updates</p>
        </div>
      </section>
    </div>
  )
}
