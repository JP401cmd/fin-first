'use client'

import { memo } from 'react'
import type { Valuation } from './debt-types'

export const DebtMiniSparkline = memo(function DebtMiniSparkline({
  debtId,
  valuations,
  currentBalance,
}: {
  debtId: string
  valuations: Valuation[] | undefined
  currentBalance: number
}) {
  // Need at least 2 data points to draw a sparkline
  if (!valuations || valuations.length < 2) return null

  const W = 64
  const H = 24
  const PAD = 2

  // Values sorted ascending by date
  const sorted = [...valuations].sort(
    (a, b) => new Date(a.valuation_date).getTime() - new Date(b.valuation_date).getTime()
  )
  const values = sorted.map(v => Number(v.value))

  // Add current balance as most recent point if different from last valuation
  const lastVal = values[values.length - 1]
  if (Math.abs(lastVal - currentBalance) > 0.01) {
    values.push(currentBalance)
  }

  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const points = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (W - PAD * 2)
    const y = H - PAD - ((v - min) / range) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  // For debts: going DOWN is good (green), going UP is bad (red)
  const trend = values[values.length - 1] <= values[0]
  const strokeColor = trend ? '#059669' : '#dc2626' // emerald-600 or red-600

  // Create gradient fill
  const fillPoints = [
    `${PAD},${H - PAD}`,
    ...points,
    `${(PAD + ((values.length - 1) / (values.length - 1)) * (W - PAD * 2)).toFixed(1)},${H - PAD}`,
  ]

  return (
    <div className="shrink-0 hidden sm:block" data-testid={`debt-sparkline-${debtId}`}>
      <svg viewBox={`0 0 ${W} ${H}`} width={64} height={24} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`debtSparkFill-${debtId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.2" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon
          points={fillPoints.join(' ')}
          fill={`url(#debtSparkFill-${debtId})`}
        />
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Last point dot */}
        {(() => {
          const lastIdx = values.length - 1
          const x = PAD + (lastIdx / (values.length - 1)) * (W - PAD * 2)
          const y = H - PAD - ((values[lastIdx] - min) / range) * (H - PAD * 2)
          return <circle cx={x} cy={y} r="2" fill={strokeColor} />
        })()}
      </svg>
    </div>
  )
})
