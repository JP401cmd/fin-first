'use client'

import { buildWidgetPrefsFromPreferences, type PreferencesData } from '@/components/onboarding/onboarding-preferences'

// Test cases for widget layout verification (now uses auto-dashboard-builder via focuses)
const TEST_CASES: { label: string; prefs: PreferencesData }[] = [
  {
    label: 'FIRE + budgetten focus (2 focuses)',
    prefs: { focuses: ['fire_freedom', 'budget_cashflow'] },
  },
  {
    label: 'Minimaal: alleen overview',
    prefs: { focuses: ['overview'] },
  },
  {
    label: 'Doelen + vermogen focus',
    prefs: { focuses: ['goals_actions', 'assets_investments'] },
  },
  {
    label: 'Fallback: geen focus (= overview)',
    prefs: { focuses: [] },
  },
]

export default function TestWidgetCapPage() {
  return (
    <div className="mx-auto max-w-3xl p-8 space-y-8">
      <h1 className="text-2xl font-bold">Widget Layout Test (medium grid = 16 cells)</h1>
      {TEST_CASES.map((tc, i) => {
        const result = buildWidgetPrefsFromPreferences(tc.prefs)
        const enabled = result.widgets.filter((w) => w.enabled)
        const totalCells = enabled.reduce((sum, w) => {
          const cells = w.size === 'full' ? 4 : w.size === 'half' ? 2 : 1
          return sum + cells
        }, 0)
        const pass = totalCells === 16
        return (
          <div key={i} className={`rounded-lg border-2 p-4 ${pass ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}`}>
            <h2 className="font-semibold">{tc.label}</h2>
            <p className="text-sm mt-1">
              Enabled: <strong>{enabled.length}</strong> widgets
              {' — '}
              Cells: <strong>{totalCells}</strong> / 16
              {' — '}
              <span className={pass ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>
                {pass ? 'PASS' : 'FAIL'}
              </span>
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Widgets: {enabled.map((w) => `${w.id}(${w.size})`).join(', ')}
            </p>
          </div>
        )
      })}
    </div>
  )
}
