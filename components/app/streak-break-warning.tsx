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
  login_streak: StreakSummary
  budget_streak: StreakSummary
  action_streak: StreakSummary
  warnings: string[]
  source: string
}

/**
 * StreakBreakWarning — Prominent notification banner for at-risk streaks.
 *
 * Displays a dismissible warning card on the Dashboard when any streak is
 * at risk of breaking. Shows the specific warning message:
 * "Je streak van X weken staat op het spel!"
 *
 * Shows warnings for all 3 streak types: login, budget compliance, action completion.
 * Clears automatically when the user performs the streak activity (e.g., checkin).
 *
 * Used on the Dashboard page as a notification banner.
 */
export function StreakBreakWarning() {
  const [warnings, setWarnings] = useState<string[]>([])
  const [atRiskStreaks, setAtRiskStreaks] = useState<Array<{ type: string; label: string; icon: string; summary: StreakSummary }>>([])
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadStreaks = useCallback(async () => {
    try {
      const res = await fetch('/api/streaks')
      if (!res.ok) {
        if (res.status === 401) return
        throw new Error(`HTTP ${res.status}`)
      }
      const data: StreakResponse = await res.json()
      setWarnings(data.warnings ?? [])

      // Collect at-risk streaks with their labels
      const riskStreaks: Array<{ type: string; label: string; icon: string; summary: StreakSummary }> = []
      const streakTypes: Array<{ type: string; label: string; icon: string; summary: StreakSummary }> = [
        { type: 'login', label: 'Login', icon: '🔥', summary: data.login_streak },
        { type: 'budget', label: 'Budget', icon: '📊', summary: data.budget_streak },
        { type: 'action', label: 'Acties', icon: '✅', summary: data.action_streak },
      ]
      for (const s of streakTypes) {
        if (s.summary.at_risk) {
          riskStreaks.push(s)
        }
      }
      setAtRiskStreaks(riskStreaks)
    } catch {
      // Silently fail — streak warnings are nice-to-have
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStreaks()
    // Poll every 60 seconds to detect when streak activity clears the warning
    const interval = setInterval(loadStreaks, 60000)
    return () => clearInterval(interval)
  }, [loadStreaks])

  // Don't show if loading, no warnings, or dismissed
  if (loading || warnings.length === 0 || dismissed) {
    return null
  }

  return (
    <div
      className="rounded-xl border border-orange-300 bg-gradient-to-r from-orange-50 to-amber-50 p-4 shadow-sm"
      data-testid="streak-break-warning-notification"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 text-2xl animate-pulse" data-testid="streak-warning-icon">
          ⚠️
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-orange-800 mb-1" data-testid="streak-warning-title">
            Streak in gevaar!
          </h3>
          <div className="space-y-1.5">
            {warnings.map((w, i) => (
              <p
                key={i}
                className="text-sm text-orange-700"
                data-testid={`streak-warning-message-${i}`}
              >
                {w}
              </p>
            ))}
          </div>

          {/* Show at-risk streak details */}
          {atRiskStreaks.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2" data-testid="streak-warning-details">
              {atRiskStreaks.map(s => (
                <div
                  key={s.type}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/70 border border-orange-200 px-2.5 py-1 text-xs"
                  data-testid={`streak-at-risk-${s.type}`}
                >
                  <span>{s.icon}</span>
                  <span className="font-medium text-orange-800">{s.label}</span>
                  <span className="text-orange-600">
                    {s.summary.current_count} {s.summary.current_count === 1 ? 'week' : 'weken'}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="mt-2 text-xs text-orange-500">
            Wees deze week actief om je streak te behouden.
          </p>
        </div>

        {/* Dismiss button */}
        <button
          onClick={() => setDismissed(true)}
          className="flex-shrink-0 rounded-lg p-1 text-orange-400 hover:text-orange-600 hover:bg-orange-100 transition-colors"
          title="Sluiten"
          data-testid="streak-warning-dismiss"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
