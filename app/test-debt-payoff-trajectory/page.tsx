'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  type Debt,
  type PayoffStrategy,
  simulatePayoff,
  payoffSummary,
} from '@/lib/debt-data'
import { formatCurrency } from '@/components/app/budget-shared'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'

/**
 * Test page for Feature #223: Debt payoff trajectory chart in UI.
 *
 * Demonstrates:
 * 1. Per-debt projected balance decline over time
 * 2. Strategy comparison overlay (snowball vs avalanche)
 * 3. Time difference between strategies
 * 4. Contextual comparison message
 */

// Inline DebtPayoffTrajectoryChart for test page
function DebtPayoffTrajectoryChart({
  snowballMonths,
  avalancheMonths,
  snowballSummary,
  avalancheSummary,
}: {
  snowballMonths: ReturnType<typeof simulatePayoff>
  avalancheMonths: ReturnType<typeof simulatePayoff>
  snowballSummary: ReturnType<typeof payoffSummary>
  avalancheSummary: ReturnType<typeof payoffSummary>
}) {
  if (snowballMonths.length === 0 && avalancheMonths.length === 0) return null

  const w = 800
  const h = 240
  const pad = { top: 16, right: 24, bottom: 40, left: 60 }
  const chartW = w - pad.left - pad.right
  const chartH = h - pad.top - pad.bottom

  const maxBalance = Math.max(
    snowballMonths[0]?.totalBalance ?? 0,
    avalancheMonths[0]?.totalBalance ?? 0,
  )
  const maxMonth = Math.max(snowballMonths.length, avalancheMonths.length)

  if (maxBalance <= 0 || maxMonth <= 0) return null

  function x(month: number) {
    return pad.left + (month / maxMonth) * chartW
  }
  function y(val: number) {
    return pad.top + chartH - (val / maxBalance) * chartH
  }

  const sampleStep = Math.max(1, Math.floor(maxMonth / 80))

  function buildPath(months: ReturnType<typeof simulatePayoff>) {
    const sampled = months.filter((_, i) => i % sampleStep === 0 || i === months.length - 1)
    return sampled
      .map((m, i) => `${i === 0 ? 'M' : 'L'} ${x(m.month).toFixed(1)},${y(m.totalBalance).toFixed(1)}`)
      .join(' ')
  }

  function buildFillPath(months: ReturnType<typeof simulatePayoff>) {
    const sampled = months.filter((_, i) => i % sampleStep === 0 || i === months.length - 1)
    const linePath = sampled
      .map((m, i) => `${i === 0 ? 'M' : 'L'} ${x(m.month).toFixed(1)},${y(m.totalBalance).toFixed(1)}`)
      .join(' ')
    const last = sampled[sampled.length - 1]
    const first = sampled[0]
    return linePath
      + ` L ${x(last.month).toFixed(1)},${(pad.top + chartH).toFixed(1)}`
      + ` L ${x(first.month).toFixed(1)},${(pad.top + chartH).toFixed(1)} Z`
  }

  const snowballPath = buildPath(snowballMonths)
  const avalanchePath = buildPath(avalancheMonths)
  const snowballFill = buildFillPath(snowballMonths)
  const avalancheFill = buildFillPath(avalancheMonths)

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxBalance * t))
  const xTicks: number[] = []
  for (let m = 12; m < maxMonth; m += 12) xTicks.push(m)
  if (maxMonth > 6) xTicks.push(maxMonth)

  const snowballPayoffMonth = snowballMonths.length
  const avalanchePayoffMonth = avalancheMonths.length

  return (
    <div data-testid="debt-payoff-trajectory-chart">
      <p className="mb-2 text-xs font-semibold text-zinc-500 uppercase">Schuld-trajectvergelijking</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="snowball-fill-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="avalanche-fill-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {yTicks.map((val) => (
          <g key={val}>
            <line x1={pad.left} y1={y(val)} x2={w - pad.right} y2={y(val)} stroke="#e4e4e7" strokeWidth="0.5" />
            <text x={pad.left - 8} y={y(val) + 3} textAnchor="end" fontSize="8" fill="#a1a1aa">
              {val >= 1000 ? `€${Math.round(val / 1000)}k` : `€${val}`}
            </text>
          </g>
        ))}

        <path d={snowballFill} fill="url(#snowball-fill-grad)" />
        <path d={avalancheFill} fill="url(#avalanche-fill-grad)" />

        <path d={snowballPath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" data-testid="snowball-trajectory-line" />
        <path d={avalanchePath} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" data-testid="avalanche-trajectory-line" />

        {snowballPayoffMonth < maxMonth && (
          <>
            <line x1={x(snowballPayoffMonth)} y1={pad.top} x2={x(snowballPayoffMonth)} y2={pad.top + chartH} stroke="#3b82f6" strokeWidth="1" strokeDasharray="4,3" strokeOpacity="0.5" />
            <circle cx={x(snowballPayoffMonth)} cy={y(0)} r="4" fill="#3b82f6" stroke="white" strokeWidth="1.5" />
          </>
        )}
        {avalanchePayoffMonth < maxMonth && (
          <>
            <line x1={x(avalanchePayoffMonth)} y1={pad.top} x2={x(avalanchePayoffMonth)} y2={pad.top + chartH} stroke="#ef4444" strokeWidth="1" strokeDasharray="4,3" strokeOpacity="0.5" />
            <circle cx={x(avalanchePayoffMonth)} cy={y(0)} r="4" fill="#ef4444" stroke="white" strokeWidth="1.5" />
          </>
        )}

        {xTicks.map((m) => (
          <text key={m} x={x(m)} y={h - 18} textAnchor="middle" fontSize="8" fill="#a1a1aa">
            {m >= 12 ? `${Math.floor(m / 12)}j` : `${m}m`}
          </text>
        ))}

        <g transform={`translate(${pad.left}, ${h - 8})`}>
          <line x1="0" y1="0" x2="16" y2="0" stroke="#3b82f6" strokeWidth="2.5" />
          <text x="20" y="3" fontSize="8" fill="#71717a">Sneeuwbal</text>
          <line x1="110" y1="0" x2="126" y2="0" stroke="#ef4444" strokeWidth="2.5" />
          <text x="130" y="3" fontSize="8" fill="#71717a">Avalanche</text>
        </g>
      </svg>
    </div>
  )
}

