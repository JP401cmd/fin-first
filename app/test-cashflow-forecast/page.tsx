'use client'

import { useState, useEffect } from 'react'
import { CashFlowForecastChart, type ForecastPoint, type ForecastAlert } from '@/components/app/cashflow-forecast-chart'

/**
 * Visual test page for Feature #221: Cash flow forecast 3-6 months.
 * Shows multiple demo scenarios to verify the chart renders correctly.
 */
export default function TestCashFlowForecastPage() {
  const [apiTests, setApiTests] = useState<{ name: string; pass: boolean; details: string }[] | null>(null)
  const [apiPassing, setApiPassing] = useState(0)
  const [apiTotal, setApiTotal] = useState(0)

  useEffect(() => {
    fetch('/api/verify-cashflow-forecast')
      .then(r => r.json())
      .then(data => {
        setApiTests(data.tests)
        setApiPassing(data.passing)
        setApiTotal(data.total)
      })
      .catch(() => {})
  }, [])

  // Demo data: Scenario 1 — Growing balance (positive cash flow)
  const growingForecast: ForecastPoint[] = [
    { month: '2026-02-01', label: 'feb 2026', projectedBalance: 5200, income: 2800, expenses: 2100, isCurrentMonth: true },
    { month: '2026-03-01', label: 'mrt 2026', projectedBalance: 5900, income: 3200, expenses: 2500, isCurrentMonth: false },
    { month: '2026-04-01', label: 'apr 2026', projectedBalance: 6600, income: 3200, expenses: 2500, isCurrentMonth: false },
    { month: '2026-05-01', label: 'mei 2026', projectedBalance: 7300, income: 3200, expenses: 2500, isCurrentMonth: false },
    { month: '2026-06-01', label: 'jun 2026', projectedBalance: 8000, income: 3200, expenses: 2500, isCurrentMonth: false },
    { month: '2026-07-01', label: 'jul 2026', projectedBalance: 8700, income: 3200, expenses: 2500, isCurrentMonth: false },
    { month: '2026-08-01', label: 'aug 2026', projectedBalance: 9400, income: 3200, expenses: 2500, isCurrentMonth: false },
  ]

  // Demo data: Scenario 2 — Declining balance with alert
  const decliningForecast: ForecastPoint[] = [
    { month: '2026-02-01', label: 'feb 2026', projectedBalance: 3000, income: 1800, expenses: 2400, isCurrentMonth: true },
    { month: '2026-03-01', label: 'mrt 2026', projectedBalance: 2400, income: 2000, expenses: 2600, isCurrentMonth: false },
    { month: '2026-04-01', label: 'apr 2026', projectedBalance: 1800, income: 2000, expenses: 2600, isCurrentMonth: false },
    { month: '2026-05-01', label: 'mei 2026', projectedBalance: 1200, income: 2000, expenses: 2600, isCurrentMonth: false },
    { month: '2026-06-01', label: 'jun 2026', projectedBalance: 600, income: 2000, expenses: 2600, isCurrentMonth: false },
    { month: '2026-07-01', label: 'jul 2026', projectedBalance: 0, income: 2000, expenses: 2600, isCurrentMonth: false },
    { month: '2026-08-01', label: 'aug 2026', projectedBalance: -600, income: 2000, expenses: 2600, isCurrentMonth: false },
  ]
  const decliningAlerts: ForecastAlert[] = [
    { month: '2026-06-01', label: 'jun 2026', projectedBalance: 600, message: 'Let op: in juni zakt je saldo onder €500 (€600,00)' },
    { month: '2026-07-01', label: 'jul 2026', projectedBalance: 0, message: 'Let op: in juli wordt je saldo negatief (€0,00)' },
  ]

  // Demo data: Scenario 3 — Stable balance
  const stableForecast: ForecastPoint[] = [
    { month: '2026-02-01', label: 'feb 2026', projectedBalance: 4500, income: 2800, expenses: 2800, isCurrentMonth: true },
    { month: '2026-03-01', label: 'mrt 2026', projectedBalance: 4500, income: 2800, expenses: 2800, isCurrentMonth: false },
    { month: '2026-04-01', label: 'apr 2026', projectedBalance: 4500, income: 2800, expenses: 2800, isCurrentMonth: false },
    { month: '2026-05-01', label: 'mei 2026', projectedBalance: 4500, income: 2800, expenses: 2800, isCurrentMonth: false },
    { month: '2026-06-01', label: 'jun 2026', projectedBalance: 4500, income: 2800, expenses: 2800, isCurrentMonth: false },
    { month: '2026-07-01', label: 'jul 2026', projectedBalance: 4500, income: 2800, expenses: 2800, isCurrentMonth: false },
    { month: '2026-08-01', label: 'aug 2026', projectedBalance: 4500, income: 2800, expenses: 2800, isCurrentMonth: false },
  ]

  // Demo data: Scenario 4 — Empty / insufficient data
  const emptyForecast: ForecastPoint[] = []

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold text-zinc-900">Cash Flow Forecast — Test Page</h1>
      <p className="mt-2 text-sm text-zinc-500">Feature #221: Cashflow prognose 3-6 maanden</p>

      {/* API Test Results */}
      {apiTests && (
        <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-zinc-900">
            API Verificatie: {apiPassing}/{apiTotal} tests passing
          </h2>
          <div className="mt-3 space-y-1">
            {apiTests.map((test, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className={test.pass ? 'text-emerald-600' : 'text-red-600'}>
                  {test.pass ? '✅' : '❌'}
                </span>
                <span className="font-medium text-zinc-700">{test.name}</span>
                <span className="text-zinc-400">— {test.details}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Scenario 1: Growing */}
      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6" data-testid="scenario-growing">
        <h2 className="mb-4 text-lg font-semibold text-emerald-700">
          Scenario 1: Groeiend saldo (positieve cashflow)
        </h2>
        <CashFlowForecastChart
          forecast={growingForecast}
          alerts={[]}
          currentBalance={5200}
        />
      </section>

      {/* Scenario 2: Declining with alerts */}
      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6" data-testid="scenario-declining">
        <h2 className="mb-4 text-lg font-semibold text-red-700">
          Scenario 2: Dalend saldo met waarschuwingen
        </h2>
        <CashFlowForecastChart
          forecast={decliningForecast}
          alerts={decliningAlerts}
          currentBalance={3000}
        />
      </section>

      {/* Scenario 3: Stable */}
      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6" data-testid="scenario-stable">
        <h2 className="mb-4 text-lg font-semibold text-zinc-700">
          Scenario 3: Stabiel saldo
        </h2>
        <CashFlowForecastChart
          forecast={stableForecast}
          alerts={[]}
          currentBalance={4500}
        />
      </section>

      {/* Scenario 4: Empty data */}
      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6" data-testid="scenario-empty">
        <h2 className="mb-4 text-lg font-semibold text-zinc-500">
          Scenario 4: Geen data
        </h2>
        <CashFlowForecastChart
          forecast={emptyForecast}
          alerts={[]}
          currentBalance={0}
        />
      </section>
    </div>
  )
}
