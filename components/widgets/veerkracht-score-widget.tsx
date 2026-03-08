'use client'

import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { Shield, TrendingUp, ArrowRight, Lightbulb } from 'lucide-react'
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

// ── Sub-factor card (for full-size) ──────────────────────────
function SubFactorCard({ label, score, maxScore, description }: {
  label: string
  score: number
  maxScore: number
  description: string
}) {
  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0
  const barColor = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-horizon-500' : 'bg-red-500'

  return (
    <div className="rounded-[var(--r-sm)] border border-[var(--border-ed)] p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-[var(--ink-2)]">{label}</span>
        <span className="font-mono text-xs font-semibold tabular-nums text-[var(--ink)]">{score}/{maxScore}</span>
      </div>
      <p className="mt-0.5 text-[10px] text-[var(--ink-3)]">{description}</p>
      <div className="mt-1.5 h-1 w-full rounded-full bg-[var(--subtle)]">
        <div className={`h-1 rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── Resilience breakdown (mirrors computeResilienceScore from horizon-data.ts) ──
function computeFullBreakdown(data: DashboardData) {
  const { totalAssets, totalDebts, monthlyIncome, monthlyExpenses } = data
  const monthlySavings = monthlyIncome - monthlyExpenses

  const liquidAssets = totalAssets * 0.3
  const emergencyMonths = monthlyExpenses > 0 ? liquidAssets / monthlyExpenses : 0
  const emergency = Math.max(0, Math.min(25, Math.round((emergencyMonths / 6) * 25)))

  const assetToDebtRatio = totalDebts > 0 ? totalAssets / totalDebts : totalAssets > 0 ? 10 : 0
  const diversification = Math.max(0, Math.min(25, Math.round(Math.min(assetToDebtRatio / 3, 1) * 25)))

  const debtPct = totalAssets > 0 ? totalDebts / totalAssets : 1
  const debtScore = Math.max(0, Math.min(25, Math.round((1 - Math.min(debtPct, 1)) * 25)))

  const sr = monthlyIncome > 0 ? monthlySavings / monthlyIncome : 0
  const savingsScore = Math.max(0, Math.min(25, Math.round(Math.min(sr / 0.30, 1) * 25)))

  const total = Math.max(0, emergency + diversification + debtScore + savingsScore)

  let label: string
  if (total >= 80) label = 'Uitstekend'
  else if (total >= 60) label = 'Sterk'
  else if (total >= 40) label = 'Redelijk'
  else if (total >= 20) label = 'Kwetsbaar'
  else label = 'Kritiek'

  return {
    total, label, emergency, diversification, debtScore, savingsScore,
    emergencyMonths,
    savingsRatePct: Math.round(Math.max(0, sr) * 100),
    debtRatioPct: Math.round(Math.min(debtPct, 1) * 100),
  }
}

// ── Tips generator ───────────────────────────────────────────
function generateTips(bd: ReturnType<typeof computeFullBreakdown>): string[] {
  const tips: string[] = []
  const factors = [
    { key: 'emergency', score: bd.emergency },
    { key: 'diversification', score: bd.diversification },
    { key: 'debt', score: bd.debtScore },
    { key: 'savings', score: bd.savingsScore },
  ].sort((a, b) => a.score - b.score)

  const weakest = factors[0]
  if (weakest.key === 'emergency' && bd.emergencyMonths < 6) {
    tips.push(`Bouw je noodfonds uit naar 6 maanden buffer (nu ${bd.emergencyMonths.toFixed(1)} mnd).`)
  } else if (weakest.key === 'diversification') {
    tips.push('Verbeter je vermogensverhouding door schulden af te lossen of assets op te bouwen.')
  } else if (weakest.key === 'debt') {
    tips.push('Verlaag je schuldenlast \u2014 focus op de duurste schuld eerst (avalanche-methode).')
  } else if (weakest.key === 'savings') {
    tips.push('Verhoog je spaarquote richting 30% door vaste lasten te verlagen.')
  }

  if (factors.length > 1 && factors[1].score < 20) {
    const second = factors[1]
    if (second.key === 'emergency') tips.push('Automatiseer een maandelijkse storting naar je noodfondsrekening.')
    else if (second.key === 'savings') tips.push('Bekijk je abonnementen \u2014 kleine besparingen tellen snel op.')
    else if (second.key === 'debt') tips.push('Overweeg herfinanciering van je duurste leningen.')
    else if (second.key === 'diversification') tips.push('Spreid je vermogen over meerdere beleggingscategorieen.')
  }

  return tips.slice(0, 2)
}

// ── Trend computation ────────────────────────────────────────
function computeTrend(data: DashboardData): { direction: 'up' | 'stable'; label: string } {
  const history = data.netWorthHistory
  if (history.length >= 2) {
    const recent = history[history.length - 1].value
    const prev = history[history.length - 2].value
    if (recent > prev * 1.01) {
      return { direction: 'up', label: 'Verbeterend' }
    }
  }
  return { direction: 'stable', label: 'Stabiel' }
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

  // ── Half (2col × 1row = 160px landscape) ───────────────────
  if (size === 'half') {
    return (
      <WidgetShell module="horizon" size={size} kicker="Veerkracht Score" href={href}>
        <div className="flex items-start gap-3">
          <HalfGauge score={score} size={90} />
          <div className="flex-1 min-w-0 space-y-1">
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
        </div>
      </WidgetShell>
    )
  }

  // ── Full-size: enriched with gauge, sub-factor cards, tips, trend ──
  const bd = computeFullBreakdown(data)
  const trend = computeTrend(data)
  const tips = generateTips(bd)

  return (
    <WidgetShell module="horizon" size={size} kicker="Veerkracht Score" href={href}>
      {/* Top: Gauge + label + trend */}
      <div className="flex items-start gap-4">
        <HalfGauge score={score} size={160} />
        <div className="flex-1 pt-3">
          <p className={`font-mono text-xl font-semibold ${scoreColor}`}>{bd.label}</p>
          <p className="text-xs text-[var(--ink-3)] mt-0.5">
            {monthsCovered.toFixed(1)} maanden buffer
          </p>
          {/* Trend direction */}
          <div className="mt-2 flex items-center gap-1.5">
            {trend.direction === 'up' ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5 text-[var(--ink-3)]" />
            )}
            <span className={`text-[11px] font-medium ${
              trend.direction === 'up' ? 'text-emerald-600' : 'text-[var(--ink-3)]'
            }`}>
              {trend.direction === 'up' ? '\u2191' : '\u2192'} {trend.label}
            </span>
          </div>
        </div>
      </div>

      {/* Sub-factor detail cards (2x2 grid) */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <SubFactorCard
          label="Noodfonds"
          score={bd.emergency}
          maxScore={25}
          description={`${bd.emergencyMonths.toFixed(1)} mnd buffer`}
        />
        <SubFactorCard
          label="Vermogensverhouding"
          score={bd.diversification}
          maxScore={25}
          description="Assets vs schulden"
        />
        <SubFactorCard
          label="Schuldenlast"
          score={bd.debtScore}
          maxScore={25}
          description={`${bd.debtRatioPct}% schuld/vermogen`}
        />
        <SubFactorCard
          label="Spaarquote"
          score={bd.savingsScore}
          maxScore={25}
          description={`${bd.savingsRatePct}% van inkomen`}
        />
      </div>

      {/* Tips for improvement */}
      {tips.length > 0 && (
        <div className="mt-3 rounded-[var(--r-sm)] border border-horizon-200 bg-horizon-50/50 p-2.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Lightbulb className="h-3.5 w-3.5 text-horizon-500" />
            <span className="text-[11px] font-semibold text-horizon-700">Tips</span>
          </div>
          <ul className="space-y-1">
            {tips.map((tip, i) => (
              <li key={i} className="text-[11px] text-[var(--ink-2)] leading-relaxed">
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CTA */}
      <p className="mt-2 font-serif italic text-[12px] text-[var(--ink-3)]">
        Bekijk veerkracht details &rarr;
      </p>
    </WidgetShell>
  )
}
