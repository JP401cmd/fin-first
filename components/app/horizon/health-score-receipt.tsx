'use client'

import Link from 'next/link'
import { Lightbulb, ArrowRight } from 'lucide-react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { KassabonShell } from '@/components/app/kassabon-shell'
import type { HealthScore, HealthPillar } from '@/lib/financial-health'

// ── Color helpers ────────────────────────────────────────────

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

// ── Props ────────────────────────────────────────────────────

interface HealthScoreReceiptProps {
  health: HealthScore
  /** Optional: override the displayed total score (e.g. from snapshot) */
  overrideTotal?: number | null
  /** Optional: override the displayed label */
  overrideLabel?: string | null
  /** Optional: footer content (e.g. backtesting link) */
  footer?: React.ReactNode
}

// ── Main Component ──────────────────────────────────────────

export function HealthScoreReceipt({
  health,
  overrideTotal,
  overrideLabel,
  footer,
}: HealthScoreReceiptProps) {
  // Always use the live computed total from the weighted average of pillars.
  // The overrideTotal (from snapshot) is stale and decoupled from the
  // per-pillar scores displayed below — using it causes the total to not
  // match the visible weighted average.
  const displayTotal = health.total
  const displayLabel = health.label

  // Sort pillars: weakest first for improvement focus
  const sorted = [...health.pillars].sort((a, b) => a.score - b.score)

  return (
    <div className="space-y-4">
      {/* Total score header */}
      <KassabonShell>
        <div className="flex items-center justify-between border-b border-dashed border-[var(--border-md)] pb-2 mb-2">
          <span className="text-xs text-[var(--ink-3)]">FINANCIËLE GEZONDHEID</span>
          <span className={`font-mono text-lg font-bold tabular-nums ${scoreColorClass(displayTotal)}`}>
            {displayTotal}/100
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--ink-3)]">Beoordeling</span>
          <span className={`font-medium ${scoreColorClass(displayTotal)}`}>{displayLabel}</span>
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
          Score = gewogen gemiddelde van {health.activePillarCount ?? 6} pilaren
          {health.budgetingActive === false && (
            <p className="mt-1 text-[var(--ink-4)]">
              Budgetteren niet actief — score op {health.activePillarCount} pilaren (budgetdiscipline uitgesloten)
            </p>
          )}
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
            {/* Improvement tip + action link */}
            <div className="mt-2 flex items-start gap-1.5">
              <Lightbulb className="h-3 w-3 text-horizon-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-[var(--ink-2)] leading-snug">{pillar.improvementTip}</p>
                <Link
                  href={pillar.actionHref}
                  className="inline-flex items-center gap-1 mt-1 text-[10px] font-medium text-horizon-600 hover:text-horizon-800 transition-colors group/tip"
                >
                  <span className="underline underline-offset-2 group-hover/tip:decoration-horizon-800">
                    {pillar.actionLabel}
                  </span>
                  <ArrowRight className="h-2.5 w-2.5 transition-transform group-hover/tip:translate-x-0.5" />
                </Link>
              </div>
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

      {/* Optional footer (e.g. backtesting link) */}
      {footer}
    </div>
  )
}
