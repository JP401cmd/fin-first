'use client'

import { useState, useEffect } from 'react'
import { computeNetWorthProjection, type NetWorthProjectionResult } from '@/lib/net-worth-projection'
import { NetWorthProjectionChart } from '@/components/app/net-worth-projection-chart'

const SCENARIOS: { label: string; netWorth: number; monthlySavings: number; fireTarget: number }[] = [
  { label: '1. Groeiend vermogen (spaarder)', netWorth: 50000, monthlySavings: 1500, fireTarget: 600000 },
  { label: '2. Hoog vermogen, FIRE dichtbij', netWorth: 500000, monthlySavings: 3000, fireTarget: 600000 },
  { label: '3. Negatief vermogen (schulden)', netWorth: -20000, monthlySavings: 500, fireTarget: 450000 },
  { label: '4. Dalend vermogen (meer uitgeven)', netWorth: 100000, monthlySavings: -2000, fireTarget: 750000 },
  { label: '5. Stabiel, laag inkomen', netWorth: 30000, monthlySavings: 200, fireTarget: 500000 },
  { label: '6. FIRE al bereikt', netWorth: 800000, monthlySavings: 5000, fireTarget: 600000 },
]

export default function TestNwProjection() {
  const [projections, setProjections] = useState<(NetWorthProjectionResult | null)[]>([])
  const [apiResults, setApiResults] = useState<{ passing: number; total: number; results: { name: string; pass: boolean; detail: string }[] } | null>(null)

  useEffect(() => {
    const results = SCENARIOS.map(s =>
      computeNetWorthProjection(s.netWorth, s.monthlySavings, s.fireTarget)
    )
    setProjections(results)

    fetch('/api/verify-nw-projection')
      .then(r => r.json())
      .then(data => setApiResults(data))
      .catch(() => {})
  }, [])

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">Net Worth Projection Test</h1>
      <p className="text-sm text-zinc-500 mb-8">Feature #224 — Vermogensprognose (1-5 jaar, De Kern)</p>

      {/* API Verification Results */}
      {apiResults && (
        <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-700 mb-3">
            API Verificatie: {apiResults.passing}/{apiResults.total} tests passing
          </h2>
          <div className="space-y-1">
            {apiResults.results.map((r, i) => (
              <div key={i} className={`flex items-start gap-2 text-xs ${r.pass ? 'text-emerald-700' : 'text-red-600'}`}>
                <span>{r.pass ? '✅' : '❌'}</span>
                <span className="font-medium">{r.name}</span>
                <span className="text-zinc-400 flex-1 text-right">{r.detail.slice(0, 100)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Visual Scenarios */}
      <div className="space-y-8">
        {SCENARIOS.map((scenario, idx) => (
          <div key={idx} className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-zinc-700 mb-1">{scenario.label}</h2>
            <p className="text-xs text-zinc-400 mb-4">
              Vermogen: €{scenario.netWorth.toLocaleString('nl-NL')} |
              Maandelijks: €{scenario.monthlySavings.toLocaleString('nl-NL')} |
              FIRE: €{scenario.fireTarget.toLocaleString('nl-NL')}
            </p>
            {projections[idx] && (
              <NetWorthProjectionChart projection={projections[idx]!} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
