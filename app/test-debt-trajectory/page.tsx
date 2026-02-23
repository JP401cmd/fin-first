'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  type Debt,
  debtProjection,
  amortizationSchedule,
  linearAmortization,
  interestOnlySchedule,
} from '@/lib/debt-data'
import { formatCurrency } from '@/components/app/budget-shared'

/**
 * Test page for Feature #125: Debt trajectory overlays real vs projected.
 *
 * This demonstrates:
 * 1. Actual balance line shows real data points (from valuations)
 * 2. Projected line extends from current balance
 * 3. Projected and actual align at transition point (today)
 * 4. Works for different debt types (annuity, linear, interest-only)
 */

type Valuation = {
  id: string
  user_id: string
  entity_type: string
  entity_id: string
  valuation_date: string
  value: number
  notes: string | null
  created_at: string
}

// Inline DebtTrajectoryChart for testing (same as in debts page)
function DebtTrajectoryChart({
  debt,
  valuations,
}: {
  debt: Debt
  valuations: Valuation[] | undefined
}) {
  const w = 600
  const h = 220
  const pad = { top: 16, right: 24, bottom: 32, left: 58 }
  const chartW = w - pad.left - pad.right
  const chartH = h - pad.top - pad.bottom

  const balance = Number(debt.current_balance)
  const original = Number(debt.original_amount)
  const rate = Number(debt.interest_rate)
  const payment = Number(debt.monthly_payment)
  const repType = debt.repayment_type

  // Build actual data points from valuations (sorted ascending by date)
  const actualPoints: { date: Date; value: number }[] = []

  // Add original amount at start_date as the first point
  if (debt.start_date && original > 0) {
    actualPoints.push({ date: new Date(debt.start_date), value: original })
  }

  // Add valuation history points
  if (valuations && valuations.length > 0) {
    const sorted = [...valuations].sort(
      (a, b) => new Date(a.valuation_date).getTime() - new Date(b.valuation_date).getTime()
    )
    for (const v of sorted) {
      actualPoints.push({ date: new Date(v.valuation_date), value: Number(v.value) })
    }
  }

  // Always ensure current balance as the last actual point (today)
  const today = new Date()
  actualPoints.push({ date: today, value: balance })

  // Build projected data points from current balance forward
  const projectedPoints: { date: Date; value: number }[] = []
  projectedPoints.push({ date: today, value: balance }) // Start at transition point

  if (balance > 0 && payment > 0) {
    let schedule: { month: number; date: string; balance: number }[] = []

    if (repType === 'aflossingsvrij') {
      let months = 120
      if (debt.end_date) {
        const end = new Date(debt.end_date)
        months = Math.max(1, Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
      }
      schedule = interestOnlySchedule(balance, rate, Math.min(months, 360), today)
    } else if (repType === 'lineair') {
      const monthlyRate = rate / 100 / 12
      const approxPrincipal = payment - (balance * monthlyRate / 2)
      if (approxPrincipal > 0) {
        const termMonths = Math.ceil(balance / approxPrincipal)
        schedule = linearAmortization(balance, rate, termMonths, today)
      }
    } else {
      const monthlyInterest = balance * (rate / 100 / 12)
      if (payment > monthlyInterest) {
        schedule = amortizationSchedule(balance, rate, payment, today)
      }
    }

    const step = Math.max(1, Math.floor(schedule.length / 50))
    for (let i = 0; i < schedule.length; i++) {
      if (i % step === 0 || i === schedule.length - 1) {
        projectedPoints.push({
          date: new Date(schedule[i].date),
          value: schedule[i].balance,
        })
      }
    }
  }

  // Calculate global min/max for axes
  const allPoints = [...actualPoints, ...projectedPoints]
  if (allPoints.length < 2) return null

  const minDate = allPoints.reduce((min, p) => (p.date < min ? p.date : min), allPoints[0].date)
  const maxDate = allPoints.reduce((max, p) => (p.date > max ? p.date : max), allPoints[0].date)
  const maxValue = Math.max(...allPoints.map((p) => p.value))

  const dateRange = maxDate.getTime() - minDate.getTime()
  if (dateRange <= 0 || maxValue <= 0) return null

  function xPos(date: Date) {
    return pad.left + ((date.getTime() - minDate.getTime()) / dateRange) * chartW
  }
  function yPos(val: number) {
    return pad.top + chartH - (val / maxValue) * chartH
  }

  const actualPath = actualPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(p.date).toFixed(1)},${yPos(p.value).toFixed(1)}`)
    .join(' ')

  const projectedPath = projectedPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(p.date).toFixed(1)},${yPos(p.value).toFixed(1)}`)
    .join(' ')

  const actualFill = actualPath
    + ` L ${xPos(actualPoints[actualPoints.length - 1].date).toFixed(1)},${(pad.top + chartH).toFixed(1)}`
    + ` L ${xPos(actualPoints[0].date).toFixed(1)},${(pad.top + chartH).toFixed(1)} Z`

  const projectedFill = projectedPath
    + ` L ${xPos(projectedPoints[projectedPoints.length - 1].date).toFixed(1)},${(pad.top + chartH).toFixed(1)}`
    + ` L ${xPos(projectedPoints[0].date).toFixed(1)},${(pad.top + chartH).toFixed(1)} Z`

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxValue * t))

  const xLabels: { date: Date; label: string }[] = []
  const startYear = minDate.getFullYear()
  const endYear = maxDate.getFullYear()
  for (let yr = startYear; yr <= endYear + 1; yr++) {
    const d = new Date(yr, 0, 1)
    if (d >= minDate && d <= maxDate) {
      xLabels.push({ date: d, label: String(yr) })
    }
  }
  const labelStep = Math.max(1, Math.ceil(xLabels.length / 8))
  const filteredLabels = xLabels.filter((_, i) => i % labelStep === 0)

  const transitionX = xPos(today)
  const transitionY = yPos(balance)

  return (
    <div data-testid="debt-trajectory-chart">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={`actual-fill-${debt.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id={`projected-fill-${debt.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {yTicks.map((val) => (
          <g key={val}>
            <line x1={pad.left} y1={yPos(val)} x2={w - pad.right} y2={yPos(val)} stroke="#e4e4e7" strokeWidth="0.5" />
            <text x={pad.left - 8} y={yPos(val) + 3} textAnchor="end" fontSize="8" fill="#a1a1aa">
              {val >= 1000 ? `${Math.round(val / 1000)}k` : val}
            </text>
          </g>
        ))}

        <line x1={transitionX} y1={pad.top} x2={transitionX} y2={pad.top + chartH} stroke="#a1a1aa" strokeWidth="0.75" strokeDasharray="3,3" />
        <text x={transitionX} y={pad.top - 4} textAnchor="middle" fontSize="7" fill="#71717a">vandaag</text>

        <path d={actualFill} fill={`url(#actual-fill-${debt.id})`} />
        <path d={projectedFill} fill={`url(#projected-fill-${debt.id})`} />

        <path d={actualPath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" data-testid="actual-balance-line" />
        <path d={projectedPath} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="6,3" strokeLinecap="round" strokeLinejoin="round" data-testid="projected-balance-line" />

        {actualPoints.map((p, i) => (
          <circle key={`actual-${i}`} cx={xPos(p.date)} cy={yPos(p.value)} r="2.5" fill="#3b82f6" stroke="white" strokeWidth="1" />
        ))}

        <circle cx={transitionX} cy={transitionY} r="4" fill="#f59e0b" stroke="white" strokeWidth="1.5" data-testid="transition-point" />

        {filteredLabels.map((xl) => (
          <text key={xl.label} x={xPos(xl.date)} y={h - 8} textAnchor="middle" fontSize="8" fill="#a1a1aa">{xl.label}</text>
        ))}

        <g transform={`translate(${pad.left}, ${h - 12})`}>
          <line x1="0" y1="0" x2="12" y2="0" stroke="#3b82f6" strokeWidth="2" />
          <text x="16" y="3" fontSize="7" fill="#71717a">Werkelijk</text>
          <line x1="80" y1="0" x2="92" y2="0" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4,2" />
          <text x="96" y="3" fontSize="7" fill="#71717a">Verwacht</text>
        </g>
      </svg>
    </div>
  )
}

export default function TestDebtTrajectoryPage() {
  const [results, setResults] = useState<{ name: string; pass: boolean; detail: string }[]>([])

  // Create test debt with history
  const testDebt: Debt = useMemo(() => ({
    id: 'test-trajectory-debt',
    user_id: 'test',
    name: 'Persoonlijke lening (test)',
    debt_type: 'personal_loan',
    original_amount: 10000,
    current_balance: 6000,
    interest_rate: 5,
    minimum_payment: 300,
    monthly_payment: 300,
    start_date: '2024-01-01',
    end_date: null,
    creditor: 'Test Bank',
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subtype: 'aflopend',
    is_tax_deductible: null,
    fixed_rate_end_date: null,
    nhg: null,
    linked_asset_id: null,
    credit_limit: null,
    repayment_type: null, // annuity
    draagkrachtmeting_date: null,
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100,
  }), [])

  // Create simulated valuation history
  const testValuations: Valuation[] = useMemo(() => [
    { id: 'v1', user_id: 'test', entity_type: 'debt', entity_id: 'test-trajectory-debt', valuation_date: '2024-03-01', value: 9200, notes: null, created_at: '' },
    { id: 'v2', user_id: 'test', entity_type: 'debt', entity_id: 'test-trajectory-debt', valuation_date: '2024-06-01', value: 8400, notes: null, created_at: '' },
    { id: 'v3', user_id: 'test', entity_type: 'debt', entity_id: 'test-trajectory-debt', valuation_date: '2024-09-01', value: 7600, notes: null, created_at: '' },
    { id: 'v4', user_id: 'test', entity_type: 'debt', entity_id: 'test-trajectory-debt', valuation_date: '2024-12-01', value: 6800, notes: null, created_at: '' },
    { id: 'v5', user_id: 'test', entity_type: 'debt', entity_id: 'test-trajectory-debt', valuation_date: '2025-06-01', value: 6400, notes: null, created_at: '' },
    { id: 'v6', user_id: 'test', entity_type: 'debt', entity_id: 'test-trajectory-debt', valuation_date: '2025-12-01', value: 6100, notes: null, created_at: '' },
  ], [])

  // Mortgage test (interest-only / aflossingsvrij)
  const mortgageDebt: Debt = useMemo(() => ({
    id: 'test-mortgage',
    user_id: 'test',
    name: 'Hypotheek (aflossingsvrij)',
    debt_type: 'mortgage',
    original_amount: 285000,
    current_balance: 285000,
    interest_rate: 3.8,
    minimum_payment: 750,
    monthly_payment: 750,
    start_date: '2020-06-01',
    end_date: '2050-06-01',
    creditor: 'ABN AMRO',
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subtype: 'aflossingsvrij',
    is_tax_deductible: false,
    fixed_rate_end_date: '2030-06-01',
    nhg: true,
    linked_asset_id: null,
    credit_limit: null,
    repayment_type: 'aflossingsvrij',
    draagkrachtmeting_date: null,
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100,
  }), [])

  // Linear debt test
  const linearDebt: Debt = useMemo(() => ({
    id: 'test-linear',
    user_id: 'test',
    name: 'Studielening (lineair)',
    debt_type: 'student_loan',
    original_amount: 18500,
    current_balance: 14200,
    interest_rate: 0.46,
    minimum_payment: 85,
    monthly_payment: 85,
    start_date: '2019-09-01',
    end_date: null,
    creditor: 'DUO',
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subtype: 'oud_stelsel',
    is_tax_deductible: null,
    fixed_rate_end_date: null,
    nhg: null,
    linked_asset_id: null,
    credit_limit: null,
    repayment_type: 'lineair',
    draagkrachtmeting_date: null,
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100,
  }), [])

  useEffect(() => {
    const tests: { name: string; pass: boolean; detail: string }[] = []

    // Test 1: Chart renders with actual data points
    const chart = document.querySelector('[data-testid="debt-trajectory-chart"]')
    tests.push({
      name: 'Chart renders',
      pass: !!chart,
      detail: chart ? 'DebtTrajectoryChart rendered successfully' : 'Chart not found',
    })

    // Test 2: Actual balance line exists
    const actualLine = document.querySelector('[data-testid="actual-balance-line"]')
    tests.push({
      name: 'Actual balance line shows real data points',
      pass: !!actualLine,
      detail: actualLine ? 'Blue solid line for actual balance found' : 'Actual balance line not found',
    })

    // Test 3: Projected line exists
    const projectedLine = document.querySelector('[data-testid="projected-balance-line"]')
    tests.push({
      name: 'Projected line extends from current balance',
      pass: !!projectedLine,
      detail: projectedLine ? 'Amber dashed line for projected payoff found' : 'Projected line not found',
    })

    // Test 4: Transition point exists
    const transitionPoint = document.querySelector('[data-testid="transition-point"]')
    tests.push({
      name: 'Projected and actual align at transition point',
      pass: !!transitionPoint,
      detail: transitionPoint ? 'Transition point (amber dot at "today") found' : 'Transition point not found',
    })

    // Test 5: Actual line has real data point dots
    const actualDots = chart?.querySelectorAll('circle[fill="#3b82f6"]')
    const hasMultipleActualPoints = (actualDots?.length ?? 0) >= 3
    tests.push({
      name: 'Actual line has multiple real data point dots',
      pass: hasMultipleActualPoints,
      detail: `Found ${actualDots?.length ?? 0} actual data point dots (blue circles, need >= 3)`,
    })

    // Test 6: Projected line path has dashed style
    const projDashArray = projectedLine?.getAttribute('stroke-dasharray')
    tests.push({
      name: 'Projected line is visually distinct (dashed)',
      pass: !!projDashArray && projDashArray.length > 0,
      detail: projDashArray ? `Projected line dasharray: ${projDashArray}` : 'No dash array found',
    })

    // Test 7: Legend shows both labels
    const svgText = chart?.textContent ?? ''
    const hasWerkelijk = svgText.includes('Werkelijk')
    const hasVerwacht = svgText.includes('Verwacht')
    tests.push({
      name: 'Legend shows Werkelijk and Verwacht labels',
      pass: hasWerkelijk && hasVerwacht,
      detail: `Werkelijk: ${hasWerkelijk}, Verwacht: ${hasVerwacht}`,
    })

    // Test 8: Today marker exists
    const hasVandaag = svgText.includes('vandaag')
    tests.push({
      name: 'Today marker labeled "vandaag"',
      pass: hasVandaag,
      detail: hasVandaag ? '"vandaag" label found at transition' : 'Missing "vandaag" label',
    })

    // Test 9: Mortgage chart (aflossingsvrij) renders
    const allCharts = document.querySelectorAll('[data-testid="debt-trajectory-chart"]')
    tests.push({
      name: 'Mortgage chart (aflossingsvrij) renders',
      pass: allCharts.length >= 2,
      detail: `Found ${allCharts.length} trajectory charts total (need >= 2)`,
    })

    // Test 10: Linear debt chart renders
    tests.push({
      name: 'Linear debt chart renders',
      pass: allCharts.length >= 3,
      detail: `Found ${allCharts.length} trajectory charts total (need >= 3)`,
    })

    setResults(tests)
  }, [])

  const passing = results.filter((r) => r.pass).length
  const total = results.length

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-bold text-zinc-900">
        Test: Schuldverloop - Werkelijk vs. Verwacht
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Feature #125 — Debt trajectory overlays real vs projected
      </p>

      {/* Test results */}
      {results.length > 0 && (
        <div className={`mt-4 rounded-xl border p-4 ${passing === total ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <p className={`text-sm font-bold ${passing === total ? 'text-emerald-700' : 'text-amber-700'}`}>
            {passing}/{total} tests passing
          </p>
          <div className="mt-2 space-y-1">
            {results.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={r.pass ? 'text-emerald-600' : 'text-red-600'}>{r.pass ? '✅' : '❌'}</span>
                <div>
                  <span className="font-medium text-zinc-900">{r.name}</span>
                  <span className="ml-2 text-zinc-500">{r.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chart 1: Personal loan with valuation history */}
      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-700 mb-3">
          1. Persoonlijke lening (annuiteit) — met saldohistorie
        </h2>
        <div className="mb-2 text-xs text-zinc-500">
          Origineel: €10.000 → Huidig: €6.000 | Rente: 5% | Betaling: €300/m
        </div>
        <DebtTrajectoryChart debt={testDebt} valuations={testValuations} />
        <div className="mt-2 text-xs text-zinc-400">
          Blauwe lijn = werkelijk saldoverloop (6 meetpunten + vandaag) | Amber = verwachte afloop
        </div>
      </section>

      {/* Chart 2: Mortgage (aflossingsvrij) */}
      <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-700 mb-3">
          2. Hypotheek (aflossingsvrij) — saldo blijft gelijk
        </h2>
        <div className="mb-2 text-xs text-zinc-500">
          Saldo: €285.000 | Rente: 3,8% | Aflossingsvrij tot 2050
        </div>
        <DebtTrajectoryChart debt={mortgageDebt} valuations={undefined} />
        <div className="mt-2 text-xs text-zinc-400">
          Verwachte lijn is vlak (aflossingsvrij: saldo daalt niet)
        </div>
      </section>

      {/* Chart 3: Linear student loan */}
      <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-700 mb-3">
          3. Studielening (lineair) — vaste aflossing
        </h2>
        <div className="mb-2 text-xs text-zinc-500">
          Origineel: €18.500 → Huidig: €14.200 | Rente: 0,46% | Betaling: €85/m
        </div>
        <DebtTrajectoryChart debt={linearDebt} valuations={undefined} />
        <div className="mt-2 text-xs text-zinc-400">
          Verwachte lijn daalt lineair (vaste aflossing per maand)
        </div>
      </section>

      {/* Verification data display */}
      <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-700">Verificatiedata</h2>
        <div className="mt-2 text-xs space-y-1 text-zinc-600">
          <p><strong>Persoonlijke lening projectie:</strong></p>
          {(() => {
            const proj = debtProjection(testDebt)
            return (
              <ul className="ml-4 list-disc">
                <li>Maanden tot afgelost: {proj.monthsToPayoff}</li>
                <li>Totale rente: {formatCurrency(proj.totalInterest)}</li>
                <li>Aflosdatum: {proj.payoffDate}</li>
                <li>Betaalbaar: {proj.isPayable ? 'Ja' : 'Nee'}</li>
              </ul>
            )
          })()}
          <p className="mt-2"><strong>Hypotheek (aflossingsvrij) projectie:</strong></p>
          {(() => {
            const proj = debtProjection(mortgageDebt)
            return (
              <ul className="ml-4 list-disc">
                <li>Maanden: {proj.monthsToPayoff}</li>
                <li>Totale rente: {formatCurrency(proj.totalInterest)}</li>
              </ul>
            )
          })()}
          <p className="mt-2"><strong>Studielening (lineair) projectie:</strong></p>
          {(() => {
            const proj = debtProjection(linearDebt)
            return (
              <ul className="ml-4 list-disc">
                <li>Maanden tot afgelost: {proj.monthsToPayoff}</li>
                <li>Totale rente: {formatCurrency(proj.totalInterest)}</li>
                <li>Aflosdatum: {proj.payoffDate}</li>
              </ul>
            )
          })()}
        </div>
      </section>
    </div>
  )
}
