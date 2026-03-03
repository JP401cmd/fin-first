'use client'

import type { Debt } from '@/lib/debt-data'
import { simulatePayoff } from '@/lib/debt-data'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

export function PayoffChart({ months, debts }: { months: ReturnType<typeof simulatePayoff>; debts: Debt[] }) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 500 })
  if (months.length === 0) return null

  const w = 800
  const h = 200
  const pad = { top: 10, right: 20, bottom: 30, left: 60 }
  const chartW = w - pad.left - pad.right
  const chartH = h - pad.top - pad.bottom

  const maxBalance = months[0].totalBalance
  const maxMonth = months.length

  // Sample points (max 80 to keep SVG light)
  const step = Math.max(1, Math.floor(maxMonth / 80))
  const sampled = months.filter((_, i) => i % step === 0 || i === months.length - 1)

  function x(month: number) {
    return pad.left + (month / maxMonth) * chartW
  }
  function y(val: number) {
    return pad.top + chartH - (val / maxBalance) * chartH
  }

  // Stacked areas per debt
  const debtColors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899']
  const debtIds = debts.map((d) => d.id)

  // Build paths per debt (stacked)
  const areas: { id: string; path: string; color: string }[] = []
  for (let di = 0; di < debtIds.length; di++) {
    const id = debtIds[di]
    const color = debtColors[di % debtColors.length]

    const topPoints = sampled.map((m) => {
      let stackedVal = 0
      for (let j = 0; j <= di; j++) {
        const entry = m.debts.find((d) => d.id === debtIds[j])
        stackedVal += entry?.balance ?? 0
      }
      return `${x(m.month).toFixed(1)},${y(stackedVal).toFixed(1)}`
    })

    const bottomPoints = sampled.map((m) => {
      let stackedVal = 0
      for (let j = 0; j < di; j++) {
        const entry = m.debts.find((d) => d.id === debtIds[j])
        stackedVal += entry?.balance ?? 0
      }
      return `${x(m.month).toFixed(1)},${y(stackedVal).toFixed(1)}`
    })

    const path = `M ${topPoints.join(' L ')} L ${bottomPoints.reverse().join(' L ')} Z`
    areas.push({ id, path, color })
  }

  // Y-axis labels
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxBalance * t))

  // X-axis: every 12 months
  const xTicks: number[] = []
  for (let m = 12; m < maxMonth; m += 12) xTicks.push(m)
  if (maxMonth > 6) xTicks.push(maxMonth)

  return (
    <div ref={ref}>
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" preserveAspectRatio="xMidYMid meet"
      style={{ opacity: hasEntered ? undefined : 0, animation: hasEntered ? 'fadeInFill 500ms ease-out both' : 'none' }}>
      {/* Grid lines */}
      {yTicks.map((val) => (
        <g key={val}>
          <line
            x1={pad.left} y1={y(val)} x2={w - pad.right} y2={y(val)}
            stroke="#e4e4e7" strokeWidth="0.5"
          />
          <text x={pad.left - 8} y={y(val) + 3} textAnchor="end" fontSize="8" fill="#a1a1aa">
            {val >= 1000 ? `${Math.round(val / 1000)}k` : val}
          </text>
        </g>
      ))}

      {/* Areas (reversed so first debt on top) */}
      {areas.reverse().map((a) => (
        <path key={a.id} d={a.path} fill={a.color} fillOpacity="0.5" />
      ))}

      {/* X-axis labels */}
      {xTicks.map((m) => (
        <text key={m} x={x(m)} y={h - 5} textAnchor="middle" fontSize="8" fill="#a1a1aa">
          {m >= 12 ? `${Math.floor(m / 12)}j` : `${m}m`}
        </text>
      ))}

      {/* Legend */}
      {debts.map((d, i) => (
        <g key={d.id} transform={`translate(${pad.left + i * 130}, ${h - 16})`}>
          <rect width="8" height="8" rx="2" fill={debtColors[i % debtColors.length]} fillOpacity="0.7" />
          <text x="12" y="7" fontSize="7" fill="#71717a">{d.name}</text>
        </g>
      ))}
    </svg>
    </div>
  )
}