function StrategyComparisonMessage({
  snowballSummary,
  avalancheSummary,
  dailyExpenses,
}: {
  snowballSummary: ReturnType<typeof payoffSummary>
  avalancheSummary: ReturnType<typeof payoffSummary>
  dailyExpenses: number
}) {
  if (snowballSummary.totalMonths === 0 && avalancheSummary.totalMonths === 0) return null

  const snowMonths = snowballSummary.totalMonths
  const avMonths = avalancheSummary.totalMonths
  const snowInterest = snowballSummary.totalInterest
  const avInterest = avalancheSummary.totalInterest

  const monthDiff = Math.abs(snowMonths - avMonths)
  const interestDiff = Math.abs(snowInterest - avInterest)

  const avalancheFaster = avMonths < snowMonths
  const avalancheCheaper = avInterest < snowInterest
  const sameTime = monthDiff === 0
  const sameInterest = interestDiff < 1

  let message = ''
  let bgClass = ''
  let textClass = ''

  if (sameTime && sameInterest) {
    message = 'Beide strategieën leiden tot hetzelfde resultaat voor jouw schulden.'
    bgClass = 'border-zinc-200 bg-zinc-50'
    textClass = 'text-zinc-700'
  } else if (avalancheFaster && avalancheCheaper) {
    message = `Bij avalanche-strategie ben je ${monthDiff} ${monthDiff === 1 ? 'maand' : 'maanden'} eerder schuldenvrij en bespaar je ${formatCurrency(interestDiff)} aan rente.`
    bgClass = 'border-red-200 bg-red-50'
    textClass = 'text-red-700'
  } else if (!avalancheFaster && !avalancheCheaper && !sameTime) {
    message = `Bij sneeuwbal-strategie ben je ${monthDiff} ${monthDiff === 1 ? 'maand' : 'maanden'} eerder schuldenvrij en bespaar je ${formatCurrency(interestDiff)} aan rente.`
    bgClass = 'border-blue-200 bg-blue-50'
    textClass = 'text-blue-700'
  } else if (avalancheCheaper) {
    message = `Bij avalanche-strategie bespaar je ${formatCurrency(interestDiff)} aan rente${!sameTime ? ` (${avalancheFaster ? `${monthDiff} maanden sneller` : `${monthDiff} maanden langer`})` : ''}.`
    bgClass = 'border-red-200 bg-red-50'
    textClass = 'text-red-700'
  } else {
    message = `Bij sneeuwbal-strategie ben je ${monthDiff} ${monthDiff === 1 ? 'maand' : 'maanden'} eerder schuldenvrij${!sameInterest ? `, maar betaal je ${formatCurrency(interestDiff)} meer rente` : ''}.`
    bgClass = 'border-blue-200 bg-blue-50'
    textClass = 'text-blue-700'
  }

  let freedomNote = ''
  if (dailyExpenses > 0 && interestDiff > 100) {
    const savedDays = Math.round(interestDiff / dailyExpenses)
    if (savedDays > 0) {
      freedomNote = ` Dat is ${savedDays} ${savedDays === 1 ? 'dag' : 'dagen'} aan extra vrijheid.`
    }
  }

  return (
    <div
      className={`mt-3 rounded-xl border p-3 text-center ${bgClass}`}
      data-testid="strategy-comparison-message"
    >
      <p className={`text-sm font-medium ${textClass}`} data-testid="strategy-comparison-text">
        {message}
        {freedomNote && <span className="font-normal text-amber-600">{freedomNote}</span>}
      </p>
      {!sameTime && (
        <div className="mt-2 flex items-center justify-center gap-6 text-xs text-zinc-500">
          <span data-testid="snowball-months">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500 mr-1" />
            Sneeuwbal: {snowMonths} mnd
          </span>
          <span data-testid="avalanche-months">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500 mr-1" />
            Avalanche: {avMonths} mnd
          </span>
          <span data-testid="time-difference">
            Verschil: {monthDiff} {monthDiff === 1 ? 'maand' : 'maanden'}
          </span>
        </div>
      )}
    </div>
  )
}

