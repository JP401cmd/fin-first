'use client'

import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { Shield } from 'lucide-react'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// ── Half-circle gauge SVG ────────────────────────────────────
function HalfGauge({ score, size: sz }: { score: number; size: number }) {
  const cx = sz / 2
  const cy = sz / 2
  const r = (sz - 12) / 2
  const strokeW = 6

  // Arc from 180° to 0° (left to right, bottom half-circle flipped to top)
  const startAngle = Math.PI        // 180°
  const endAngle   = 0              // 0°
  const totalArc   = Math.PI        // half circle = π radians

  const pct = Math.max(0, Math.min(score, 100)) / 100
  const sweepAngle = startAngle - totalArc * pct

  // Background arc (full half-circle)
  const bgX1 = cx + r * Math.cos(startAngle)
  const bgY1 = cy - r * Math.sin(startAngle)
  const bgX2 = cx + r * Math.cos(endAngle)
  const bgY2 = cy - r * Math.sin(endAngle)
  const bgPath = `M ${bgX1} ${bgY1} A ${r} ${r} 0 0 1 ${bgX2} ${bgY2}`

  // Value arc
  const valX1 = bgX1
  const valY1 = bgY1
  const valX2 = cx + r * Math.cos(sweepAngle)
  const valY2 = cy - r * Math.sin(sweepAngle)
  const largeArc = pct > 0.5 ? 1 : 0
  const valPath = `M ${valX1} ${valY1} A ${r} ${r} 0 ${largeArc} 1 ${valX2} ${valY2}`

  const arcColor = score >= 70 ? '#059669' : score >= 40 ? '#d97706' : '#dc2626'

  return (
    <svg width={sz} height={sz / 2 + 4} viewBox={`0 0 ${sz} ${sz / 2 + 4}`} className="mx-auto">
      <path d={bgPath} fill="none" stroke="var(--border-ed)" strokeWidth={strokeW} strokeLinecap="round" />
      {pct > 0 && (
        <path d={valPath} fill="none" stroke={arcColor} strokeWidth={strokeW} strokeLinecap="round" />
      )}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        dominantBaseline="auto"
        className="font-mono text-lg font-bold tabular-nums"
        fill={arcColor}
      >
        {score}
      </text>
    </svg>
  )
}

// ── Sub-factor mini row ──────────────────────────────────────
function SubFactorRow({ label, value, pct }: { label: string; value: string; pct: number }) {
  const clamp = Math.max(0, Math.min(pct, 100))
  const barColor = clamp >= 70 ? 'bg-emerald-400' : clamp >= 40 ? 'bg-amber-400' : 'bg-red-400'

  return (
    <div className="flex items-center gap-2">
      <span className="w-[72px] shrink-0 text-[10px] text-[var(--ink-3)] truncate">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-[var(--subtle)] overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${clamp}%` }} />
      </div>
      <span className="w-[44px] shrink-0 text-right font-mono text-[10px] tabular-nums text-[var(--ink-2)]">{value}</span>
    </div>
  )
}

export function VeerkrachtScoreWidget({ size, data, href }: Props) {
  const { monthsCovered, totalAssets, totalDebts, monthSummary } = data
  const savingsRate = monthSummary.savingsRate

  // Score: 0-100 based on months covered (6 months = ~50, 12 months = ~80)
  const score = Math.min(Math.round((monthsCovered / 24) * 100), 100)
  const scoreColor = score >= 70 ? 'text-emerald-600' : score >= 40 ? 'text-horizon-600' : 'text-red-600'

  // Sub-factor calculations
  const bufferPct = Math.min(Math.round((monthsCovered / 12) * 100), 100)   // 12 months = 100%
  const debtRatio = totalAssets > 0 ? Math.round((totalDebts / totalAssets) * 100) : (totalDebts > 0 ? 100 : 0)
  const debtHealthPct = Math.max(0, 100 - debtRatio) // Lower debt ratio = better
  const incomeCoveragePct = Math.min(Math.round(savingsRate * (100 / 30)), 100) // 30% savings rate = 100%

  // ── Quarter ────────────────────────────────────────────────
  if (size === 'quarter') {
    return (
      <WidgetShell module="horizon" size={size} kicker="Veerkracht Score" href={href}>
        <Shield className="h-4 w-4 text-horizon-500" />
        <div className="mt-1 flex items-baseline gap-0.5">
          <p className={`font-mono text-lg font-semibold tabular-nums leading-none ${scoreColor}`}>
            {score}
          </p>
          <span className="text-sm text-[var(--ink-3)]">/100</span>
        </div>
      </WidgetShell>
    )
  }

  // ── Half ───────────────────────────────────────────────────
  if (size === 'half') {
    return (
      <WidgetShell module="horizon" size={size} kicker="Veerkracht Score" href={href}>
        <HalfGauge score={score} size={120} />

        <div className="mt-2 space-y-1.5">
          <SubFactorRow
            label="Buffer"
            value={`${monthsCovered.toFixed(1)} mnd`}
            pct={bufferPct}
          />
          <SubFactorRow
            label="Schuldratio"
            value={`${debtRatio}%`}
            pct={debtHealthPct}
          />
          <SubFactorRow
            label="Inkomensdekking"
            value={`${Math.round(savingsRate)}%`}
            pct={incomeCoveragePct}
          />
        </div>

        <p className="mt-2 text-[10px] text-[var(--ink-3)]">
          Gebaseerd op {monthsCovered.toFixed(1)} maanden buffer
        </p>
      </WidgetShell>
    )
  }

  // ── Full (default) ─────────────────────────────────────────
  return (
    <WidgetShell module="horizon" size={size} kicker="Veerkracht Score" href={href}>
      <HalfGauge score={score} size={160} />

      <div className="mt-3 space-y-2">
        <SubFactorRow
          label="Buffer"
          value={`${monthsCovered.toFixed(1)} mnd`}
          pct={bufferPct}
        />
        <SubFactorRow
          label="Schuldratio"
          value={`${debtRatio}%`}
          pct={debtHealthPct}
        />
        <SubFactorRow
          label="Inkomensdekking"
          value={`${Math.round(savingsRate)}%`}
          pct={incomeCoveragePct}
        />
      </div>

      <p className="mt-3 text-xs text-[var(--ink-3)]">
        Gebaseerd op {monthsCovered.toFixed(1)} maanden buffer
      </p>
    </WidgetShell>
  )
}
