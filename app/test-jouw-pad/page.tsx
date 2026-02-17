'use client'

import { useEffect, useState } from 'react'
import { JouwPadWidget } from '@/components/app/jouw-pad-widget'

interface TestResult {
  name: string
  pass: boolean
  detail: string
}

interface VerifyResponse {
  feature: string
  summary: string
  allPassing: boolean
  results: TestResult[]
}

export default function TestJouwPadPage() {
  const [apiResults, setApiResults] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-jouw-pad')
      .then(r => r.json())
      .then(setApiResults)
      .finally(() => setLoading(false))
  }, [])

  // Demo scenarios for the widget
  const scenarios = [
    {
      label: 'Recovery (Level -2): Time Deficit',
      props: { level: -2, phase: 'recovery', freedomPct: 0, netWorth: -5000, monthsCovered: -2, hasConsumerDebt: true },
    },
    {
      label: 'Recovery (Level 0): The Reset',
      props: { level: 0, phase: 'recovery', freedomPct: 0, netWorth: 500, monthsCovered: 0.3, hasConsumerDebt: false },
    },
    {
      label: 'Stability (Level 1): Time Buffer',
      props: { level: 1, phase: 'stability', freedomPct: 2, netWorth: 3000, monthsCovered: 1.5, hasConsumerDebt: false },
    },
    {
      label: 'Stability (Level 2): Time Shield',
      props: { level: 2, phase: 'stability', freedomPct: 5, netWorth: 8000, monthsCovered: 4, hasConsumerDebt: false },
    },
    {
      label: 'Momentum (Level 3): Time Investor',
      props: { level: 3, phase: 'momentum', freedomPct: 15, netWorth: 50000, monthsCovered: 12, hasConsumerDebt: false },
    },
    {
      label: 'Momentum (Level 4): Time Multiplier',
      props: { level: 4, phase: 'momentum', freedomPct: 50, netWorth: 200000, monthsCovered: 48, hasConsumerDebt: false },
    },
    {
      label: 'Mastery (Level 5): Time Sovereign',
      props: { level: 5, phase: 'mastery', freedomPct: 85, netWorth: 500000, monthsCovered: 120, hasConsumerDebt: false },
    },
    {
      label: 'Mastery (Level 6): Timeless (max level)',
      props: { level: 6, phase: 'mastery', freedomPct: 110, netWorth: 1000000, monthsCovered: 240, hasConsumerDebt: false },
    },
  ]

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">Feature #195: Jouw Pad Progress Widget</h1>
      <p className="text-sm text-zinc-500 mb-8">
        Verifies the Jouw Pad widget shows current phase, level, criteria checklist, and next unlock preview.
      </p>

      {/* API Verification Results */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-zinc-800 mb-4">API Verification Results</h2>
        {loading ? (
          <p className="text-zinc-400">Loading...</p>
        ) : apiResults ? (
          <div className="space-y-2">
            <div className={`rounded-lg px-4 py-3 text-sm font-semibold ${apiResults.allPassing ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {apiResults.summary} — {apiResults.allPassing ? 'ALL PASSING' : 'SOME FAILING'}
            </div>
            {apiResults.results.map((r, i) => (
              <div key={i} className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${r.pass ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'}`}>
                <span className="mt-0.5 text-lg">{r.pass ? '✅' : '❌'}</span>
                <div>
                  <p className="text-sm font-medium text-zinc-800">{r.name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{r.detail}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-red-500">Failed to load results</p>
        )}
      </section>

      {/* Visual Demo: Widget at all levels */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-800 mb-4">Visual Demo: All Sovereignty Levels</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {scenarios.map((scenario, i) => (
            <div key={i}>
              <p className="text-xs font-medium text-zinc-400 mb-2">{scenario.label}</p>
              <JouwPadWidget {...scenario.props} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
