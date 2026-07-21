'use client'

import { memo, useEffect, useState } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { formatWithFreedom, dailyExpenseRate } from '@/lib/format'
import { CENT_EPSILON } from '@/lib/constants'
import { Scale, AlertTriangle, ArrowRight, ArrowUpRight, ArrowDownRight, CalendarClock } from 'lucide-react'
import type { DriftResult, Trade } from '@/lib/rebalancing'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

interface RebalancingData {
  hasTargets: boolean
  drifts: DriftResult[]
  trades: Trade[]
  unclassifiedCount: number
  totalValue: number
  /** Effectieve drift-drempel (pref of default) — uit de API, niet lokaal gehardcodeerd. */
  threshold: number
  /** Box 3-peildatumvenster (nov–dec) — transacties raken de peildatum 1 jan. */
  isBox3Window: boolean
}

type DriftSeverity = 'green' | 'orange' | 'red'

function getDriftSeverity(driftPct: number, threshold: number): DriftSeverity {
  const abs = Math.abs(driftPct)
  if (abs < threshold) return 'green'
  if (abs < threshold * 2) return 'orange'
  return 'red'
}

function getOverallSeverity(drifts: DriftResult[], threshold: number): DriftSeverity {
  if (drifts.length === 0) return 'green'
  let worst: DriftSeverity = 'green'
  for (const d of drifts) {
    const s = getDriftSeverity(d.drift_pct, threshold)
    if (s === 'red') return 'red'
    if (s === 'orange') worst = 'orange'
  }
  return worst
}

// Stoplicht-semantiek: groen/rood via de semantische tokens, oranje ("aandacht")
// via het canonieke amber-token — spiegel van lib/leverage-status.ts, zodat de
// aandacht-tier niet als neutraal grijs wegvalt.
const SEVERITY_COLORS: Record<DriftSeverity, { dot: string; bar: string; text: string; ring: string }> = {
  green: { dot: 'bg-positive', bar: 'bg-positive', text: 'text-positive', ring: 'border-positive' },
  orange: { dot: 'bg-amber-500', bar: 'bg-amber-500', text: 'text-amber-700', ring: 'border-amber-500' },
  red: { dot: 'bg-negative', bar: 'bg-negative', text: 'text-negative', ring: 'border-negative' },
}

