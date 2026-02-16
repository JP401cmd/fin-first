'use client'

import { useEffect, useState } from 'react'
import { computeGoalProgress, getGoalColorClasses, type Goal } from '@/lib/goal-data'

/**
 * Test page for Feature #130: Goal progress bar reflects real current_value
 *
 * Demonstrates:
 * 1. Create goal with target 10000 EUR, current_value 3000 → 30% bar
 * 2. Update to current_value 5000 → 50% bar
 * 3. Verification via API endpoint
 */

type ApiResult = {
  feature: number
  name: string
  passing: number
  total: number
  allPassing: boolean
  results: { name: string; pass: boolean; detail: string }[]
}

export default function TestGoalProgressBarPage() {
  const [apiResults, setApiResults] = useState<ApiResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Demo goals for visual verification
  const goal30: Goal = {
    id: 'demo-30', user_id: 'demo', name: 'Spaardoel €10.000 (stap 1)',
    description: 'Target €10.000, huidig €3.000 → verwacht 30%',
    goal_type: 'savings', target_value: 10000, current_value: 3000,
    target_date: '2027-06-01', linked_asset_id: null, linked_debt_id: null,
    icon: '🎯', color: 'teal', is_completed: false, completed_at: null,
    sort_order: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-16T00:00:00Z',
  }

  const goal50: Goal = {
    id: 'demo-50', user_id: 'demo', name: 'Spaardoel €10.000 (stap 2)',
    description: 'Target €10.000, huidig €5.000 → verwacht 50%',
    goal_type: 'savings', target_value: 10000, current_value: 5000,
    target_date: '2027-06-01', linked_asset_id: null, linked_debt_id: null,
    icon: '🎯', color: 'emerald', is_completed: false, completed_at: null,
    sort_order: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-16T00:00:00Z',
  }

  const progress30 = computeGoalProgress(goal30)
  const progress50 = computeGoalProgress(goal50)

  useEffect(() => {
    fetch('/api/verify-goal-progress-bar')
      .then(res => res.json())
      .then(data => {
        setApiResults(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">
        Feature #130: Goal Progress Bar Reflects Real current_value
      </h1>
      <p className="text-sm text-zinc-500 mb-6">
        Verifies that goal progress visualization uses actual tracked progress values.
      </p>

      {/* Visual verification: 30% progress bar */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-3">
          Stap 1: Doel met €3.000 / €10.000 (verwacht 30%)
        </h2>
        <GoalProgressCard goal={goal30} progress={progress30} expectedPct={30} />
      </section>

      {/* Visual verification: 50% progress bar */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-3">
          Stap 2: Bijgewerkt naar €5.000 / €10.000 (verwacht 50%)
        </h2>
        <GoalProgressCard goal={goal50} progress={progress50} expectedPct={50} />
      </section>

      {/* API verification results */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-3">
          API Verificatie Resultaten
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
            <span className="ml-2 text-sm text-zinc-500">Laden...</span>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-600">Fout: {error}</p>
          </div>
        ) : apiResults ? (
          <div className="space-y-2">
            <div className={`rounded-xl border p-4 ${
              apiResults.allPassing ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
            }`}>
              <p className="text-sm font-bold">
                {apiResults.allPassing ? '✅' : '❌'} {apiResults.passing}/{apiResults.total} tests passing
              </p>
            </div>
            {apiResults.results.map((r, i) => (
              <div key={i} className={`rounded-lg border p-3 ${
                r.pass ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
              }`}>
                <p className="text-sm font-medium">
                  {r.pass ? '✅' : '❌'} {r.name}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">{r.detail}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {/* Summary of how it works */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-3">
          Hoe het werkt
        </h2>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 space-y-2">
          <p><strong>1.</strong> Doelen worden geladen uit de <code className="bg-zinc-100 px-1 rounded">goals</code> Supabase tabel met <code className="bg-zinc-100 px-1 rounded">current_value</code> en <code className="bg-zinc-100 px-1 rounded">target_value</code>.</p>
          <p><strong>2.</strong> <code className="bg-zinc-100 px-1 rounded">computeGoalProgress(goal)</code> berekent het percentage: <code className="bg-zinc-100 px-1 rounded">pct = round((current / target) × 100)</code>.</p>
          <p><strong>3.</strong> De voortgangsbalk breedte wordt direct ingesteld via <code className="bg-zinc-100 px-1 rounded">{'style={{ width: `${pct}%` }}'}</code>.</p>
          <p><strong>4.</strong> Bij update via PATCH /api/goals wordt <code className="bg-zinc-100 px-1 rounded">current_value</code> bijgewerkt in de database en de balk wordt opnieuw berekend.</p>
          <p><strong>5.</strong> Gekoppelde assets/schulden updaten <code className="bg-zinc-100 px-1 rounded">current_value</code> automatisch vanuit de actuele waarde.</p>
        </div>
      </section>
    </div>
  )
}

function GoalProgressCard({
  goal,
  progress,
  expectedPct,
}: {
  goal: Goal
  progress: { current: number; target: number; pct: number; onTrack: boolean; eta: string | null }
  expectedPct: number
}) {
  const colors = getGoalColorClasses(goal.color)
  const pass = progress.pct === expectedPct

  return (
    <div className={`rounded-xl border p-5 ${pass ? 'border-emerald-200 bg-white' : 'border-red-200 bg-red-50'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colors.bgLight}`}>
            <span className="text-lg">{goal.icon}</span>
          </div>
          <div>
            <h3 className="font-semibold text-zinc-900">{goal.name}</h3>
            <p className="text-xs text-zinc-500">{goal.description}</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-zinc-800">{progress.pct}%</span>
          <p className={`text-xs font-medium ${pass ? 'text-emerald-600' : 'text-red-600'}`}>
            {pass ? '✅ PASS' : `❌ FAIL (verwacht ${expectedPct}%)`}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs mb-2">
        <span className="font-medium text-zinc-600">
          €{progress.current.toLocaleString('nl-NL')} / €{progress.target.toLocaleString('nl-NL')}
        </span>
        {progress.eta && <span className="text-zinc-400">{progress.eta}</span>}
      </div>

      {/* The actual progress bar - identical pattern to will/page.tsx GoalSummaryRow */}
      <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full ${colors.bar} transition-all duration-500`}
          style={{ width: `${progress.pct}%` }}
          data-testid={`progress-bar-${expectedPct}`}
        />
      </div>

      <p className="mt-2 text-xs text-zinc-400">
        Bar breedte: {progress.pct}% — ingesteld via style=&#123;&#123; width: `$&#123;pct&#125;%` &#125;&#125;
      </p>
    </div>
  )
}
