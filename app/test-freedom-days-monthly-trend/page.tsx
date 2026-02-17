'use client'

import { useState, useEffect } from 'react'
import { FreedomDaysMonthlyTrend } from '@/components/app/will/freedom-days-monthly-trend'

// Generate demo actions for testing
function generateDemoActions() {
  const actions = []
  const now = new Date()

  // Current month: 3 actions
  actions.push(
    { freedom_days_impact: 5.2, completed_at: new Date(now.getFullYear(), now.getMonth(), 3).toISOString() },
    { freedom_days_impact: 2.1, completed_at: new Date(now.getFullYear(), now.getMonth(), 10).toISOString() },
    { freedom_days_impact: 1.1, completed_at: new Date(now.getFullYear(), now.getMonth(), 15).toISOString() },
  )

  // Last month: 2 actions
  actions.push(
    { freedom_days_impact: 8.5, completed_at: new Date(now.getFullYear(), now.getMonth() - 1, 5).toISOString() },
    { freedom_days_impact: 5.6, completed_at: new Date(now.getFullYear(), now.getMonth() - 1, 20).toISOString() },
  )

  // 2 months ago: best month
  actions.push(
    { freedom_days_impact: 10, completed_at: new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString() },
    { freedom_days_impact: 4.1, completed_at: new Date(now.getFullYear(), now.getMonth() - 2, 15).toISOString() },
  )

  // 4 months ago
  actions.push(
    { freedom_days_impact: 3.3, completed_at: new Date(now.getFullYear(), now.getMonth() - 4, 12).toISOString() },
  )

  // 6 months ago
  actions.push(
    { freedom_days_impact: 7.0, completed_at: new Date(now.getFullYear(), now.getMonth() - 6, 8).toISOString() },
  )

  // 9 months ago
  actions.push(
    { freedom_days_impact: 2.5, completed_at: new Date(now.getFullYear(), now.getMonth() - 9, 22).toISOString() },
  )

  return actions
}

export default function TestFreedomDaysMonthlyTrend() {
  const [apiResult, setApiResult] = useState<{ summary: string; passing: number; total: number; results: { name: string; pass: boolean; detail: string }[] } | null>(null)

  useEffect(() => {
    fetch('/api/verify-freedom-days-monthly-trend')
      .then(r => r.json())
      .then(setApiResult)
      .catch(console.error)
  }, [])

  const demoActions = generateDemoActions()

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="mb-8 text-2xl font-bold text-zinc-900">
        Freedom Days Monthly Trend - Test Page
      </h1>

      {/* Demo 1: With data */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-zinc-700">Demo 1: With completed actions</h2>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <FreedomDaysMonthlyTrend completedActions={demoActions} />
        </div>
      </section>

      {/* Demo 2: No data */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-zinc-700">Demo 2: No data (empty state)</h2>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <FreedomDaysMonthlyTrend completedActions={[]} />
        </div>
      </section>

      {/* Demo 3: Single month */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-zinc-700">Demo 3: Single month only</h2>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <FreedomDaysMonthlyTrend completedActions={[
            { freedom_days_impact: 4.5, completed_at: new Date().toISOString() },
          ]} />
        </div>
      </section>

      {/* API Verification Results */}
      <section className="mt-12">
        <h2 className="mb-4 text-lg font-semibold text-zinc-700">API Verification Results</h2>
        {apiResult ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <p className="mb-4 text-lg font-bold">
              {apiResult.summary} —{' '}
              <span className={apiResult.passing === apiResult.total ? 'text-green-600' : 'text-red-600'}>
                {apiResult.passing === apiResult.total ? 'ALL PASSING' : 'SOME FAILING'}
              </span>
            </p>
            <div className="space-y-2">
              {apiResult.results.map((r, i) => (
                <div key={i} className={`flex items-start gap-2 rounded-lg p-2 ${r.pass ? 'bg-green-50' : 'bg-red-50'}`}>
                  <span className="mt-0.5">{r.pass ? '✅' : '❌'}</span>
                  <div>
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-zinc-500">{r.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">Loading verification results...</p>
        )}
      </section>
    </div>
  )
}