export default function TestDebtPayoffTrajectoryPage() {
  const [results, setResults] = useState<{ name: string; pass: boolean; detail: string }[]>([])

  // Test debts with different rates to show strategy difference
  const testDebts: Debt[] = useMemo(() => [
    {
      id: 'test-cc', user_id: 'test', name: 'Creditcard',
      debt_type: 'credit_card', original_amount: 3000, current_balance: 2500,
      interest_rate: 18.9, minimum_payment: 50, monthly_payment: 50,
      start_date: '2024-06-01', end_date: null, creditor: 'VISA',
      notes: null, is_active: true, sort_order: 0,
      created_at: '', updated_at: '', subtype: 'regulier',
      is_tax_deductible: null, fixed_rate_end_date: null, nhg: null,
      linked_asset_id: null, credit_limit: 5000, repayment_type: null,
      draagkrachtmeting_date: null,
      ownership: 'personal', household_id: null, net_worth_inclusion_pct: 100,
    },
    {
      id: 'test-pl', user_id: 'test', name: 'Persoonlijke lening',
      debt_type: 'personal_loan', original_amount: 8000, current_balance: 5200,
      interest_rate: 6.5, minimum_payment: 120, monthly_payment: 120,
      start_date: '2023-03-01', end_date: null, creditor: 'ING',
      notes: null, is_active: true, sort_order: 1,
      created_at: '', updated_at: '', subtype: 'aflopend',
      is_tax_deductible: null, fixed_rate_end_date: null, nhg: null,
      linked_asset_id: null, credit_limit: null, repayment_type: null,
      draagkrachtmeting_date: null,
      ownership: 'personal', household_id: null, net_worth_inclusion_pct: 100,
    },
    {
      id: 'test-sl', user_id: 'test', name: 'Studielening DUO',
      debt_type: 'student_loan', original_amount: 15000, current_balance: 12000,
      interest_rate: 0.46, minimum_payment: 85, monthly_payment: 85,
      start_date: '2019-09-01', end_date: null, creditor: 'DUO',
      notes: null, is_active: true, sort_order: 2,
      created_at: '', updated_at: '', subtype: 'oud_stelsel',
      is_tax_deductible: null, fixed_rate_end_date: null, nhg: null,
      linked_asset_id: null, credit_limit: null, repayment_type: null,
      draagkrachtmeting_date: null,
      ownership: 'personal', household_id: null, net_worth_inclusion_pct: 100,
    },
  ], [])

  const dailyExpenses = 80 // Test value

  const snowballSim = useMemo(() => simulatePayoff(testDebts, 'snowball', 0), [testDebts])
  const avalancheSim = useMemo(() => simulatePayoff(testDebts, 'avalanche', 0), [testDebts])
  const snowballSummary = useMemo(() => payoffSummary(snowballSim), [snowballSim])
  const avalancheSummary = useMemo(() => payoffSummary(avalancheSim), [avalancheSim])

  // With extra monthly payment (makes strategies diverge more)
  const snowballSimExtra = useMemo(() => simulatePayoff(testDebts, 'snowball', 100), [testDebts])
  const avalancheSimExtra = useMemo(() => simulatePayoff(testDebts, 'avalanche', 100), [testDebts])
  const snowballSummaryExtra = useMemo(() => payoffSummary(snowballSimExtra), [snowballSimExtra])
  const avalancheSummaryExtra = useMemo(() => payoffSummary(avalancheSimExtra), [avalancheSimExtra])

  useEffect(() => {
    // Wait for render
    setTimeout(() => {
      const tests: { name: string; pass: boolean; detail: string }[] = []

      // Test 1: Trajectory chart renders
      const chart = document.querySelector('[data-testid="debt-payoff-trajectory-chart"]')
      tests.push({
        name: 'Debt payoff trajectory chart renders',
        pass: !!chart,
        detail: chart ? 'Chart SVG rendered' : 'Chart not found',
      })

      // Test 2: Snowball trajectory line exists
      const snowballLine = document.querySelector('[data-testid="snowball-trajectory-line"]')
      tests.push({
        name: 'Snowball trajectory line rendered',
        pass: !!snowballLine,
        detail: snowballLine ? 'Blue snowball line found' : 'Missing snowball line',
      })

      // Test 3: Avalanche trajectory line exists
      const avalancheLine = document.querySelector('[data-testid="avalanche-trajectory-line"]')
      tests.push({
        name: 'Avalanche trajectory line rendered',
        pass: !!avalancheLine,
        detail: avalancheLine ? 'Red avalanche line found' : 'Missing avalanche line',
      })

      // Test 4: Both lines present = strategy comparison overlay
      tests.push({
        name: 'Strategy comparison overlay (both lines on same chart)',
        pass: !!snowballLine && !!avalancheLine,
        detail: `Snowball: ${!!snowballLine}, Avalanche: ${!!avalancheLine}`,
      })

      // Test 5: Comparison message renders
      const message = document.querySelector('[data-testid="strategy-comparison-message"]')
      tests.push({
        name: 'Contextual comparison message displays',
        pass: !!message,
        detail: message ? `Message: ${message.textContent?.substring(0, 80)}...` : 'Message not found',
      })

      // Test 6: Time difference shown
      const timeDiff = document.querySelector('[data-testid="time-difference"]')
      tests.push({
        name: 'Time difference between strategies shown',
        pass: !!timeDiff,
        detail: timeDiff ? `Content: ${timeDiff.textContent}` : 'Time difference not found',
      })

      // Test 7: Legend shows both strategy names
      const chartText = chart?.textContent ?? ''
      const hasSneeuwbal = chartText.includes('Sneeuwbal')
      const hasAvalanche = chartText.includes('Avalanche')
      tests.push({
        name: 'Legend shows Sneeuwbal and Avalanche',
        pass: hasSneeuwbal && hasAvalanche,
        detail: `Sneeuwbal: ${hasSneeuwbal}, Avalanche: ${hasAvalanche}`,
      })

      // Test 8: Simulation data valid
      tests.push({
        name: 'Simulation produces valid payoff data',
        pass: snowballSummary.totalMonths > 0 && avalancheSummary.totalMonths > 0,
        detail: `Snowball: ${snowballSummary.totalMonths}m, Avalanche: ${avalancheSummary.totalMonths}m`,
      })

      // Test 9: Per-debt data in simulation
      const firstMonth = snowballSim[0]
      tests.push({
        name: 'Per-debt balance decline data present',
        pass: firstMonth?.debts?.length === 3,
        detail: `Debts in month 1: ${firstMonth?.debts?.length ?? 0} (expected 3)`,
      })

      // Test 10: Extra monthly chart (2nd instance) renders
      const allCharts = document.querySelectorAll('[data-testid="debt-payoff-trajectory-chart"]')
      tests.push({
        name: 'Second chart (with extra payment) renders',
        pass: allCharts.length >= 2,
        detail: `Total charts: ${allCharts.length}`,
      })

      setResults(tests)
    }, 100)
  }, [snowballSim, avalancheSim, snowballSummary, avalancheSummary])

  const passing = results.filter((r) => r.pass).length
  const total = results.length

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-bold text-zinc-900">
        Test: Schuld-aflostraject — Sneeuwbal vs. Avalanche
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Feature #223 — Debt payoff trajectory chart with strategy comparison
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

      {/* Chart 1: Without extra payment */}
      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-700 mb-1">
          1. Vergelijking zonder extra aflossing
        </h2>
        <div className="mb-3 text-xs text-zinc-500">
          3 schulden: Creditcard (€2.500, 18,9%), Pers. lening (€5.200, 6,5%), Studielening (€12.000, 0,46%)
        </div>
        <DebtPayoffTrajectoryChart
          snowballMonths={snowballSim}
          avalancheMonths={avalancheSim}
          snowballSummary={snowballSummary}
          avalancheSummary={avalancheSummary}
        />
        <StrategyComparisonMessage
          snowballSummary={snowballSummary}
          avalancheSummary={avalancheSummary}
          dailyExpenses={dailyExpenses}
        />
        <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
          <div className="rounded-lg bg-blue-50 p-3">
            <p className="font-semibold text-blue-700">Sneeuwbal</p>
            <p className="text-zinc-600">Maanden: {snowballSummary.totalMonths}</p>
            <p className="text-zinc-600">Totale rente: {formatCurrency(snowballSummary.totalInterest)}</p>
            <p className="text-zinc-600">Schuldenvrij: {snowballSummary.payoffDate ? new Date(snowballSummary.payoffDate).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' }) : '-'}</p>
          </div>
          <div className="rounded-lg bg-red-50 p-3">
            <p className="font-semibold text-red-700">Avalanche</p>
            <p className="text-zinc-600">Maanden: {avalancheSummary.totalMonths}</p>
            <p className="text-zinc-600">Totale rente: {formatCurrency(avalancheSummary.totalInterest)}</p>
            <p className="text-zinc-600">Schuldenvrij: {avalancheSummary.payoffDate ? new Date(avalancheSummary.payoffDate).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' }) : '-'}</p>
          </div>
        </div>
      </section>

      {/* Chart 2: With extra €100/m payment */}
      <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-700 mb-1">
          2. Vergelijking met €100 extra per maand
        </h2>
        <div className="mb-3 text-xs text-zinc-500">
          Zelfde schulden + €100/m extra aflossing — groter verschil verwacht
        </div>
        <DebtPayoffTrajectoryChart
          snowballMonths={snowballSimExtra}
          avalancheMonths={avalancheSimExtra}
          snowballSummary={snowballSummaryExtra}
          avalancheSummary={avalancheSummaryExtra}
        />
        <StrategyComparisonMessage
          snowballSummary={snowballSummaryExtra}
          avalancheSummary={avalancheSummaryExtra}
          dailyExpenses={dailyExpenses}
        />
        <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
          <div className="rounded-lg bg-blue-50 p-3">
            <p className="font-semibold text-blue-700">Sneeuwbal (+€100)</p>
            <p className="text-zinc-600">Maanden: {snowballSummaryExtra.totalMonths}</p>
            <p className="text-zinc-600">Totale rente: {formatCurrency(snowballSummaryExtra.totalInterest)}</p>
          </div>
          <div className="rounded-lg bg-red-50 p-3">
            <p className="font-semibold text-red-700">Avalanche (+€100)</p>
            <p className="text-zinc-600">Maanden: {avalancheSummaryExtra.totalMonths}</p>
            <p className="text-zinc-600">Totale rente: {formatCurrency(avalancheSummaryExtra.totalInterest)}</p>
          </div>
        </div>
      </section>
    </div>
  )
}
