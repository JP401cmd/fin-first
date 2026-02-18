'use client'

import { useState, useEffect } from 'react'

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

export default function TestStreakBreakWarningPage() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-streak-break-warning')
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">
        Feature #257: Streak Break Warning Notification
      </h1>
      <p className="text-sm text-zinc-500 mb-6">
        Verifies that streak break warnings are properly detected, displayed on Dashboard,
        shown for all 3 streak types, and cleared after activity.
      </p>

      {loading && (
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-48 bg-zinc-100 rounded" />
          <div className="h-16 bg-zinc-50 rounded-lg" />
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          Error: {error}
        </div>
      )}

      {data && (
        <>
          {/* Summary */}
          <div className={`mb-6 rounded-xl border ${data.all_passing ? 'border-emerald-300 bg-emerald-50' : 'border-orange-300 bg-orange-50'} p-4`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{data.all_passing ? '✅' : '⚠️'}</span>
              <div>
                <p className="font-semibold text-zinc-900">
                  {data.passing}/{data.total} tests passing
                </p>
                <p className="text-xs text-zinc-500">{data.feature}</p>
              </div>
            </div>
          </div>

          {/* Test results */}
          <div className="space-y-2">
            {data.results.map((r, i) => (
              <div
                key={i}
                className={`rounded-lg border px-4 py-3 ${
                  r.pass
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-red-200 bg-red-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{r.pass ? '✅' : '❌'}</span>
                  <span className="text-sm font-medium text-zinc-800">{r.name}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500 ml-6">{r.detail}</p>
              </div>
            ))}
          </div>

          {/* Feature steps mapping */}
          <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-zinc-800 mb-3">Feature Steps Coverage</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">●</span>
                <div>
                  <p className="font-medium">Step 1: Detect when streak is at risk</p>
                  <p className="text-xs text-zinc-400">Tests 1-3: checkStreakAtRisk, ISO week comparison, at_risk field</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">●</span>
                <div>
                  <p className="font-medium">Step 2: Show warning message format</p>
                  <p className="text-xs text-zinc-400">Tests 4, 18: &quot;Je streak van X weken staat op het spel!&quot; with type labels</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">●</span>
                <div>
                  <p className="font-medium">Step 3: Display warning on Dashboard</p>
                  <p className="text-xs text-zinc-400">Tests 7-12: StreakBreakWarning component on Dashboard page</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">●</span>
                <div>
                  <p className="font-medium">Step 4: Show for all streak types</p>
                  <p className="text-xs text-zinc-400">Tests 5-6, 13: All 3 types (login, budget, action) checked and displayed</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">●</span>
                <div>
                  <p className="font-medium">Step 5: Clear warning on streak activity</p>
                  <p className="text-xs text-zinc-400">Tests 14-15, 17: Dismissible, auto-polls, clears on activity</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
