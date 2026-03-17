'use client'

import { memo } from 'react'
import type { Debt } from '@/lib/debt-data'
import { amortizationSchedule, linearAmortization, interestOnlySchedule } from '@/lib/debt-data'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { Valuation } from './debt-types'

export const DebtTrajectoryChart = memo(function DebtTrajectoryChart({
  debt,
  valuations,
}: {
  debt: Debt
  valuations: Valuation[] | undefined
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 750 })
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
      // Interest-only: balance stays flat
      let months = 120 // 10 years default
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
      // Annuity (default)
      const monthlyInterest = balance * (rate / 100 / 12)
      if (payment > monthlyInterest) {
        schedule = amortizationSchedule(balance, rate, payment, today)
      }
    }

    // Sample projected points (max ~50 for SVG performance)
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

  // Build SVG path for actual line
  const actualPath = actualPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(p.date).toFixed(1)},${yPos(p.value).toFixed(1)}`)
    .join(' ')

  // Build SVG path for projected line
  const projectedPath = projectedPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(p.date).toFixed(1)},${yPos(p.value).toFixed(1)}`)
    .join(' ')

  // Build fill area for actual (gradient fill below line)
  const actualFill = actualPath
    + ` L ${xPos(actualPoints[actualPoints.length - 1].date).toFixed(1)},${(pad.top + chartH).toFixed(1)}`
    + ` L ${xPos(actualPoints[0].date).toFixed(1)},${(pad.top + chartH).toFixed(1)} Z`

  // Build fill area for projected
  const projectedFill = projectedPath
    + ` L ${xPos(projectedPoints[projectedPoints.length - 1].date).toFixed(1)},${(pad.top + chartH).toFixed(1)}`
    + ` L ${xPos(projectedPoints[0].date).toFixed(1)},${(pad.top + chartH).toFixed(1)} Z`

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxValue * t))

  // X-axis labels: show years
  const xLabels: { date: Date; label: string }[] = []
  const startYear = minDate.getFullYear()
  const endYear = maxDate.getFullYear()
  for (let yr = startYear; yr <= endYear + 1; yr++) {
    const d = new Date(yr, 0, 1)
    if (d >= minDate && d <= maxDate) {
      xLabels.push({ date: d, label: String(yr) })
    }
  }
  // Ensure at most 8 labels for readability
  const labelStep = Math.max(1, Math.ceil(xLabels.length / 8))
  const filteredLabels = xLabels.filter((_, i) => i % labelStep === 0)

  // Transition point (where actual meets projected)
  const transitionX = xPos(today)
  const transitionY = yPos(balance)

  return (
    <div ref={ref} data-testid="debt-trajectory-chart">
      <p className="mb-2 text-xs font-semibold text-[var(--ink-3)] uppercase">Schuldverloop</p>
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

        {/* Grid lines */}
        {yTicks.map((val) => (
          <g key={val}>
            <line
              x1={pad.left} y1={yPos(val)} x2={w - pad.right} y2={yPos(val)}
              stroke="#e4e4e7" strokeWidth="0.5"
            />
            <text x={pad.left - 8} y={yPos(val) + 3} textAnchor="end" fontSize="8" fill="#a1a1aa">
              {val >= 1000 ? `${Math.round(val / 1000)}k` : val}
            </text>
          </g>
        ))}

        {/* Transition line (today - vertical dashed line) */}
        <line
          x1={transitionX} y1={pad.top}
          x2={transitionX} y2={pad.top + chartH}
          stroke="#a1a1aa" strokeWidth="0.75" strokeDasharray="3,3"
        />
        <text
          x={transitionX} y={pad.top - 4}
          textAnchor="middle" fontSize="7" fill="#71717a"
        >
          vandaag
        </text>

        {/* Actual balance fill area */}
        <path d={actualFill} fill={`url(#actual-fill-${debt.id})`}
          style={{ animation: hasEntered ? 'fadeInFill 250ms ease-out 455ms both' : 'none', opacity: hasEntered ? undefined : 0 }} />

        {/* Projected balance fill area */}
        <path d={projectedFill} fill={`url(#projected-fill-${debt.id})`}
          style={{ animation: hasEntered ? 'fadeInFill 250ms ease-out 535ms both' : 'none', opacity: hasEntered ? undefined : 0 }} />

        {/* Actual balance line (solid blue) */}
        <path
          d={actualPath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          style={{ strokeDashoffset: hasEntered ? undefined : 1, animation: hasEntered ? 'drawPath 700ms cubic-bezier(.22,1,.36,1) both' : 'none' }}
          data-testid="actual-balance-line"
        />

        {/* Projected balance line (dashed amber) */}
        <path
          d={projectedPath}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2"
          strokeDasharray="6,3"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          style={{ strokeDashoffset: hasEntered ? undefined : 1, animation: hasEntered ? 'drawPath 700ms cubic-bezier(.22,1,.36,1) 80ms both' : 'none' }}
          data-testid="projected-balance-line"
        />

        {/* Actual data points (small dots) */}
        {actualPoints.map((p, i) => (
          <circle
            key={`actual-${i}`}
            cx={xPos(p.date)}
            cy={yPos(p.value)}
            r="2.5"
            fill="#3b82f6"
            stroke="white"
            strokeWidth="1"
          />
        ))}

        {/* Transition point (larger dot) */}
        <circle
          cx={transitionX}
          cy={transitionY}
          r="4"
          fill="#f59e0b"
          stroke="white"
          strokeWidth="1.5"
          data-testid="transition-point"
        />

        {/* X-axis labels */}
        {filteredLabels.map((xl) => (
          <text
            key={xl.label}
            x={xPos(xl.date)}
            y={h - 8}
            textAnchor="middle"
            fontSize="8"
            fill="#a1a1aa"
          >
            {xl.label}
          </text>
        ))}

        {/* Legend */}
        <g transform={`translate(${pad.left}, ${h - 12})`}>
          <line x1="0" y1="0" x2="12" y2="0" stroke="#3b82f6" strokeWidth="2" />
          <text x="16" y="3" fontSize="7" fill="#71717a">Werkelijk</text>
          <line x1="80" y1="0" x2="92" y2="0" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4,2" />
          <text x="96" y="3" fontSize="7" fill="#71717a">Verwacht</text>
        </g>
      </svg>
    </div>
  )
})
