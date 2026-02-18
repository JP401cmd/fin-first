'use client'

import { useState, useEffect, useCallback } from 'react'
import { StreakIndicator } from '@/components/app/streak-indicator'
import { StreakRecords } from '@/components/app/streak-records'

type TestResult = {
  name: string
  pass: boolean
  detail: string
}

type VerifyResponse = {
  feature: string
  passing: number
  total: number
  all_passing: boolean
  results: TestResult[]
}

export default function TestStreakTrackingPage() {
  const [verifyData, setVerifyData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [checkinType, setCheckinType] = useState<string>('login')
  const [checkinResult, setCheckinResult] = useState<string | null>(null)
  const [streakData, setStreakData] = useState<Record<string, unknown> | null>(null)

  const runVerification = useCallback(async () => {
    try {
      const res = await fetch('/api/verify-streak-tracking')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setVerifyData(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadStreaks = useCallback(async () => {
    try {
      const res = await fetch('/api/streaks')
      if (res.ok) {
        const data = await res.json()
        setStreakData(data)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    runVerification()
    loadStreaks()
  }, [runVerification, loadStreaks])

  const handleCheckin = async (type: string) => {
    setCheckinResult(null)
    try {
      const res = await fetch(`/api/streaks/checkin?type=${type}`, { method: 'POST' })
      const data = await res.json()
      setCheckinResult(JSON.stringify(data, null, 2))
      loadStreaks()
    } catch (e) {
      setCheckinResult('Error: ' + (e instanceof Error ? e.message : 'Unknown'))
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6" data-testid="test-streak-tracking">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">Feature #208: Streak Tracking System</h1>
        <p className="text-sm text-zinc-500 mb-6">Verification of all streak tracking requirements.</p>

        {/* Verification Results */}
        <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-800 mb-4">Verification Tests</h2>
          {loading ? (
            <p className="text-zinc-400 animate-pulse">Loading verification...</p>
          ) : error ? (
            <p className="text-red-600">{error}</p>
          ) : verifyData ? (
            <>
              <div className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${
                verifyData.all_passing ? 'bg-emerald-50 text-emerald-800' : 'bg-orange-50 text-orange-800'
              }`}>
                {verifyData.passing}/{verifyData.total} tests passing
              </div>
              <div className="space-y-2">
                {verifyData.results.map((r, i) => (
                  <div key={i} className={`rounded-lg border px-4 py-3 ${
                    r.pass ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span>{r.pass ? '✅' : '❌'}</span>
                      <span className="font-medium text-sm">{r.name}</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-600">{r.detail}</p>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </section>

        {/* Live StreakIndicator Component */}
        <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-800 mb-4">Live StreakIndicator Component</h2>
          <p className="text-sm text-zinc-500 mb-4">
            This shows the actual StreakIndicator component with fire emoji, count, and expandable details.
          </p>
          <div className="flex items-start gap-4">
            <StreakIndicator />
          </div>
        </section>

        {/* Check-in Testing */}
        <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-800 mb-4">Check-in Testing</h2>
          <div className="flex items-center gap-3 mb-4">
            <select
              value={checkinType}
              onChange={(e) => setCheckinType(e.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="login">Login</option>
              <option value="budget_compliance">Budget Compliance</option>
              <option value="action_completion">Action Completion</option>
            </select>
            <button
              onClick={() => handleCheckin(checkinType)}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 transition-colors"
            >
              Check-in ({checkinType})
            </button>
          </div>
          {checkinResult && (
            <pre className="rounded-lg bg-zinc-900 p-4 text-xs text-zinc-300 overflow-auto max-h-48">
              {checkinResult}
            </pre>
          )}
        </section>

        {/* Current Streak Data (raw) */}
        <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-800 mb-4">Current Streak Data (Raw API)</h2>
          {streakData ? (
            <pre className="rounded-lg bg-zinc-900 p-4 text-xs text-zinc-300 overflow-auto max-h-64">
              {JSON.stringify(streakData, null, 2)}
            </pre>
          ) : (
            <p className="text-zinc-400">No streak data available (not logged in or loading)</p>
          )}
        </section>

        {/* Identity Page Streak Records */}
        <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-800 mb-4">Streak Records (Identity Page Component)</h2>
          <p className="text-sm text-zinc-500 mb-4">
            This shows the StreakRecords component as it appears on the Identity page.
          </p>
          <StreakRecords />
        </section>
      </div>
    </div>
  )
}
