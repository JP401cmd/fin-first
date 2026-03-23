'use client'

import { memo, useEffect, useState } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { Scale, AlertTriangle, ArrowRight } from 'lucide-react'
import type { DriftResult } from '@/lib/rebalancing'

interface Props {
  size: WidgetSize
  data: unknown // Only used for gating — actual data is fetched client-side
  href?: string
}

interface RebalancingData {
  hasTargets: boolean
  drifts: DriftResult[]
  unclassifiedCount: number
  totalValue: number
}

type DriftSeverity = 'green' | 'orange' | 'red'

function getDriftSeverity(driftPct: number, threshold = 5): DriftSeverity {
  const abs = Math.abs(driftPct)
  if (abs < threshold) return 'green'
  if (abs < threshold * 2) return 'orange'
  return 'red'
}

function getOverallSeverity(drifts: DriftResult[], threshold = 5): DriftSeverity {
  if (drifts.length === 0) return 'green'
  let worst: DriftSeverity = 'green'
  for (const d of drifts) {
    const s = getDriftSeverity(d.drift_pct, threshold)
    if (s === 'red') return 'red'
    if (s === 'orange') worst = 'orange'
  }
  return worst
}

const SEVERITY_COLORS: Record<DriftSeverity, { dot: string; bar: string; text: string }> = {
  green: { dot: 'bg-emerald-500', bar: 'bg-emerald-500', text: 'text-emerald-600' },
  orange: { dot: 'bg-amber-500', bar: 'bg-amber-500', text: 'text-amber-600' },
  red: { dot: 'bg-red-500', bar: 'bg-red-500', text: 'text-red-600' },
}

