'use client'

import { useState, useEffect, useMemo } from 'react'
import { BenchmarkComparisonChart } from '@/components/app/benchmark-comparison-chart'
import {
  buildPortfolioHistory,
  compareToBenchmarks,
  TIME_PERIODS,
  BENCHMARKS,
  type HoldingSnapshot,
  type TimePeriod,
  type ComparisonResult,
} from '@/lib/benchmark-comparison'

// ── Demo scenarios ──────────────────────────────────────────

function generateDemoSnapshots(
  startDate: string,
  months: number,
  startValue: number,
  monthlyGrowth: number,
  volatility: number = 0,
): HoldingSnapshot[] {
  const snapshots: HoldingSnapshot[] = []
  let value = startValue
  const current = new Date(startDate)

  for (let i = 0; i < months; i++) {
    const noise = volatility ? (Math.sin(i * 1.5) * volatility * value) : 0
    value = value * (1 + monthlyGrowth) + noise
    snapshots.push({
      date: current.toISOString().split('T')[0],
      totalValue: Math.round(value * 100) / 100,
      totalCost: startValue,
    })
    current.setMonth(current.getMonth() + 1)
  }

  return snapshots
}

// Scenario 1: Strong outperformer (15% annual = ~1.17% monthly)
const strongPerformer = generateDemoSnapshots('2023-01-01', 24, 50000, 0.0117, 0.02)

// Scenario 2: Underperformer (2% annual = ~0.17% monthly)
const underperformer = generateDemoSnapshots('2023-06-01', 18, 30000, 0.0017, 0.015)

// Scenario 3: Volatile performer
const volatilePerformer = generateDemoSnapshots('2024-01-01', 12, 25000, 0.008, 0.05)

// Scenario 4: Decline then recovery
const declineRecovery: HoldingSnapshot[] = [
  { date: '2024-01-01', totalValue: 40000, totalCost: 40000 },
  { date: '2024-02-01', totalValue: 38000, totalCost: 40000 },
  { date: '2024-03-01', totalValue: 35000, totalCost: 40000 },
  { date: '2024-04-01', totalValue: 33000, totalCost: 40000 },
  { date: '2024-05-01', totalValue: 34500, totalCost: 40000 },
  { date: '2024-06-01', totalValue: 37000, totalCost: 40000 },
  { date: '2024-07-01', totalValue: 39000, totalCost: 40000 },
  { date: '2024-08-01', totalValue: 41000, totalCost: 40000 },
  { date: '2024-09-01', totalValue: 42500, totalCost: 40000 },
  { date: '2024-10-01', totalValue: 43000, totalCost: 40000 },
  { date: '2024-11-01', totalValue: 44000, totalCost: 40000 },
  { date: '2024-12-01', totalValue: 45000, totalCost: 40000 },
]

const SCENARIOS = [
  { name: 'Sterke outperformer (15%/jaar)', snapshots: strongPerformer },
  { name: 'Underperformer (2%/jaar)', snapshots: underperformer },
  { name: 'Volatiele portfolio', snapshots: volatilePerformer },
  { name: 'Daling + herstel', snapshots: declineRecovery },
]

function DemoScenario({ name, snapshots }: { name: string; snapshots: HoldingSnapshot[] }) {
  const [activePeriod, setActivePeriod] = useState<TimePeriod>(
    TIME_PERIODS.find(p => p.id === 'all')!
  )

  const comparison = useMemo(
    () => compareToBenchmarks(snapshots, activePeriod),
    [snapshots, activePeriod]
  )

  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-zinc-800 mb-2">{name}</h3>
      <p className="text-xs text-zinc-500 mb-3">
        {snapshots.length} maanden data · Start: {snapshots[0]?.date} · Eind: {snapshots[snapshots.length - 1]?.date}
      </p>
      <BenchmarkComparisonChart
        comparison={comparison}
        onPeriodChange={setActivePeriod}
        activePeriod={activePeriod}
      />
    </div>
  )
}

export default function TestBenchmarkComparisonPage() {
  const [verifyResults, setVerifyResults] = useState<{
    summary: string
    results: { name: string; passed: boolean; details: string }[]
  } | null>(null)
  const [verifyLoading, setVerifyLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    fetch('/api/verify-benchmark-comparison')
      .then(r => r.json())
      .then(data => setVerifyResults(data))
      .catch(() => setVerifyResults(null))
      .finally(() => setVerifyLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">
        Benchmark Comparison Test
      </h1>
      <p className="text-sm text-zinc-500 mb-8">
        Feature #231: Benchmark comparison for portfolio (AEX, MSCI World, S&amp;P 500)
      </p>

      {/* Verification results */}
      <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-zinc-700 mb-4">Verificatie</h2>
        {verifyLoading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            Testen uitvoeren...
          </div>
        ) : verifyResults ? (
          <>
            <p className={`text-sm font-semibold mb-3 ${
              verifyResults.results.every(r => r.passed) ? 'text-emerald-600' : 'text-amber-600'
            }`}>
              {verifyResults.summary}
            </p>
            <div className="space-y-1.5">
              {verifyResults.results.map((r, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`text-sm ${r.passed ? 'text-emerald-500' : 'text-red-500'}`}>
                    {r.passed ? '✓' : '✗'}
                  </span>
                  <div className="flex-1">
                    <p className={`text-xs font-medium ${r.passed ? 'text-zinc-700' : 'text-red-700'}`}>
                      {r.name}
                    </p>
                    <p className="text-[10px] text-zinc-400">{r.details}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-red-600">Verificatie mislukt</p>
        )}
      </section>

      {/* Demo scenarios — render only on client to avoid hydration mismatch from Date-dependent benchmark generation */}
      <h2 className="text-lg font-bold text-zinc-900 mb-4">Demo Scenario&apos;s</h2>

      {mounted ? (
        <>
          {SCENARIOS.map((scenario, i) => (
            <DemoScenario key={i} name={scenario.name} snapshots={scenario.snapshots} />
          ))}

          {/* Empty state */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-zinc-800 mb-2">Lege staat (geen data)</h3>
            <BenchmarkComparisonChart
              comparison={null}
              onPeriodChange={() => {}}
              activePeriod={TIME_PERIODS[0]}
            />
          </div>

          {/* Loading state */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-zinc-800 mb-2">Laden...</h3>
            <BenchmarkComparisonChart
              comparison={null}
              onPeriodChange={() => {}}
              activePeriod={TIME_PERIODS[0]}
              loading
            />
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      )}
    </div>
  )
}