export const RebalancingWidget = memo(function RebalancingWidget({ size, data, href }: Props) {
  const [rebalData, setRebalData] = useState<RebalancingData | null>(null)
  const [loading, setLoading] = useState(true)
  const { ref: inViewRef, hasEntered } = useInViewAnimation({ duration: 700 })

  // Canoniek 12-mnd rolling dagtarief uit de bundel (consume-don't-recompute) voor
  // het vrijheidstijd-kader; fallback op de maand-conversie voor mock-/empty-bundels.
  const dagtarief = data.dailyExpenseRate ?? dailyExpenseRate(data.monthlyExpenses)

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      try {
        // Géén threshold-param: de API leest dan de gebruikers-pref
        // (profiles.rebalance_threshold) en geeft de effectieve drempel terug.
        const res = await fetch('/api/rebalancing/check?view_mode=asset_class')
        if (!res.ok) throw new Error('Fetch failed')
        const json = await res.json()
        if (!cancelled) {
          setRebalData({
            hasTargets: json.hasTargets ?? false,
            drifts: json.drifts ?? [],
            trades: json.trades ?? [],
            unclassifiedCount: json.unclassifiedCount ?? 0,
            totalValue: json.totalValue ?? 0,
            threshold: Number(json.threshold ?? 5),
            isBox3Window: json.isBox3Window ?? false,
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
  // Epsilon i.p.v. `=== 0`: totalValue is een berekende portefeuille-som, dus een
  // bijna-nul-restsom (afrondingsruis) telt óók als "leeg".
  if (!rebalData || Math.abs(rebalData.totalValue) < CENT_EPSILON) {
    return (
      <WidgetShell module="kern" size={size} kicker="Rebalancing" href={href}>
        <WidgetEmpty icon={Scale} message="Voeg beleggingen toe om portfolio drift te monitoren." />
      </WidgetShell>
    )
  }

  // ── No targets set: progressive disclosure CTA ──
  if (!rebalData.hasTargets) {
    // Deep-link naar de plek waar je targets/drempel écht instelt
    // (RebalancingSettingsSection op de holdings-pagina), niet de assets-hub.
    const configHref = '/overzicht/bezittingen/investment?tab=aandelen-holdings'
    if (size === 'mini') {
      return (
        <WidgetShell module="kern" size="mini" kicker="Rebalancing" href={configHref}>
          <p className="text-[11px] text-[var(--ink-3)] truncate">Stel targets in →</p>
        </WidgetShell>
      )
    }
    return (
      <WidgetShell module="kern" size={size} kicker="Rebalancing" href={configHref}>
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

  const { drifts, unclassifiedCount, trades, threshold, isBox3Window } = rebalData
  const overallSeverity = getOverallSeverity(drifts, threshold)
  const sortedDrifts = [...drifts].sort((a, b) => Math.abs(b.drift_pct) - Math.abs(a.drift_pct))
  const biggestDrift = sortedDrifts[0] ?? null
  const isBalanced = overallSeverity === 'green'

  // ── Mini size: status indicator circle only ──
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Rebalancing" href={href}>
        <div className="flex items-center gap-2">
          <span className={`inline-block h-3 w-3 rounded-full ${SEVERITY_COLORS[overallSeverity].dot}`} />
          <span className={`text-[12px] font-medium truncate ${isBalanced ? 'text-positive' : SEVERITY_COLORS[overallSeverity].text}`}>
            {isBalanced ? 'In balans ✓' : biggestDrift ? `${biggestDrift.label} ${biggestDrift.drift_pct > 0 ? '+' : ''}${biggestDrift.drift_pct.toFixed(1)}%` : 'Drift'}
          </span>
        </div>
      </WidgetShell>
    )
  }

  // ── Quarter size: status + biggest drift category + amount ──
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Rebalancing" href={href}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${SEVERITY_COLORS[overallSeverity].dot}`} />
          <span className={`text-sm font-medium ${isBalanced ? 'text-positive' : SEVERITY_COLORS[overallSeverity].text}`}>
            {isBalanced ? 'Portfolio in balans ✓' : 'Portfolio drift'}
          </span>
        </div>
        {!isBalanced && biggestDrift && (
          <div className="mt-1">
            <p className="text-xs text-[var(--ink-3)]">
              Grootste afwijking
            </p>
            <p className={`font-mono text-sm font-semibold tabular-nums mt-0.5 ${SEVERITY_COLORS[getDriftSeverity(biggestDrift.drift_pct, threshold)].text}`}>
              {biggestDrift.label} {biggestDrift.drift_pct > 0 ? '+' : ''}{biggestDrift.drift_pct.toFixed(1)}%
            </p>
            {/* Bedrag óók in vrijheidstijd (CLAUDE.md: bedragen > €100) */}
            <p className="text-[11px] text-[var(--ink-4)] font-serif italic mt-0.5">
              {formatWithFreedom(Math.abs(biggestDrift.drift_amount), dagtarief, { format: 'short' })}
            </p>
          </div>
        )}
        {unclassifiedCount > 0 && (
          <p className="text-[11px] text-[var(--ink-2)] mt-1.5 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {unclassifiedCount} niet geclassificeerd
          </p>
        )}
      </WidgetShell>
    )
  }

  // ── Half size: horizontal bars per category with current vs target % ──
  if (size === 'half') {
    const displayDrifts = sortedDrifts.slice(0, 5)

    return (
      <WidgetShell module="kern" size={size} kicker="Rebalancing" href={href}>
        <div ref={inViewRef}>
          {/* Status header */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${SEVERITY_COLORS[overallSeverity].dot}`} />
            <span className={`text-sm font-medium ${isBalanced ? 'text-positive' : SEVERITY_COLORS[overallSeverity].text}`}>
              {isBalanced ? 'Portfolio in balans ✓' : 'Portfolio drift gedetecteerd'}
            </span>
          </div>

          {/* Drift bars */}
          <div className="space-y-1.5">
            {displayDrifts.map((drift) => {
              const severity = getDriftSeverity(drift.drift_pct, threshold)
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
            <p className="text-[11px] text-[var(--ink-2)] mt-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
              <span>{unclassifiedCount} holding{unclassifiedCount > 1 ? 's' : ''} niet geclassificeerd</span>
            </p>
          )}
        </div>
      </WidgetShell>
    )
  }

  // ── XL (Double) size: allocatie-diagnose (links) + concrete trade-lijst (rechts) ──
  if (size === 'xl') {
    const diagDrifts = sortedDrifts.slice(0, 7)
    const maxPct = Math.max(...diagDrifts.map(d => Math.max(d.current_pct, d.target_pct)), 1)

    return (
      <WidgetShell module="kern" size={size} kicker="Rebalancing" href={href}>
        <div ref={inViewRef} className="flex h-full flex-col">
          {/* Status header */}
          <div className="flex items-center gap-2 mb-2 shrink-0">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${SEVERITY_COLORS[overallSeverity].dot}`} />
            <span className={`text-sm font-medium ${isBalanced ? 'text-positive' : SEVERITY_COLORS[overallSeverity].text}`}>
              {isBalanced ? 'Portfolio in balans ✓' : 'Portfolio drift gedetecteerd'}
            </span>
            {unclassifiedCount > 0 && (
              <span className="ml-auto text-[11px] text-[var(--ink-2)] flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                {unclassifiedCount} niet geclassificeerd
              </span>
            )}
          </div>

          <div className="grid flex-1 min-h-0 grid-cols-2 gap-5">
            {/* ── Links: allocatie-diagnose (dumbbell current ↔ target) ── */}
            <div className="flex min-h-0 flex-col">
              <p className="label-editorial text-[var(--ink-3)] mb-2 shrink-0">Allocatie-diagnose</p>
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin space-y-2.5 pr-1">
                {diagDrifts.map((drift, i) => {
                  const severity = getDriftSeverity(drift.drift_pct, threshold)
                  const curLeft = (drift.current_pct / maxPct) * 100
                  const tgtLeft = (drift.target_pct / maxPct) * 100
                  const lo = Math.min(curLeft, tgtLeft)
                  const hi = Math.max(curLeft, tgtLeft)
                  return (
                    <div
                      key={drift.category}
                      style={{
                        opacity: hasEntered ? 1 : 0,
                        transform: hasEntered ? 'translateY(0)' : 'translateY(4px)',
                        transition: `opacity 400ms ${100 + i * 50}ms ease, transform 400ms ${100 + i * 50}ms ease`,
                      }}
                    >
                      <div className="flex items-baseline justify-between text-[11px] mb-1">
                        <span className="text-[var(--ink-2)] truncate max-w-[55%]">{drift.label}</span>
                        <span className={`font-mono tabular-nums ${SEVERITY_COLORS[severity].text}`}>
                          {drift.current_pct.toFixed(1)}% / {drift.target_pct.toFixed(1)}%
                        </span>
                      </div>
                      {/* Dumbbell: verbindingslijn tussen huidig (gevuld, severity) en target (open ring) */}
                      <div className="relative h-3 w-full">
                        <div className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 rounded-full bg-[var(--subtle)]" />
                        <div
                          className={`absolute top-1/2 h-[2px] -translate-y-1/2 rounded-full ${SEVERITY_COLORS[severity].bar} opacity-70`}
                          style={{
                            left: `${lo}%`,
                            width: hasEntered ? `${hi - lo}%` : '0%',
                            transition: hasEntered ? 'width 600ms cubic-bezier(.22,1,.36,1)' : 'none',
                          }}
                        />
                        {/* Target-marker (open ring) */}
                        <div
                          className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] ${SEVERITY_COLORS[severity].ring} bg-[var(--paper)]`}
                          style={{ left: `${tgtLeft}%` }}
                          aria-hidden
                        />
                        {/* Huidige-marker (gevuld) */}
                        <div
                          className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${SEVERITY_COLORS[severity].dot} ring-2 ring-[var(--paper)]`}
                          style={{
                            left: hasEntered ? `${curLeft}%` : `${tgtLeft}%`,
                            transition: hasEntered ? 'left 600ms cubic-bezier(.22,1,.36,1)' : 'none',
                          }}
                          aria-hidden
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Rechts: concrete trade-lijst ── */}
            <div className="flex min-h-0 flex-col border-l border-[var(--border-ed)] pl-5">
              <p className="label-editorial text-[var(--ink-3)] mb-2 shrink-0">Eerste stap · trades</p>
              {trades.length === 0 ? (
                <div className="flex flex-1 items-center justify-center">
                  <p className="font-serif italic text-[13px] text-[var(--ink-3)] text-center leading-relaxed">
                    Geen trades nodig — je zit binnen je drempel van {threshold}%.
                  </p>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin space-y-1.5 pr-1">
                  {trades.slice(0, 6).map((trade, i) => {
                    const isBuy = trade.action === 'buy'
                    return (
                      <div
                        key={trade.category}
                        className="flex items-center gap-2.5 rounded-md border border-[var(--border-ed)] px-2.5 py-1.5"
                        style={{
                          opacity: hasEntered ? 1 : 0,
                          transition: `opacity 400ms ${150 + i * 60}ms ease`,
                        }}
                      >
                        <span
                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isBuy ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'}`}
                        >
                          {isBuy ? <ArrowDownRight className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-medium text-[var(--ink)] truncate">
                            {isBuy ? 'Bijkopen' : 'Verkopen'} · {trade.label}
                          </p>
                          {/* Trade-bedrag óók in vrijheidstijd */}
                          <p className="text-[11px] text-[var(--ink-3)] font-serif italic truncate">
                            {formatWithFreedom(trade.amount, dagtarief, { format: 'short' })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Box 3-peildatumbanner (nov–dec) — spant beide kolommen */}
          {isBox3Window && (
            <div className="mt-2 flex shrink-0 items-start gap-1.5 rounded-md border border-[var(--border-ed)] bg-[var(--subtle)] px-2.5 py-1.5">
              <CalendarClock className="h-3.5 w-3.5 shrink-0 text-[var(--ink-3)] mt-px" />
              <p className="text-[11px] text-[var(--ink-2)] leading-snug">
                Peildatum 1 januari nadert — transacties in november–december beïnvloeden je Box 3-grondslag. Weeg af of rebalancing vóór of na de jaarwisseling gunstiger is.
              </p>
            </div>
          )}
        </div>
      </WidgetShell>
    )
  }

  // ── Full size: drift-diagnose (bars) + top-1 concrete trade-suggestie ──
  const displayDrifts = sortedDrifts.slice(0, 8)
  const maxPct = Math.max(...displayDrifts.map(d => Math.max(d.current_pct, d.target_pct)), 1)
  const topTrade = trades[0] ?? null

  return (
    <WidgetShell module="kern" size={size} kicker="Rebalancing" href={href}>
      <div ref={inViewRef}>
        {/* Status header */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${SEVERITY_COLORS[overallSeverity].dot}`} />
          <span className={`text-sm font-medium ${isBalanced ? 'text-positive' : SEVERITY_COLORS[overallSeverity].text}`}>
            {isBalanced ? 'Portfolio in balans ✓' : 'Portfolio drift gedetecteerd'}
          </span>
        </div>

        {/* Drift bars (diagnose) */}
        <div className="space-y-1.5 mb-2">
          {displayDrifts.map((drift, i) => {
            const severity = getDriftSeverity(drift.drift_pct, threshold)
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

        {/* Unclassified warning */}
        {unclassifiedCount > 0 && (
          <p className="text-[11px] text-[var(--ink-2)] mb-1.5 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            <span>{unclassifiedCount} holding{unclassifiedCount > 1 ? 's' : ''} niet geclassificeerd</span>
          </p>
        )}

        {/* Top-1 concrete trade-suggestie (i.p.v. de dubbele tabel) */}
        {topTrade && (
          <div
            className="flex items-center gap-2.5 rounded-md border border-[var(--border-ed)] px-2.5 py-1.5"
            style={{
              opacity: hasEntered ? 1 : 0,
              transition: 'opacity 400ms 600ms ease',
            }}
          >
            <span
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${topTrade.action === 'buy' ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'}`}
            >
              {topTrade.action === 'buy' ? <ArrowDownRight className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-[var(--ink)] truncate">
                {topTrade.action === 'buy' ? 'Bijkopen' : 'Verkopen'} · {topTrade.label}
              </p>
              <p className="text-[11px] text-[var(--ink-3)] font-serif italic truncate">
                {formatWithFreedom(topTrade.amount, dagtarief, { format: 'short' })}
              </p>
            </div>
          </div>
        )}
      </div>
    </WidgetShell>
  )
})
