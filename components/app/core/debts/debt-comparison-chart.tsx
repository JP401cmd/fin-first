'use client'

import { memo } from 'react'
import { simulatePayoff, payoffSummary } from '@/lib/debt-data'
import { formatCurrency } from '@/components/app/budget-shared'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

export const DebtPayoffTrajectoryChart = memo(function DebtPayoffTrajectoryChart({
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
  const { ref, hasEntered } = useInViewAnimation({ duration: 700 })
  if (snowballMonths.length === 0 && avalancheMonths.length === 0) return null

  const w = 800
  const h = 240
  const pad = { top: 16, right: 24, bottom: 40, left: 60 }
  const chartW = w - pad.left - pad.right
  const chartH = h - pad.top - pad.bottom

  // Determine axis bounds from both simulations
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

  // Sample points for each strategy (max ~80 each for performance)
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

  // Per-debt breakdown lines for snowball strategy
  const debtIds = snowballMonths[0]?.debts.map(d => d.id) ?? []
  const debtNames = snowballMonths[0]?.debts.map(d => d.name) ?? []
  const perDebtColors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899']

  const perDebtPaths: { id: string; name: string; snowballPath: string; avalanchePath: string; color: string }[] = []
  for (let di = 0; di < debtIds.length; di++) {
    const id = debtIds[di]
    const color = perDebtColors[di % perDebtColors.length]

    const snowSampled = snowballMonths.filter((_, i) => i % sampleStep === 0 || i === snowballMonths.length - 1)
    const avSampled = avalancheMonths.filter((_, i) => i % sampleStep === 0 || i === avalancheMonths.length - 1)

    const sPath = snowSampled
      .map((m, i) => {
        const entry = m.debts.find(d => d.id === id)
        return `${i === 0 ? 'M' : 'L'} ${x(m.month).toFixed(1)},${y(entry?.balance ?? 0).toFixed(1)}`
      })
      .join(' ')

    const aPath = avSampled
      .map((m, i) => {
        const entry = m.debts.find(d => d.id === id)
        return `${i === 0 ? 'M' : 'L'} ${x(m.month).toFixed(1)},${y(entry?.balance ?? 0).toFixed(1)}`
      })
      .join(' ')

    perDebtPaths.push({
      id,
      name: debtNames[di],
      snowballPath: sPath,
      avalanchePath: aPath,
      color,
    })
  }

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxBalance * t))

  // X-axis: every 12 months
  const xTicks: number[] = []
  for (let m = 12; m < maxMonth; m += 12) xTicks.push(m)
  if (maxMonth > 6) xTicks.push(maxMonth)

  // Payoff month markers
  const snowballPayoffMonth = snowballMonths.length
  const avalanchePayoffMonth = avalancheMonths.length

  return (
    <div ref={ref} data-testid="debt-payoff-trajectory-chart">
      <p className="mb-2 text-xs font-semibold text-[var(--ink-3)] uppercase">Schuld-trajectvergelijking</p>
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

        {/* Grid lines */}
        {yTicks.map((val) => (
          <g key={val}>
            <line
              x1={pad.left} y1={y(val)} x2={w - pad.right} y2={y(val)}
              stroke="#e4e4e7" strokeWidth="0.5"
            />
            <text x={pad.left - 8} y={y(val) + 3} textAnchor="end" fontSize="8" fill="#a1a1aa">
              {val >= 1000 ? `€${Math.round(val / 1000)}k` : `€${val}`}
            </text>
          </g>
        ))}

        {/* Fill areas */}
        <path d={snowballFill} fill="url(#snowball-fill-grad)"
          style={{ animation: hasEntered ? 'fadeInFill 250ms ease-out 455ms both' : 'none', opacity: hasEntered ? undefined : 0 }} />
        <path d={avalancheFill} fill="url(#avalanche-fill-grad)"
          style={{ animation: hasEntered ? 'fadeInFill 250ms ease-out 455ms both' : 'none', opacity: hasEntered ? undefined : 0 }} />

        {/* Per-debt lines (thin, for additional detail) */}
        {perDebtPaths.map((dp) => (
          <g key={dp.id}>
            <path
              d={dp.snowballPath}
              fill="none"
              stroke={dp.color}
              strokeWidth="0.75"
              strokeOpacity="0.3"
              strokeLinecap="round"
            />
            <path
              d={dp.avalanchePath}
              fill="none"
              stroke={dp.color}
              strokeWidth="0.75"
              strokeOpacity="0.3"
              strokeDasharray="3,2"
              strokeLinecap="round"
            />
          </g>
        ))}

        {/* Snowball total line (solid blue) */}
        <path
          d={snowballPath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          style={{ strokeDashoffset: hasEntered ? undefined : 1, animation: hasEntered ? 'drawPath 700ms cubic-bezier(.22,1,.36,1) both' : 'none' }}
          data-testid="snowball-trajectory-line"
        />

        {/* Avalanche total line (solid red) */}
        <path
          d={avalanchePath}
          fill="none"
          stroke="#ef4444"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          style={{ strokeDashoffset: hasEntered ? undefined : 1, animation: hasEntered ? 'drawPath 700ms cubic-bezier(.22,1,.36,1) 80ms both' : 'none' }}
          data-testid="avalanche-trajectory-line"
        />

        {/* Snowball payoff marker */}
        {snowballPayoffMonth < maxMonth && (
          <>
            <line
              x1={x(snowballPayoffMonth)} y1={pad.top}
              x2={x(snowballPayoffMonth)} y2={pad.top + chartH}
              stroke="#3b82f6" strokeWidth="1" strokeDasharray="4,3" strokeOpacity="0.5"
            />
            <circle
              cx={x(snowballPayoffMonth)} cy={y(0)}
              r="4" fill="#3b82f6" stroke="white" strokeWidth="1.5"
            />
          </>
        )}

        {/* Avalanche payoff marker */}
        {avalanchePayoffMonth < maxMonth && (
          <>
            <line
              x1={x(avalanchePayoffMonth)} y1={pad.top}
              x2={x(avalanchePayoffMonth)} y2={pad.top + chartH}
              stroke="#ef4444" strokeWidth="1" strokeDasharray="4,3" strokeOpacity="0.5"
            />
            <circle
              cx={x(avalanchePayoffMonth)} cy={y(0)}
              r="4" fill="#ef4444" stroke="white" strokeWidth="1.5"
            />
          </>
        )}

        {/* X-axis labels */}
        {xTicks.map((m) => (
          <text key={m} x={x(m)} y={h - 18} textAnchor="middle" fontSize="8" fill="#a1a1aa">
            {m >= 12 ? `${Math.floor(m / 12)}j` : `${m}m`}
          </text>
        ))}

        {/* Legend */}
        <g transform={`translate(${pad.left}, ${h - 8})`}>
          <line x1="0" y1="0" x2="16" y2="0" stroke="#3b82f6" strokeWidth="2.5" />
          <text x="20" y="3" fontSize="8" fill="#71717a">Sneeuwbal</text>
          <line x1="110" y1="0" x2="126" y2="0" stroke="#ef4444" strokeWidth="2.5" />
          <text x="130" y="3" fontSize="8" fill="#71717a">Avalanche</text>
        </g>
      </svg>
    </div>
  )
})

