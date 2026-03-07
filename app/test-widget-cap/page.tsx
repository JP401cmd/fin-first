'use client'

import { buildWidgetPrefsFromPreferences, type PreferencesData } from '@/components/onboarding/onboarding-preferences'

// Test cases for widget cap verification
const TEST_CASES: { label: string; prefs: PreferencesData }[] = [
  {
    label: 'Maximaal: alles geselecteerd',
    prefs: {
      mainGoal: 'fire',
      activityLevel: 'dagelijks',
      modules: ['kern', 'wil', 'horizon'],
      aiInsights: true,
      dashboardCategories: ['vermogen', 'budgetten', 'doelen', 'fire', 'beleggingen', 'voortgang'],
    },
  },
  {
    label: 'Minimaal: alleen vereiste antwoorden',
    prefs: {
      mainGoal: 'overzicht',
      activityLevel: 'maandelijks',
      modules: ['kern'],
      aiInsights: false,
      dashboardCategories: ['vermogen'],
    },
  },
  {
    label: 'Schulden focus',
    prefs: {
      mainGoal: 'schulden',
      activityLevel: 'wekelijks',
      modules: ['kern', 'wil'],
      aiInsights: true,
      dashboardCategories: ['budgetten', 'doelen'],
    },
  },
  {
    label: 'Defaults',
    prefs: {
      mainGoal: 'overzicht',
      activityLevel: 'wekelijks',
      modules: ['kern', 'wil', 'horizon'],
      aiInsights: true,
      dashboardCategories: ['vermogen', 'budgetten', 'doelen', 'fire', 'beleggingen', 'voortgang'],
    },
  },
]

const BASELINE = ['netto_vermogen', 'cash_flow', 'jouw_pad', 'vrijheidsvoortgang']

export default function TestWidgetCapPage() {
  return (
    <div className="mx-auto max-w-3xl p-8 space-y-8">
      <h1 className="text-2xl font-bold">Widget Cap Test (max 8)</h1>
      {TEST_CASES.map((tc, i) => {
        const result = buildWidgetPrefsFromPreferences(tc.prefs)
        const enabled = result.widgets.filter((w) => w.enabled)
        const baselinePresent = BASELINE.every((id) => enabled.some((w) => w.id === id))
        const pass = enabled.length <= 8 && baselinePresent
        return (
          <div key={i} className={`rounded-lg border-2 p-4 ${pass ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}`}>
            <h2 className="font-semibold">{tc.label}</h2>
            <p className="text-sm mt-1">
              Enabled: <strong>{enabled.length}</strong> / max 8
              {' — '}
              Baseline present: <strong>{baselinePresent ? 'YES' : 'NO'}</strong>
              {' — '}
              <span className={pass ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>
                {pass ? 'PASS' : 'FAIL'}
              </span>
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Widgets: {enabled.map((w) => w.id).join(', ')}
            </p>
          </div>
        )
      })}
    </div>
  )
}
