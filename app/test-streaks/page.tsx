'use client'

import { useState, useEffect } from 'react'

type StreakData = {
  streaks: Array<{
    id: string
    user_id: string
    streak_type: string
    current_count: number
    longest_count: number
    last_activity_date: string | null
    started_at: string
    updated_at: string
  }>
  login_streak: {
    current_count: number
    longest_count: number
    last_activity_date: string | null
  }
  source: string
  message?: string
}

type CheckinResult = {
  streak?: {
    id: string
    streak_type: string
    current_count: number
    longest_count: number
    last_activity_date: string
  }
  action?: string
  message?: string
  error?: string
  table_missing?: boolean
  previous_count?: number
}

export default function TestStreaksPage() {
  const [streakData, setStreakData] = useState<StreakData | null>(null)
  const [checkinResult, setCheckinResult] = useState<CheckinResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadStreaks() {
    setError(null)
    try {
      const res = await fetch('/api/streaks')
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to load streaks')
        return
      }
      setStreakData(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    }
  }

  async function doCheckin() {
    setLoading(true)
    setCheckinResult(null)
    try {
      const res = await fetch('/api/streaks/checkin', { method: 'POST' })
      const data = await res.json()
      setCheckinResult(data)
      // Reload streaks after checkin
      await loadStreaks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkin failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStreaks() }, [])

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold mb-6">Test: Streak Tracking (Feature #56)</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-700 font-medium">{error}</p>
        </div>
      )}

      {/* Step 1: Check-in */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Step 1 & 2: Login Check-in</h2>
        <button
          onClick={doCheckin}
          disabled={loading}
          className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 disabled:opacity-50"
        >
          {loading ? 'Checking in...' : 'POST /api/streaks/checkin'}
        </button>
        {checkinResult && (
          <div className="mt-3 bg-white border rounded-lg p-4">
            <p><strong>Action:</strong> {checkinResult.action || 'N/A'}</p>
            <p><strong>Message:</strong> {checkinResult.message || checkinResult.error || 'N/A'}</p>
            {checkinResult.table_missing && (
              <p className="text-yellow-600 mt-2">
                The user_streaks table does not exist yet. Migration needs to be applied.
              </p>
            )}
            {checkinResult.streak && (
              <div className="mt-2 space-y-1 text-sm">
                <p>Current Count: <strong>{checkinResult.streak.current_count}</strong></p>
                <p>Longest Count: <strong>{checkinResult.streak.longest_count}</strong></p>
                <p>Last Activity: <strong>{checkinResult.streak.last_activity_date}</strong></p>
              </div>
            )}
            {checkinResult.previous_count !== undefined && (
              <p className="text-sm mt-1">Previous count: {checkinResult.previous_count}</p>
            )}
            <pre className="mt-3 bg-zinc-50 border rounded-lg p-3 text-xs overflow-auto max-h-48">
              {JSON.stringify(checkinResult, null, 2)}
            </pre>
          </div>
        )}
      </section>

      {/* Step 3-6: Streak Verification */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Steps 3-6: Streak Verification</h2>
        {streakData ? (
          <div className="space-y-4">
            <div className="bg-white border rounded-lg p-4">
              <p><strong>Source:</strong> {streakData.source}</p>
              {streakData.message && <p className="text-sm text-zinc-500">{streakData.message}</p>}
              <p><strong>Total streak records:</strong> {streakData.streaks.length}</p>
            </div>

            <div className="bg-white border rounded-lg p-4">
              <h3 className="font-medium mb-2">Login Streak</h3>
              <div className="space-y-1 text-sm">
                <p className={streakData.login_streak.current_count > 0 ? 'text-green-600' : 'text-zinc-500'}>
                  {streakData.login_streak.current_count > 0 ? '✅' : '⚪'}
                  {' '}Step 3: current_count = {streakData.login_streak.current_count}
                </p>
                <p className={streakData.login_streak.last_activity_date ? 'text-green-600' : 'text-zinc-500'}>
                  {streakData.login_streak.last_activity_date ? '✅' : '⚪'}
                  {' '}Step 5: last_activity_date = {streakData.login_streak.last_activity_date || 'null'}
                  {streakData.login_streak.last_activity_date === today && ' (today ✓)'}
                </p>
                <p className={streakData.login_streak.longest_count > 0 ? 'text-green-600' : 'text-zinc-500'}>
                  {streakData.login_streak.longest_count > 0 ? '✅' : '⚪'}
                  {' '}Step 6: longest_count = {streakData.login_streak.longest_count}
                </p>
              </div>
            </div>

            {streakData.streaks.length > 0 && (
              <div className="bg-white border rounded-lg p-4">
                <h3 className="font-medium mb-2">All Streaks</h3>
                {streakData.streaks.map((s, i) => (
                  <div key={s.id || i} className="border-t pt-2 mt-2 first:border-t-0 first:pt-0 first:mt-0">
                    <p className="font-medium">{s.streak_type}</p>
                    <p className="text-sm">Current: {s.current_count} | Longest: {s.longest_count} | Last: {s.last_activity_date}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-zinc-500">Loading...</p>
        )}
      </section>

      <button onClick={loadStreaks} className="text-sm text-zinc-500 underline">
        Refresh data
      </button>
    </div>
  )
}
