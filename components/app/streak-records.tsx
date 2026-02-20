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
 * StreakRecords — Shows longest streak records on the Identity page.
 *
 * Displays all 3 streak types with current count, longest count, and at-risk warnings.
 * Provides a compact table/card view of streak history.
 */
export function StreakRecords() {
  const [data, setData] = useState<StreakResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadStreaks = useCallback(async () => {
    try {
      const res = await fetch('/api/streaks')
      if (!res.ok) {
        if (res.status === 401) {
          setData(null)
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }
      const json: StreakResponse = await res.json()
      setData(json)
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

  if (loading) {
    return (
      <div className="animate-pulse space-y-3" data-testid="streak-records-loading">
        <div className="h-4 w-32 bg-zinc-100 rounded" />
        <div className="h-16 bg-[var(--subtle)] rounded-lg" />
        <div className="h-16 bg-[var(--subtle)] rounded-lg" />
        <div className="h-16 bg-[var(--subtle)] rounded-lg" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="text-sm text-[var(--ink-3)]" data-testid="streak-records-error">
        Kon streak-gegevens niet laden.
      </div>
    )
  }

  const streaks = [
    {
      key: 'login',
      label: 'Login',
      icon: '🔥',
      color: 'orange',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      textColor: 'text-orange-700',
      accentColor: 'text-orange-600',
      data: data.login_streak,
    },
    {
      key: 'budget',
      label: 'Budget Compliance',
      icon: '📊',
      color: 'emerald',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-200',
      textColor: 'text-emerald-700',
      accentColor: 'text-emerald-600',
      data: data.budget_streak,
    },
    {
      key: 'action',
      label: 'Actie Voltooiing',
      icon: '✅',
      color: 'teal',
      bgColor: 'bg-teal-50',
      borderColor: 'border-teal-200',
      textColor: 'text-teal-700',
      accentColor: 'text-teal-600',
      data: data.action_streak,
    },
  ]

  // Find overall longest streak across all types
  const overallLongest = Math.max(
    data.login_streak.longest_count,
    data.budget_streak.longest_count,
    data.action_streak.longest_count
  )

  return (
    <div data-testid="streak-records">
      {/* Overall longest streak highlight */}
      {overallLongest > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3" data-testid="streak-overall-longest">
          <span className="text-2xl">🏆</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">
              Langste streak: <span data-testid="streak-overall-longest-count">{overallLongest}</span> {overallLongest === 1 ? 'week' : 'weken'}
            </p>
            <p className="text-xs text-amber-600">
              Je beste prestatie tot nu toe
            </p>
          </div>
        </div>
      )}

      {/* Streak cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {streaks.map(s => (
          <div
            key={s.key}
            className={`rounded-[var(--r-lg)] border ${s.borderColor} ${s.bgColor} p-4`}
            data-testid={`streak-record-${s.key}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{s.icon}</span>
              <span className={`text-sm font-semibold ${s.textColor}`}>{s.label}</span>
            </div>

            <div className="flex items-baseline gap-1 mb-1">
              <span className={`text-2xl font-bold ${s.accentColor}`} data-testid={`streak-record-${s.key}-current`}>
                {s.data.current_count}
              </span>
              <span className="text-xs text-[var(--ink-3)]">
                {s.data.current_count === 1 ? 'week' : 'weken'} huidig
              </span>
            </div>

            <div className="flex items-center gap-1 text-xs text-[var(--ink-3)]">
              <span>Langste:</span>
              <span className="font-semibold text-[var(--ink-2)]" data-testid={`streak-record-${s.key}-longest`}>
                {s.data.longest_count}
              </span>
              <span>{s.data.longest_count === 1 ? 'week' : 'weken'}</span>
            </div>

            {s.data.at_risk && (
              <div className="mt-2 text-xs text-orange-600 font-medium" data-testid={`streak-record-${s.key}-warning`}>
                ⚠️ In gevaar!
              </div>
            )}

            {s.data.last_activity_date && (
              <div className="mt-1 text-xs text-[var(--ink-3)]">
                Laatst: {new Date(s.data.last_activity_date + 'T00:00:00Z').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Warnings section */}
      {data.warnings.length > 0 && (
        <div className="mt-3 space-y-1" data-testid="streak-records-warnings">
          {data.warnings.map((w, i) => (
            <div
              key={i}
              className="rounded-md bg-orange-100 border border-orange-300 px-3 py-2 text-xs text-orange-800"
              data-testid={`streak-records-warning-${i}`}
            >
              {w}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
