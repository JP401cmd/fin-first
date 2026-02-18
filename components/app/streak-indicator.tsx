'use client'

import { useState, useEffect, useCallback } from 'react'

type StreakSummary = {
  current_count: number
  longest_count: number
  last_activity_date: string | null
  at_risk: boolean
  risk_message: string | null
}

type StreakResponse = {
  streaks: unknown[]
  login_streak: StreakSummary
  budget_streak: StreakSummary
  action_streak: StreakSummary
  warnings: string[]
  source: string
}

type CheckinResponse = {
  streak: {
    current_count: number
    longest_count: number
    last_activity_date: string
  }
  streak_type: string
  action: string
  message: string
  source: string
}

/**
 * StreakIndicator - Displays the user's weekly streaks with fire emoji.
 *
 * Shows all 3 streak types: login, budget compliance, action completion.
 * Fetches real data from GET /api/streaks.
 * Shows fire emoji (🔥) with current streak count.
 * Shows streak break warning when a streak is at risk.
 *
 * Used on the dashboard to encourage consistent engagement.
 */
export function StreakIndicator() {
  const [loginStreak, setLoginStreak] = useState<StreakSummary | null>(null)
  const [budgetStreak, setBudgetStreak] = useState<StreakSummary | null>(null)
  const [actionStreak, setActionStreak] = useState<StreakSummary | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [checkinLoading, setCheckinLoading] = useState(false)
  const [checkinMessage, setCheckinMessage] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStreaks = useCallback(async () => {
    try {
      const res = await fetch('/api/streaks')
      if (!res.ok) {
        if (res.status === 401) {
          // Not logged in — hide indicator silently
          setLoginStreak(null)
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }
      const data: StreakResponse = await res.json()
      setLoginStreak(data.login_streak)
      setBudgetStreak(data.budget_streak)
      setActionStreak(data.action_streak)
      setWarnings(data.warnings ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kon streaks niet laden')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStreaks()
  }, [loadStreaks])

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
      // Update login streak from checkin response
      setLoginStreak(prev => ({
        current_count: data.streak.current_count,
        longest_count: data.streak.longest_count,
        last_activity_date: data.streak.last_activity_date,
        at_risk: false,
        risk_message: null,
        ...(prev ? {} : {}),
      }))
      setCheckinMessage(data.message)
      // Reload all streaks to get updated warnings
      setTimeout(() => {
        loadStreaks()
        setCheckinMessage(null)
      }, 3000)
    } catch (err) {
      setCheckinMessage(err instanceof Error ? err.message : 'Check-in mislukt')
      setTimeout(() => setCheckinMessage(null), 3000)
    } finally {
      setCheckinLoading(false)
    }
  }, [loadStreaks])

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

  const loginCount = loginStreak?.current_count ?? 0
  const loginLongest = loginStreak?.longest_count ?? 0
  const budgetCount = budgetStreak?.current_count ?? 0
  const budgetLongest = budgetStreak?.longest_count ?? 0
  const actionCount = actionStreak?.current_count ?? 0
  const actionLongest = actionStreak?.longest_count ?? 0
  const hasWarnings = warnings.length > 0

  return (
    <div className="relative inline-flex flex-col items-start" data-testid="streak-indicator">
      {/* Main streak button (login streak) */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleCheckin}
          disabled={checkinLoading}
          className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
            hasWarnings
              ? 'bg-orange-100 border-orange-400 hover:bg-orange-200 hover:border-orange-500 animate-pulse'
              : 'bg-orange-50 border-orange-200 hover:bg-orange-100 hover:border-orange-300'
          }`}
          title={`Weekstreak: ${loginCount} ${loginCount === 1 ? 'week' : 'weken'}${loginLongest > loginCount ? ` (langste: ${loginLongest})` : ''}. Klik om in te checken.`}
          data-testid="streak-checkin-button"
        >
          <span className={loginCount > 0 ? 'text-lg' : 'text-lg opacity-50'} data-testid="streak-fire-emoji">
            🔥
          </span>
          <span className="font-semibold text-orange-700" data-testid="streak-count">
            {loginCount}
          </span>
          <span className="text-xs text-orange-500 hidden sm:inline">
            {loginCount === 1 ? 'week' : 'weken'}
          </span>
        </button>

        {/* Expand button for streak details */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50 transition-colors"
          data-testid="streak-details-toggle"
          title="Toon alle streaks"
        >
          {showDetails ? '▲' : '▼'}
        </button>
      </div>

      {/* Streak break warning banner */}
      {hasWarnings && !showDetails && (
        <div
          className="mt-1 rounded-md bg-orange-100 border border-orange-300 px-3 py-1.5 text-xs text-orange-800 max-w-xs"
          data-testid="streak-break-warning"
        >
          {warnings[0]}
        </div>
      )}

      {/* Checkin feedback message */}
      {checkinMessage && (
        <div
          className="mt-1 whitespace-nowrap rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white shadow-lg z-50"
          data-testid="streak-checkin-message"
        >
          {checkinMessage}
        </div>
      )}

      {/* Expanded streak details */}
      {showDetails && (
        <div
          className="mt-2 w-72 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg z-50"
          data-testid="streak-details-panel"
        >
          <h3 className="text-xs font-semibold tracking-[0.1em] text-zinc-400 uppercase mb-3">
            Alle Streaks
          </h3>

          {/* Login streak */}
          <div className="mb-3" data-testid="streak-login-detail">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🔥</span>
                <span className="text-sm font-medium text-zinc-800">Login</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-orange-600" data-testid="streak-login-count">{loginCount}</span>
                <span className="text-xs text-zinc-400">{loginCount === 1 ? 'week' : 'weken'}</span>
              </div>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-zinc-400">
              <span>Langste: <span className="font-medium text-zinc-600" data-testid="streak-login-longest">{loginLongest}</span></span>
              {loginStreak?.at_risk && (
                <span className="text-orange-600 font-medium" data-testid="streak-login-warning">⚠️ In gevaar</span>
              )}
            </div>
          </div>

          {/* Budget compliance streak */}
          <div className="mb-3" data-testid="streak-budget-detail">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">📊</span>
                <span className="text-sm font-medium text-zinc-800">Budget</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-emerald-600" data-testid="streak-budget-count">{budgetCount}</span>
                <span className="text-xs text-zinc-400">{budgetCount === 1 ? 'week' : 'weken'}</span>
              </div>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-zinc-400">
              <span>Langste: <span className="font-medium text-zinc-600" data-testid="streak-budget-longest">{budgetLongest}</span></span>
              {budgetStreak?.at_risk && (
                <span className="text-orange-600 font-medium" data-testid="streak-budget-warning">⚠️ In gevaar</span>
              )}
            </div>
          </div>

          {/* Action completion streak */}
          <div className="mb-2" data-testid="streak-action-detail">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">✅</span>
                <span className="text-sm font-medium text-zinc-800">Acties</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-teal-600" data-testid="streak-action-count">{actionCount}</span>
                <span className="text-xs text-zinc-400">{actionCount === 1 ? 'week' : 'weken'}</span>
              </div>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-zinc-400">
              <span>Langste: <span className="font-medium text-zinc-600" data-testid="streak-action-longest">{actionLongest}</span></span>
              {actionStreak?.at_risk && (
                <span className="text-orange-600 font-medium" data-testid="streak-action-warning">⚠️ In gevaar</span>
              )}
            </div>
          </div>

          {/* Warnings section */}
          {hasWarnings && (
            <div className="mt-3 border-t border-zinc-100 pt-3" data-testid="streak-warnings-section">
              {warnings.map((w, i) => (
                <div
                  key={i}
                  className="mb-1 rounded-md bg-orange-50 border border-orange-200 px-2 py-1.5 text-xs text-orange-700"
                  data-testid={`streak-warning-${i}`}
                >
                  {w}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
