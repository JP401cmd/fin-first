'use client'

import { useState, useEffect } from 'react'
import { GoalProgressTimeline, buildGoalHistory } from '@/components/app/will/goal-progress-timeline'
import { type Goal } from '@/lib/goal-data'

type VerifyResult = {
  feature: number
  name: string
  passing: number
  total: number
  allPassing: boolean
  results: { name: string; pass: boolean; detail: string }[]
}

// Demo goals for visual testing
const demoGoals: { goal: Goal; contribs: { date: string; amount: number }[]; label: string }[] = [
  {
    label: '1. Spaardoel met deadline (op schema)',
    goal: {
      id: 'demo-1',
      user_id: 'demo',
      name: 'Noodfonds opbouwen',
      description: 'Spaardoel €10.000 met deadline over 6 maanden',
      goal_type: 'savings',
      target_value: 10000,
      current_value: 6500,
      target_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      linked_asset_id: null,
      linked_debt_id: null,
      icon: 'Target',
      color: 'teal',
      is_completed: false,
      completed_at: null,
      sort_order: 0,
      created_at: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    contribs: [
      { date: daysAgo(100), amount: 1500 },
      { date: daysAgo(80), amount: 1000 },
      { date: daysAgo(60), amount: 1200 },
      { date: daysAgo(40), amount: 800 },
      { date: daysAgo(20), amount: 1000 },
      { date: daysAgo(5), amount: 1000 },
    ],
  },
  {
    label: '2. Spaardoel met deadline (achterstand)',
    goal: {
      id: 'demo-2',
      user_id: 'demo',
      name: 'Vakantie Spanje',
      description: 'Spaardoel €5.000 — loopt achter',
      goal_type: 'savings',
      target_value: 5000,
      current_value: 1200,
      target_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      linked_asset_id: null,
      linked_debt_id: null,
      icon: 'Plane',
      color: 'amber',
      is_completed: false,
      completed_at: null,
      sort_order: 1,
      created_at: new Date(Date.now() - 150 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    contribs: [
      { date: daysAgo(130), amount: 300 },
      { date: daysAgo(100), amount: 200 },
      { date: daysAgo(70), amount: 300 },
      { date: daysAgo(40), amount: 200 },
      { date: daysAgo(10), amount: 200 },
    ],
  },
  {
    label: '3. Spaardoel ZONDER deadline',
    goal: {
      id: 'demo-3',
      user_id: 'demo',
      name: 'Investering portefeuille',
      description: 'Geen deadline — groeit op eigen tempo',
      goal_type: 'savings',
      target_value: 50000,
      current_value: 12000,
      target_date: null,
      linked_asset_id: null,
      linked_debt_id: null,
      icon: 'TrendingUp',
      color: 'emerald',
      is_completed: false,
      completed_at: null,
      sort_order: 2,
      created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    contribs: [
      { date: daysAgo(330), amount: 1500 },
      { date: daysAgo(300), amount: 1500 },
      { date: daysAgo(270), amount: 1500 },
      { date: daysAgo(240), amount: 1500 },
      { date: daysAgo(210), amount: 1000 },
      { date: daysAgo(180), amount: 1000 },
      { date: daysAgo(150), amount: 1000 },
      { date: daysAgo(120), amount: 500 },
      { date: daysAgo(90), amount: 500 },
      { date: daysAgo(60), amount: 500 },
      { date: daysAgo(30), amount: 500 },
    ],
  },
  {
    label: '4. Vrijheidsdagen doel met deadline (voorsprong)',
    goal: {
      id: 'demo-4',
      user_id: 'demo',
      name: '90 vrijheidsdagen',
      description: 'Vrijheidsdagen opbouwen — op voorsprong',
      goal_type: 'freedom_days',
      target_value: 90,
      current_value: 70,
      target_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      linked_asset_id: null,
      linked_debt_id: null,
      icon: 'Sun',
      color: 'purple',
      is_completed: false,
      completed_at: null,
      sort_order: 3,
      created_at: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    contribs: [
      { date: daysAgo(160), amount: 10 },
      { date: daysAgo(130), amount: 15 },
      { date: daysAgo(100), amount: 10 },
      { date: daysAgo(70), amount: 15 },
      { date: daysAgo(40), amount: 10 },
      { date: daysAgo(10), amount: 10 },
    ],
  },
  {
    label: '5. Doel zonder voortgangshistorie (1 punt)',
    goal: {
      id: 'demo-5',
      user_id: 'demo',
      name: 'Nieuwe auto',
      description: 'Zojuist aangemaakt — nog geen bijdragen',
      goal_type: 'savings',
      target_value: 25000,
      current_value: 500,
      target_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      linked_asset_id: null,
      linked_debt_id: null,
      icon: 'Car',
      color: 'blue',
      is_completed: false,
      completed_at: null,
      sort_order: 4,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    contribs: [],
  },
  {
    label: '6. Voltooid doel',
    goal: {
      id: 'demo-6',
      user_id: 'demo',
      name: 'Noodfonds bereikt!',
      description: 'Dit doel is al bereikt',
      goal_type: 'savings',
      target_value: 5000,
      current_value: 5200,
      target_date: null,
      linked_asset_id: null,
      linked_debt_id: null,
      icon: 'Trophy',
      color: 'emerald',
      is_completed: true,
      completed_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      sort_order: 5,
      created_at: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    contribs: [
      { date: daysAgo(180), amount: 1000 },
      { date: daysAgo(150), amount: 1200 },
      { date: daysAgo(120), amount: 1000 },
      { date: daysAgo(90), amount: 1000 },
      { date: daysAgo(60), amount: 500 },
      { date: daysAgo(30), amount: 500 },
    ],
  },
]

function daysAgo(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return d.toISOString().split('T')[0]
}

export default function TestGoalTimelinePage() {
  const [apiResults, setApiResults] = useState<VerifyResult | null>(null)
  const [apiLoading, setApiLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-goal-timeline')
      .then(r => r.json())
      .then(d => { setApiResults(d); setApiLoading(false) })
      .catch(() => setApiLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">
        Feature #217: Goal Progress Timeline Charts
      </h1>
      <p className="text-sm text-zinc-500 mb-6">
        Per goal: line chart showing progress toward target, deadline marker, on-track indicator, and pace message.
      </p>

      {/* API Verification Results */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-3">
          Verificatie resultaten
        </h2>
        {apiLoading ? (
          <div className="flex items-center justify-center py-4">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
          </div>
        ) : apiResults ? (
          <div className={`rounded-xl border p-4 ${apiResults.allPassing ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
            <p className="text-sm font-medium mb-2">
              {apiResults.allPassing ? '✅' : '⚠️'} {apiResults.passing}/{apiResults.total} tests passing
            </p>
            <div className="space-y-1">
              {apiResults.results.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span>{r.pass ? '✅' : '❌'}</span>
                  <div>
                    <span className="font-medium text-zinc-700">{r.name}</span>
                    <span className="text-zinc-500 ml-2">— {r.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-red-500">Fout bij laden verificatie</p>
        )}
      </section>

      {/* Visual Demo */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-3">
          Visuele demo
        </h2>
        <div className="space-y-6">
          {demoGoals.map(({ goal, contribs, label }) => {
            const history = buildGoalHistory(goal, contribs)
            return (
              <div key={goal.id} className="rounded-xl border border-zinc-200 bg-white p-5">
                <h3 className="text-sm font-semibold text-zinc-700 mb-3">{label}</h3>
                <GoalProgressTimeline goal={goal} history={history} />
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