export const StrategyComparisonMessage = memo(function StrategyComparisonMessage({
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

  // Determine which strategy wins on time and on interest
  const avalancheFaster = avMonths < snowMonths
  const avalancheCheaper = avInterest < snowInterest
  const sameTime = monthDiff === 0
  const sameInterest = interestDiff < 1

  let message = ''
  let bgClass = ''
  let textClass = ''

  if (sameTime && sameInterest) {
    message = 'Beide strategieën leiden tot hetzelfde resultaat voor jouw schulden.'
    bgClass = 'border-[var(--border-ed)] bg-[var(--subtle)]'
    textClass = 'text-[var(--ink-2)]'
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

  // Add freedom-time context if dailyExpenses available
  let freedomNote = ''
  if (dailyExpenses > 0 && interestDiff > 100) {
    const savedDays = Math.round(interestDiff / dailyExpenses)
    if (savedDays > 0) {
      freedomNote = ` Dat is ${savedDays} ${savedDays === 1 ? 'dag' : 'dagen'} aan extra vrijheid.`
    }
  }

  return (
    <div
      className={`mt-3 rounded-[var(--r-lg)] border p-3 text-center ${bgClass}`}
      data-testid="strategy-comparison-message"
    >
      <p className={`text-sm font-medium ${textClass}`} data-testid="strategy-comparison-text">
        {message}
        {freedomNote && <span className="font-normal text-kern-600">{freedomNote}</span>}
      </p>
      {!sameTime && (
        <div className="mt-2 flex items-center justify-center gap-6 text-xs text-[var(--ink-3)]">
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
})