export const RebalancingWidget = memo(function RebalancingWidget({ size, href }: Props) {
  const [rebalData, setRebalData] = useState<RebalancingData | null>(null)
  const [loading, setLoading] = useState(true)
  const { ref: inViewRef, hasEntered } = useInViewAnimation({ duration: 700 })

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      try {
        const res = await fetch('/api/rebalancing/check?view_mode=asset_class&threshold=5')
        if (!res.ok) throw new Error('Fetch failed')
        const json = await res.json()
        if (!cancelled) {
          setRebalData({
            hasTargets: json.hasTargets ?? false,
            drifts: json.drifts ?? [],
            unclassifiedCount: json.unclassifiedCount ?? 0,
            totalValue: json.totalValue ?? 0,
          })
        }
      } catch {
        if (!cancelled) setRebalData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [])

  // ── Loading state ──
  if (loading) {
    return (
      <WidgetShell module="kern" size={size} kicker="Rebalancing" href={href}>
        <div className="flex items-center justify-center h-full">
          <div className="h-4 w-4 rounded-full border-2 border-[var(--ink-4)] border-t-transparent animate-spin" />
        </div>
      </WidgetShell>
    )
  }

  // ── No holdings / error ──
  if (!rebalData || rebalData.totalValue === 0) {
    return (
      <WidgetShell module="kern" size={size} kicker="Rebalancing" href={href}>
        <WidgetEmpty icon={Scale} message="Voeg beleggingen toe om portfolio drift te monitoren." />
      </WidgetShell>
    )
  }

  // ── No targets set: progressive disclosure CTA ──
  if (!rebalData.hasTargets) {
    if (size === 'mini') {
      return (
        <WidgetShell module="kern" size="mini" kicker="Rebalancing" href="/core/assets">
          <p className="text-[11px] text-[var(--ink-3)] truncate">Stel targets in →</p>
        </WidgetShell>
      )
    }
    return (
      <WidgetShell module="kern" size={size} kicker="Rebalancing" href="/core/assets">
        <div className="flex flex-col items-center justify-center gap-2 py-2">
          <Scale className="h-5 w-5 text-[var(--ink-4)]" strokeWidth={1.5} />
          <p className="font-serif italic text-[13px] text-[var(--ink-3)] text-center leading-relaxed">
            Stel je target allocatie in
          </p>
          <span className="inline-flex items-center gap-1 text-xs text-kern-600 font-medium">
            Configureer <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </WidgetShell>
    )
  }

  const { drifts, unclassifiedCount } = rebalData
  const overallSeverity = getOverallSeverity(drifts)
  const sortedDrifts = [...drifts].sort((a, b) => Math.abs(b.drift_pct) - Math.abs(a.drift_pct))
  const biggestDrift = sortedDrifts[0] ?? null

  // ── Mini size: status indicator circle only ──
  if (size === 'mini') {
    const isBalanced = overallSeverity === 'green'
    return (
      <WidgetShell module="kern" size="mini" kicker="Rebalancing" href={href}>
        <div className="flex items-center gap-2">
          <span className={`inline-block h-3 w-3 rounded-full ${SEVERITY_COLORS[overallSeverity].dot}`} />
          <span className={`text-[12px] font-medium truncate ${isBalanced ? 'text-emerald-600' : SEVERITY_COLORS[overallSeverity].text}`}>
            {isBalanced ? 'In balans ✓' : biggestDrift ? `${biggestDrift.label} ${biggestDrift.drift_pct > 0 ? '+' : ''}${biggestDrift.drift_pct.toFixed(1)}%` : 'Drift'}
          </span>
        </div>
      </WidgetShell>
    )
  }

  // ── Quarter size: status + biggest drift category + amount ──
  if (size === 'quarter') {
    const isBalanced = overallSeverity === 'green'
    return (
      <WidgetShell module="kern" size={size} kicker="Rebalancing" href={href}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${SEVERITY_COLORS[overallSeverity].dot}`} />
          <span className={`text-sm font-medium ${isBalanced ? 'text-emerald-600' : SEVERITY_COLORS[overallSeverity].text}`}>
            {isBalanced ? 'Portfolio in balans ✓' : 'Portfolio drift'}
          </span>
        </div>
        {!isBalanced && biggestDrift && (
          <div className="mt-1">
            <p className="text-xs text-[var(--ink-3)]">
              Grootste afwijking
            </p>
            <p className={`font-mono text-sm font-semibold tabular-nums mt-0.5 ${SEVERITY_COLORS[getDriftSeverity(biggestDrift.drift_pct)].text}`}>
              {biggestDrift.label} {biggestDrift.drift_pct > 0 ? '+' : ''}{biggestDrift.drift_pct.toFixed(1)}%
            </p>
            <p className="text-[11px] text-[var(--ink-4)] font-mono tabular-nums mt-0.5">
              €{Math.abs(biggestDrift.drift_amount).toLocaleString('nl-NL')}
            </p>
          </div>
        )}
        {unclassifiedCount > 0 && (
          <p className="text-[11px] text-amber-600 mt-1.5 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {unclassifiedCount} niet geclassificeerd
          </p>
        )}
      </WidgetShell>
    )
  }

  const isBalanced = overallSeverity === 'green'

  // ── Half size: horizontal bars per category with current vs target % ──
  if (size === 'half') {
    const displayDrifts = sortedDrifts.slice(0, 5)

    return (
      <WidgetShell module="kern" size={size} kicker="Rebalancing" href={href}>
        <div ref={inViewRef}>
          {/* Status header */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${SEVERITY_COLORS[overallSeverity].dot}`} />
            <span className={`text-sm font-medium ${isBalanced ? 'text-emerald-600' : SEVERITY_COLORS[overallSeverity].text}`}>
              {isBalanced ? 'Portfolio in balans ✓' : 'Portfolio drift gedetecteerd'}
            </span>
          </div>

          {/* Drift bars */}
          <div className="space-y-1.5">
            {displayDrifts.map((drift) => {
              const severity = getDriftSeverity(drift.drift_pct)
              const maxPct = Math.max(...displayDrifts.map(d => Math.max(d.current_pct, d.target_pct)), 1)

              return (
                <div key={drift.category}>
                  {/* Label row */}
                  <div className="flex items-baseline justify-between text-[11px] mb-0.5">
                    <span className="text-[var(--ink-2)] truncate max-w-[55%]">{drift.label}</span>
                    <span className={`font-mono tabular-nums ${SEVERITY_COLORS[severity].text}`}>
                      {drift.current_pct.toFixed(1)}% / {drift.target_pct.toFixed(1)}%
                    </span>
                  </div>
                  {/* Bar */}
                  <div className="relative h-[6px] w-full rounded-full bg-[var(--subtle)] overflow-hidden">
                    {/* Target marker */}
                    <div
                      className="absolute top-0 h-full w-[2px] bg-[var(--ink-4)] opacity-40 z-10"
                      style={{ left: `${(drift.target_pct / maxPct) * 100}%` }}
                    />
                    {/* Current bar */}
                    <div
                      className={`h-full rounded-full ${SEVERITY_COLORS[severity].bar} transition-all duration-700 ease-[cubic-bezier(.22,1,.36,1)]`}
                      style={{
                        width: hasEntered ? `${(drift.current_pct / maxPct) * 100}%` : '0%',
                        transition: hasEntered ? 'width 700ms cubic-bezier(.22,1,.36,1)' : 'none',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Unclassified warning */}
          {unclassifiedCount > 0 && (
            <p className="text-[11px] text-amber-600 mt-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
              <span>{unclassifiedCount} holding{unclassifiedCount > 1 ? 's' : ''} niet geclassificeerd</span>
            </p>
          )}
        </div>
      </WidgetShell>
    )
  }

  // ── Full size: complete overview with allocatie grid and suggestions ──
  const displayDrifts = sortedDrifts.slice(0, 8)
  const maxPct = Math.max(...displayDrifts.map(d => Math.max(d.current_pct, d.target_pct)), 1)
  const needsRebalance = !isBalanced && sortedDrifts.some(d => Math.abs(d.drift_pct) >= 5)

  return (
    <WidgetShell module="kern" size={size} kicker="Rebalancing" href={href}>
      <div ref={inViewRef}>
        {/* Status header */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${SEVERITY_COLORS[overallSeverity].dot}`} />
          <span className={`text-sm font-medium ${isBalanced ? 'text-emerald-600' : SEVERITY_COLORS[overallSeverity].text}`}>
            {isBalanced ? 'Portfolio in balans ✓' : 'Portfolio drift gedetecteerd'}
          </span>
        </div>

        {/* Drift bars */}
        <div className="space-y-1 mb-2">
          {displayDrifts.map((drift, i) => {
            const severity = getDriftSeverity(drift.drift_pct)
            return (
              <div
                key={drift.category}
                style={{
                  opacity: hasEntered ? 1 : 0,
                  transform: hasEntered ? 'translateY(0)' : 'translateY(4px)',
                  transition: `opacity 400ms ${100 + i * 60}ms ease, transform 400ms ${100 + i * 60}ms ease`,
                }}
              >
                <div className="flex items-baseline justify-between text-[11px] mb-0.5">
                  <span className="text-[var(--ink-2)] truncate max-w-[55%]">{drift.label}</span>
                  <span className={`font-mono tabular-nums ${SEVERITY_COLORS[severity].text}`}>
                    {drift.current_pct.toFixed(1)}% / {drift.target_pct.toFixed(1)}%
                  </span>
                </div>
                <div className="relative h-[5px] w-full rounded-full bg-[var(--subtle)] overflow-hidden">
                  <div
                    className="absolute top-0 h-full w-[2px] bg-[var(--ink-4)] opacity-40 z-10"
                    style={{ left: `${(drift.target_pct / maxPct) * 100}%` }}
                  />
                  <div
                    className={`h-full rounded-full ${SEVERITY_COLORS[severity].bar}`}
                    style={{
                      width: hasEntered ? `${(drift.current_pct / maxPct) * 100}%` : '0%',
                      transition: hasEntered ? 'width 700ms cubic-bezier(.22,1,.36,1)' : 'none',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Target vs actual allocatie grid */}
        <div
          className="border border-[var(--border-ed)] rounded-md overflow-hidden mb-2"
          style={{
            opacity: hasEntered ? 1 : 0,
            transition: 'opacity 400ms 600ms ease',
          }}
        >
          {/* Table header */}
          <div className="grid grid-cols-4 gap-0 text-[10px] uppercase tracking-wider font-medium text-[var(--ink-3)] bg-[var(--subtle)] px-2 py-1 border-b border-[var(--border-ed)]">
            <span>Categorie</span>
            <span className="text-right">Huidig</span>
            <span className="text-right">Target</span>
            <span className="text-right">Drift</span>
          </div>
          {/* Table rows */}
          {displayDrifts.map((drift) => {
            const severity = getDriftSeverity(drift.drift_pct)
            return (
              <div
                key={drift.category + '-row'}
                className="grid grid-cols-4 gap-0 text-[11px] px-2 py-0.5 border-b border-[var(--border-ed)] last:border-b-0"
              >
                <span className="text-[var(--ink-2)] truncate">{drift.label}</span>
                <span className="text-right font-mono tabular-nums text-[var(--ink)]">
                  {drift.current_pct.toFixed(1)}%
                </span>
                <span className="text-right font-mono tabular-nums text-[var(--ink-3)]">
                  {drift.target_pct.toFixed(1)}%
                </span>
                <span className={`text-right font-mono tabular-nums ${SEVERITY_COLORS[severity].text}`}>
                  {drift.drift_pct > 0 ? '+' : ''}{drift.drift_pct.toFixed(1)}%
                </span>
              </div>
            )
          })}
        </div>

        {/* Unclassified warning */}
        {unclassifiedCount > 0 && (
          <p className="text-[11px] text-amber-600 mb-1.5 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            <span>{unclassifiedCount} holding{unclassifiedCount > 1 ? 's' : ''} niet geclassificeerd</span>
          </p>
        )}

        {/* Herbalanceer-suggestie CTA */}
        {needsRebalance && (
          <div
            className="flex items-center gap-1.5 text-[11px] text-kern-600 font-medium"
            style={{
              opacity: hasEntered ? 1 : 0,
              transition: 'opacity 400ms 700ms ease',
            }}
          >
            <ArrowRight className="h-3 w-3" />
            <span>Bekijk herbalanceer-suggesties</span>
          </div>
        )}
      </div>
    </WidgetShell>
  )
})
