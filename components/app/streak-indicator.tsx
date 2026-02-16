'use client'

import { useState, useEffect, useCallback } from 'react'

type StreakData = {
  current_count: number
  longest_count: number
  last_activity_date: string | null
}

type StreakResponse = {
  streaks: unknown[]
  login_streak: StreakData
  source: string
}

type CheckinResponse = {
  streak: {
    current_count: number
    longest_count: number
    last_activity_date: string
  }
  action: string
  message: string
  source: string
}

/**
 * StreakIndicator - Displays the user's weekly login streak with fire emoji.
 *
 * Fetches real data from GET /api/streaks and allows check-in via POST /api/streaks/checkin.
 * Shows fire emoji (🔥) with current streak count.
 *
 * Used on the dashboard to encourage consistent engagement.
 */
export function StreakIndicator() {
  const [streak, setStreak] = useState<StreakData | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkinLoading, setCheckinLoading] = useState(false)
  const [checkinMessage, setCheckinMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadStreak = useCallback(async () => {
    try {
      const res = await fetch('/api/streaks')
      if (!res.ok) {
        if (res.status === 401) {
          // Not logged in — hide indicator silently
          setStreak(null)
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }
      const data: StreakResponse = await res.json()
      setStreak(data.login_streak)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kon streak niet laden')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStreak()
  }, [loadStreak])

  const handleCheckin = useCallback(async () => {
    setCheckinLoading(true)
    setCheckinMessage(null)
    try {
      const res = await fetch('/api/streaks/checkin', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      const data: CheckinResponse = await res.json()
      // Update streak from checkin response
      setStreak({
        current_count: data.streak.current_count,
        longest_count: data.streak.longest_count,
        last_activity_date: data.streak.last_activity_date,
      })
      setCheckinMessage(data.message)
      // Clear message after 3 seconds
      setTimeout(() => setCheckinMessage(null), 3000)
    } catch (err) {
      setCheckinMessage(err instanceof Error ? err.message : 'Check-in mislukt')
      setTimeout(() => setCheckinMessage(null), 3000)
    } finally {
      setCheckinLoading(false)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-orange-50 px-3 py-1.5 text-sm" data-testid="streak-indicator-loading">
        <span className="animate-pulse">🔥</span>
        <span className="text-zinc-400">...</span>
      </div>
    )
  }

  if (error) {
    return null // Silently fail — streak is a nice-to-have
  }

  const count = streak?.current_count ?? 0
  const longest = streak?.longest_count ?? 0

  return (
    <div className="relative inline-flex items-center gap-2" data-testid="streak-indicator">
      <button
        onClick={handleCheckin}
        disabled={checkinLoading}
        className="flex items-center gap-2 rounded-lg bg-orange-50 border border-orange-200 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-orange-100 hover:border-orange-300 disabled:opacity-50"
        title={`Weekstreak: ${count} ${count === 1 ? 'week' : 'weken'}${longest > count ? ` (langste: ${longest})` : ''}. Klik om in te checken.`}
        data-testid="streak-checkin-button"
      >
        <span className={count > 0 ? 'text-lg' : 'text-lg opacity-50'} data-testid="streak-fire-emoji">
          🔥
        </span>
        <span className="font-semibold text-orange-700" data-testid="streak-count">
          {count}
        </span>
        <span className="text-xs text-orange-500 hidden sm:inline">
          {count === 1 ? 'week' : 'weken'}
        </span>
      </button>

      {/* Checkin feedback message */}
      {checkinMessage && (
        <div
          className="absolute top-full left-0 mt-1 whitespace-nowrap rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white shadow-lg z-50"
          data-testid="streak-checkin-message"
        >
          {checkinMessage}
        </div>
      )}
    </div>
  )
}
