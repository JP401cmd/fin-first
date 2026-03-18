'use client'

import { memo, useState } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { Activity, TrendingUp, TrendingDown, Minus, ChevronRight, Lightbulb } from 'lucide-react'
import type { DashboardData } from './widget-renderer'
import { computeHealthScore, type HealthPillar } from '@/lib/financial-health'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// ── Color helpers ────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return '#059669'   // emerald-600
  if (score >= 60) return '#0d9488'   // teal-600
  if (score >= 40) return '#d97706'   // amber-600
  return '#dc2626'                     // red-600
}

function scoreColorClass(score: number): string {
  if (score >= 80) return 'text-emerald-600'
  if (score >= 60) return 'text-teal-600'
  if (score >= 40) return 'text-amber-600'
  return 'text-red-600'
}

function barColorClass(score: number): string {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-teal-500'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

// ── Half-circle gauge SVG ────────────────────────────────────

function HealthGauge({ score, sz }: { score: number; sz: number }) {
  const cx = sz / 2
  const cy = sz / 2
  const r = (sz - 12) / 2
  const strokeW = 6

  const startAngle = Math.PI
  const totalArc = Math.PI

  const pct = Math.max(0, Math.min(score, 100)) / 100
  const sweepAngle = startAngle - totalArc * pct

  const bgX1 = cx + r * Math.cos(startAngle)
  const bgY1 = cy - r * Math.sin(startAngle)
  const bgX2 = cx + r * Math.cos(0)
  const bgY2 = cy - r * Math.sin(0)
  const bgPath = `M ${bgX1} ${bgY1} A ${r} ${r} 0 0 1 ${bgX2} ${bgY2}`

  const valX2 = cx + r * Math.cos(sweepAngle)
  const valY2 = cy - r * Math.sin(sweepAngle)
  const largeArc = pct > 0.5 ? 1 : 0
  const valPath = `M ${bgX1} ${bgY1} A ${r} ${r} 0 ${largeArc} 1 ${valX2} ${valY2}`

  const color = scoreColor(score)

  return (
    <svg width={sz} height={sz / 2 + 4} viewBox={`0 0 ${sz} ${sz / 2 + 4}`} className="mx-auto">
      <path d={bgPath} fill="none" stroke="var(--border-ed)" strokeWidth={strokeW} strokeLinecap="round" />
      {pct > 0 && (
        <path d={valPath} fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
      )}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        dominantBaseline="auto"
        className="font-mono text-lg font-bold tabular-nums"
        fill={color}
      >
        {score}
      </text>
    </svg>
  )
}

// ── Radar / Spider chart for 6 pillars ───────────────────────

function RadarChart({ pillars, sz }: { pillars: HealthPillar[]; sz: number }) {
  const cx = sz / 2
  const cy = sz / 2
  const maxR = (sz - 20) / 2
  const n = pillars.length

  // Background rings at 25%, 50%, 75%, 100%
  const rings = [0.25, 0.5, 0.75, 1.0]

  // Angle per pillar (start at top = -π/2)
  const angleStep = (2 * Math.PI) / n
  const startOffset = -Math.PI / 2

  function polarToCart(angle: number, radius: number) {
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    }
  }

  // Data polygon
  const dataPoints = pillars.map((p, i) => {
    const angle = startOffset + i * angleStep
    const r = (p.score / 100) * maxR
    return polarToCart(angle, r)
  })
  const dataPath = dataPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ') + ' Z'

  // Short labels
  const shortLabels = ['Spaar', 'Schuld', 'Nood', 'FIRE', 'Divers.', 'Budget']

  return (
    <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`}>
      {/* Background rings */}
      {rings.map(pct => {
        const r = pct * maxR
        const pts = Array.from({ length: n }, (_, i) => {
          const angle = startOffset + i * angleStep
          const p = polarToCart(angle, r)
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
        }).join(' ')
        return (
          <polygon
            key={pct}
            points={pts}
            fill="none"
            stroke="var(--border-ed)"
            strokeWidth={0.5}
            opacity={0.6}
          />
        )
      })}

      {/* Axis lines */}
      {pillars.map((_, i) => {
        const angle = startOffset + i * angleStep
        const end = polarToCart(angle, maxR)
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={end.x}
            y2={end.y}
            stroke="var(--border-ed)"
            strokeWidth={0.5}
            opacity={0.4}
          />
        )
      })}

      {/* Data polygon */}
      <path
        d={dataPath}
        fill="var(--horizon-500)"
        fillOpacity={0.15}
        stroke="var(--horizon-500)"
        strokeWidth={1.5}
      />

      {/* Data dots */}
      {dataPoints.map((pt, i) => (
        <circle
          key={i}
          cx={pt.x}
          cy={pt.y}
          r={2.5}
          fill="var(--horizon-500)"
        />
      ))}

      {/* Labels */}
      {pillars.map((_, i) => {
        const angle = startOffset + i * angleStep
        const labelR = maxR + 10
        const pos = polarToCart(angle, labelR)
        const anchor = pos.x < cx - 2 ? 'end' : pos.x > cx + 2 ? 'start' : 'middle'
        return (
          <text
            key={i}
            x={pos.x}
            y={pos.y}
            textAnchor={anchor}
            dominantBaseline="central"
            className="text-[8px] fill-[var(--ink-3)]"
          >
            {shortLabels[i]}
          </text>
        )
      })}
    </svg>
  )
}

// ── Pillar bar row (compact) ─────────────────────────────────

function PillarRow({ pillar }: { pillar: HealthPillar }) {
  const clamp = Math.max(0, Math.min(pillar.score, 100))

  return (
    <div className="flex items-center gap-2">
      <span className="w-[72px] shrink-0 text-[10px] text-[var(--ink-3)] truncate">{pillar.name}</span>
      <div className="flex-1 h-1.5 rounded-full bg-[var(--subtle)] overflow-hidden">
        <div className={`h-full rounded-full ${barColorClass(clamp)}`} style={{ width: `${clamp}%` }} />
      </div>
      <span className="w-[32px] shrink-0 text-right font-mono text-[10px] tabular-nums text-[var(--ink-2)]">{pillar.score}</span>
    </div>
  )
}

// ── Trend indicator ──────────────────────────────────────────

function TrendBadge({ trend }: { trend: number }) {
  if (trend > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600">
        <TrendingUp className="h-3 w-3" /> +{trend}
      </span>
    )
  }
  if (trend < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-600">
        <TrendingDown className="h-3 w-3" /> {trend}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--ink-3)]">
      <Minus className="h-3 w-3" /> Stabiel
    </span>
  )
}

// ── Kassabon BottomSheet content ──────────────────────────────

function HealthKassabon({ health }: { health: ReturnType<typeof computeHealthScore> }) {
  // Sort pillars: weakest first for improvement focus
  const sorted = [...health.pillars].sort((a, b) => a.score - b.score)

  return (
    <div className="space-y-4">
      {/* Total score header */}
      <KassabonShell>
        <div className="flex items-center justify-between border-b border-dashed border-[var(--border-md)] pb-2 mb-2">
          <span className="text-xs text-[var(--ink-3)]">FINANCIËLE GEZONDHEID</span>
          <span className={`font-mono text-lg font-bold tabular-nums ${scoreColorClass(health.total)}`}>
            {health.total}/100
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--ink-3)]">Beoordeling</span>
          <span className={`font-medium ${scoreColorClass(health.total)}`}>{health.label}</span>
        </div>
        {health.previousMonth !== null && (
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-[var(--ink-3)]">Vorige maand</span>
            <span className="font-mono tabular-nums text-[var(--ink-2)]">{health.previousMonth}/100</span>
          </div>
        )}
        {health.trend !== 0 && (
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-[var(--ink-3)]">Verandering</span>
            <TrendBadge trend={health.trend} />
          </div>
        )}
        <div className="border-t border-dashed border-[var(--border-md)] mt-2 pt-2 text-[10px] text-[var(--ink-3)]">
          Score = gewogen gemiddelde van 6 pilaren
        </div>
      </KassabonShell>

      {/* Per-pillar breakdown */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-[var(--ink-2)]">Pilaren (zwakste eerst)</h3>
        {sorted.map(pillar => (
          <div
            key={pillar.id}
            className="rounded-[var(--r-sm)] border border-[var(--border-ed)] p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--ink)]">{pillar.name}</span>
              <span className={`font-mono text-sm font-semibold tabular-nums ${scoreColorClass(pillar.score)}`}>
                {pillar.score}/100
              </span>
            </div>
            <p className="mt-1 text-[11px] text-[var(--ink-3)]">{pillar.explanation}</p>
            <div className="mt-1.5 flex items-center justify-between text-[10px]">
              <span className="text-[var(--ink-3)]">Waarde</span>
              <span className="font-mono tabular-nums text-[var(--ink-2)]">{pillar.rawValue}</span>
            </div>
            {/* Progress bar */}
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--subtle)] overflow-hidden">
              <div
                className={`h-full rounded-full ${barColorClass(pillar.score)}`}
                style={{ width: `${pillar.score}%` }}
              />
            </div>
            {/* Improvement tip */}
            <div className="mt-2 flex items-start gap-1.5">
              <Lightbulb className="h-3 w-3 text-horizon-500 mt-0.5 shrink-0" />
              <p className="text-[10px] text-[var(--ink-2)] leading-snug">{pillar.improvementTip}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Weighting explanation */}
      <div className="rounded-[var(--r-sm)] bg-[var(--subtle)] p-3">
        <h4 className="text-[10px] font-semibold text-[var(--ink-2)] mb-1.5">Weging</h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {health.pillars.map(p => (
            <div key={p.id} className="flex items-center justify-between text-[10px]">
              <span className="text-[var(--ink-3)]">{p.name}</span>
              <span className="font-mono tabular-nums text-[var(--ink-2)]">{Math.round(p.weight * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main Widget ──────────────────────────────────────────────

export const GezondheidScoreWidget = memo(function GezondheidScoreWidget({ size, data, href }: Props) {
  const [showKassabon, setShowKassabon] = useState(false)
  const health = computeHealthScore(data)
  const color = scoreColorClass(health.total)

  // ── Mini ─────────────────────────────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="horizon" size="mini" kicker="Gezondheid" href={href}>
        <p className={`font-mono text-[15px] font-semibold tabular-nums leading-none truncate ${color}`}>
          {health.total}
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter ────────────────────────────────────────────────
  if (size === 'quarter') {
    return (
      <WidgetShell module="horizon" size={size} kicker="Gezondheid" onClick={() => setShowKassabon(true)}>
        <Activity className="h-4 w-4 text-horizon-500" />
        <div className="mt-1 flex items-baseline gap-0.5">
          <p className={`font-mono text-lg font-semibold tabular-nums leading-none ${color}`}>
            {health.total}
          </p>
          <span className="text-sm text-[var(--ink-3)]">/100</span>
        </div>
        {health.trend !== 0 && (
          <div className="mt-1">
            <TrendBadge trend={health.trend} />
          </div>
        )}
        <BottomSheet open={showKassabon} onClose={() => setShowKassabon(false)} title="Financiële Gezondheid">
          <HealthKassabon health={health} />
        </BottomSheet>
      </WidgetShell>
    )
  }

  // ── Half ─────────────────────────────────────────────────
  if (size === 'half') {
    return (
      <WidgetShell module="horizon" size={size} kicker="Gezondheid" onClick={() => setShowKassabon(true)}>
        <div className="flex items-start gap-3">
          <HealthGauge score={health.total} sz={90} />
          <div className="flex-1 min-w-0 space-y-1">
            {health.pillars.slice(0, 3).map(p => (
              <PillarRow key={p.id} pillar={p} />
            ))}
            <div className="flex items-center justify-between pt-0.5">
              <TrendBadge trend={health.trend} />
              <span className="text-[9px] text-[var(--ink-4)] flex items-center gap-0.5">
                Details <ChevronRight className="h-2.5 w-2.5" />
              </span>
            </div>
          </div>
        </div>
        <BottomSheet open={showKassabon} onClose={() => setShowKassabon(false)} title="Financiële Gezondheid">
          <HealthKassabon health={health} />
        </BottomSheet>
      </WidgetShell>
    )
  }

  // ── Full ─────────────────────────────────────────────────
  // Sort pillars weakest first for tips
  const weakest = [...health.pillars].sort((a, b) => a.score - b.score)
  const tips = weakest.slice(0, 2).filter(p => p.score < 80)

  return (
    <WidgetShell module="horizon" size={size} kicker="Gezondheid" onClick={() => setShowKassabon(true)}>
      {/* Top row: gauge + label + trend */}
      <div className="flex items-start gap-3">
        <HealthGauge score={health.total} sz={120} />
        <div className="flex-1 pt-2">
          <p className={`font-mono text-lg font-semibold ${color}`}>{health.label}</p>
          <div className="mt-1 flex items-center gap-2">
            <TrendBadge trend={health.trend} />
            {health.previousMonth !== null && (
              <span className="text-[10px] text-[var(--ink-4)]">
                (was {health.previousMonth})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Radar chart + pillar bars side by side */}
      <div className="mt-2 flex gap-3">
        <div className="shrink-0">
          <RadarChart pillars={health.pillars} sz={100} />
        </div>
        <div className="flex-1 min-w-0 space-y-1 pt-1">
          {health.pillars.map(p => (
            <PillarRow key={p.id} pillar={p} />
          ))}
        </div>
      </div>

      {/* Tips */}
      {tips.length > 0 && (
        <div className="mt-2 rounded-[var(--r-sm)] border border-horizon-200 bg-horizon-50/50 p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Lightbulb className="h-3 w-3 text-horizon-500" />
            <span className="text-[10px] font-semibold text-horizon-700">Verbeterpunten</span>
          </div>
          <ul className="space-y-0.5">
            {tips.map(p => (
              <li key={p.id} className="text-[10px] text-[var(--ink-2)] leading-snug">
                <span className="font-medium">{p.name}:</span> {p.improvementTip}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CTA */}
      <p className="mt-1.5 font-serif italic text-[11px] text-[var(--ink-3)] flex items-center gap-1">
        Bekijk alle pilaren <ChevronRight className="h-3 w-3" />
      </p>

      <BottomSheet open={showKassabon} onClose={() => setShowKassabon(false)} title="Financiële Gezondheid">
        <HealthKassabon health={health} />
      </BottomSheet>
    </WidgetShell>
  )
})
