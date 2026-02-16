'use client'

import { useState, useEffect } from 'react'

type StepResult = {
  step: string
  date: string
  week: { year: number; week: number }
  action: string
  current_count: number
  longest_count: number
  pass: boolean
  expected: string
}

type TestResult = {
  all_pass: boolean
  steps: StepResult[]
  summary: {
    total: number
    passed: number
    failed: number
  }
}

type VerificationResult = {
  all_pass: boolean
  verification: Record<string, boolean>
  final_streak: {
    current_count: number
    longest_count: number
    last_activity_date: string | null
  }
}

/**
 * Get ISO week info for display.
 */
function getISOWeekInfo(dateStr: string): { year: number; week: number } {
  const d = new Date(Date.UTC(
    parseInt(dateStr.slice(0, 4)),
    parseInt(dateStr.slice(5, 7)) - 1,
    parseInt(dateStr.slice(8, 10))
  ))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return { year: d.getUTCFullYear(), week: weekNum }
}

export default function TestStreaksPage() {
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [verification, setVerification] = useState<VerificationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authCheck, setAuthCheck] = useState<{ getStatus: number; postStatus: number } | null>(null)

  const today = new Date().toISOString().split('T')[0]
  const todayWeek = getISOWeekInfo(today)

  async function loadVerification() {
    setError(null)
    try {
      const res = await fetch('/api/test-streaks')
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to load verification')
        return
      }
      setVerification(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    }
  }

  async function runFullTest() {
    setLoading(true)
    setError(null)
    setTestResult(null)
    try {
      const res = await fetch('/api/test-streaks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Test failed')
        return
      }
      setTestResult(data)
      // Also refresh verification
      await loadVerification()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test failed')
    } finally {
      setLoading(false)
    }
  }

  async function verifyAuthProtection() {
    setLoading(true)
    try {
      const getRes = await fetch('/api/streaks')
      const postRes = await fetch('/api/streaks/checkin', { method: 'POST' })
      setAuthCheck({
        getStatus: getRes.status,
        postStatus: postRes.status,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Auth check failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadVerification()
  }, [])

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold mb-2">Test: Weekly Streak Tracking (Feature #89)</h1>
      <p className="text-zinc-500 mb-6">
        Today: {today} (ISO Week {todayWeek.week}, {todayWeek.year})
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-700 font-medium">{error}</p>
        </div>
      )}

      {/* Quick Verification */}
      {verification && (
        <div className={`rounded-lg p-4 mb-6 ${
          verification.all_pass
            ? 'bg-green-50 border border-green-200'
            : 'bg-red-50 border border-red-200'
        }`}>
          <p className={`font-bold text-lg mb-2 ${verification.all_pass ? 'text-green-700' : 'text-red-700'}`}>
            {verification.all_pass ? '✅ ALL STREAK LOGIC VERIFIED' : '❌ SOME CHECKS FAILED'}
          </p>
          <div className="space-y-1 text-sm">
            {Object.entries(verification.verification).map(([key, pass]) => (
              <p key={key} className={pass ? 'text-green-600' : 'text-red-600'}>
                {pass ? '✅' : '❌'} {key}
              </p>
            ))}
          </div>
          <div className="mt-3 text-xs text-zinc-500">
            Final streak: count={verification.final_streak.current_count},
            longest={verification.final_streak.longest_count},
            last={verification.final_streak.last_activity_date}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <section className="mb-8 space-y-3">
        <h2 className="text-lg font-semibold mb-3">Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={runFullTest}
            disabled={loading}
            className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 disabled:opacity-50"
            data-testid="run-full-test"
          >
            {loading ? 'Running...' : '🧪 Run Full Test Suite'}
          </button>

          <button
            onClick={verifyAuthProtection}
            disabled={loading}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            🔒 Verify Auth Protection
          </button>

          <button
            onClick={loadVerification}
            disabled={loading}
            className="bg-zinc-200 text-zinc-700 px-4 py-2 rounded-lg hover:bg-zinc-300 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </section>

      {/* Auth Protection Check */}
      {authCheck && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Auth Protection</h2>
          <div className="bg-white border rounded-lg p-4 space-y-2 text-sm">
            <p className={authCheck.getStatus === 401 ? 'text-green-600' : 'text-red-600'}>
              {authCheck.getStatus === 401 ? '✅' : '❌'}
              {' '}GET /api/streaks → {authCheck.getStatus} (expect 401)
            </p>
            <p className={authCheck.postStatus === 401 ? 'text-green-600' : 'text-red-600'}>
              {authCheck.postStatus === 401 ? '✅' : '❌'}
              {' '}POST /api/streaks/checkin → {authCheck.postStatus} (expect 401)
            </p>
          </div>
        </section>
      )}

      {/* Full Test Results */}
      {testResult && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">
            Test Suite Results ({testResult.summary.passed}/{testResult.summary.total} passed)
          </h2>

          {/* Summary Banner */}
          <div className={`rounded-lg p-4 mb-4 ${
            testResult.all_pass
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}>
            <p className={`font-bold ${testResult.all_pass ? 'text-green-700' : 'text-red-700'}`}>
              {testResult.all_pass ? '✅ ALL TESTS PASSED' : `❌ ${testResult.summary.failed} TEST(S) FAILED`}
            </p>
          </div>

          {/* Individual Steps */}
          <div className="space-y-3">
            {testResult.steps.map((step, i) => (
              <div
                key={i}
                className={`border rounded-lg p-4 ${
                  step.pass
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">
                    {step.pass ? '✅' : '❌'} {step.step}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {typeof step.week === 'object' ? `W${step.week.week}/${step.week.year}` : ''}
                  </span>
                </div>
                <p className="text-sm text-zinc-600">{step.date}</p>
                <div className="mt-2 text-xs grid grid-cols-2 gap-2">
                  <span>Action: <strong>{step.action}</strong></span>
                  <span>Expected: {step.expected}</span>
                  <span>Count: <strong>{step.current_count}</strong></span>
                  <span>Longest: <strong>{step.longest_count}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Implementation Details */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Implementation Details</h2>
        <div className="bg-zinc-50 border rounded-lg p-4 text-sm space-y-2">
          <p><strong>Streak type:</strong> Weekly (per spec &ldquo;Weekstreak&rdquo;)</p>
          <p><strong>Logic:</strong> ISO 8601 week comparison for consecutive week detection</p>
          <p><strong>Endpoints:</strong></p>
          <ul className="list-disc ml-6 space-y-1">
            <li>GET /api/streaks — Get user streaks (auth required)</li>
            <li>POST /api/streaks/checkin — Record check-in (auth required)</li>
            <li>POST /api/streaks/checkin?date=YYYY-MM-DD — Simulate date</li>
          </ul>
          <p><strong>Auth:</strong> Both endpoints return 401 for unauthenticated requests</p>
          <p><strong>Storage:</strong> user_streaks table → app_settings fallback</p>
          <p><strong>Tests cover:</strong></p>
          <ul className="list-disc ml-6 space-y-1">
            <li>First check-in creates streak at count=1</li>
            <li>Same-week check-in is idempotent (no change)</li>
            <li>Consecutive week increments count</li>
            <li>longest_count updates when current exceeds it</li>
            <li>Gap of 2+ weeks resets count to 1 (longest preserved)</li>
            <li>Year boundary handling (Dec → Jan)</li>
          </ul>
        </div>
      </section>
    </div>
  )
}
