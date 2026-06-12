'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { calculateFreedomTime, formatFreedomTimeString, dailyExpenseRate } from '@/lib/format'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { DashboardData } from './widget-renderer'
import { PiggyBank, Users, UserCheck } from 'lucide-react'
import { usePerspective } from '@/components/app/perspective-provider'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const SpaarquoteWidget = memo(function SpaarquoteWidget({ size, data, href }: Props) {
  const { perspective, partnerName } = usePerspective()
  const isHouseholdView = perspective === 'household' && data.householdOverrides != null
  const isPartnerView = perspective === 'partner' && data.partnerOverrides != null

  // Use perspective-appropriate data overrides for the headline savings metrics
  const overrides = isHouseholdView ? data.householdOverrides! : isPartnerView ? data.partnerOverrides! : null
  const monthlyIncome = overrides ? overrides.monthlyIncome : data.monthlyIncome
  const monthlyExpenses = overrides ? overrides.monthlyExpenses : data.monthlyExpenses
  const { monthlySavingsBudgetSpent } = data

  // Savings-bedrag: in huishoud-/partnerweergave komt er geen eigen budget-spent bij —
  // de override-cijfers zijn al de gecombineerde inkomsten/uitgaven.
  const savings = overrides
    ? monthlyIncome - monthlyExpenses
    : monthlyIncome - monthlyExpenses + monthlySavingsBudgetSpent

  // Spaarquote-percentage:
  // - Eigen perspectief: behoud de bestaande (preciezere) savingsRate6m-berekening.
  // - Huishoud/partner: bereken het tarief uit de override inkomsten/uitgaven.
  const rate = overrides
    ? (monthlyIncome > 0 ? Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100) : 0)
    : data.savingsRate6m
  const isPositive = rate >= 0

  const kickerLabel = isHouseholdView
    ? 'Spaarquote — Huishouden'
    : isPartnerView
      ? `Spaarquote — ${partnerName ?? 'Partner'}`
      : 'Spaarquote'

  if (monthlyIncome === 0 && rate === 0) {
    return (
      <WidgetShell module="kern" size={size} kicker={kickerLabel} href={href}>
        <WidgetEmpty icon={PiggyBank} message="Stel budgetten in om je spaarquote te berekenen." />
      </WidgetShell>
    )
  }

  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker={kickerLabel} href={href}>
        <>
          <p className={`font-mono text-[15px] font-semibold tabular-nums leading-none truncate ${isPositive ? 'text-positive' : 'text-negative'}`}>
            {rate.toFixed(1)}%
          </p>
          <div className="mt-0.5 h-[2px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
            <div className={`h-full rounded-full ${isPositive ? 'bg-positive' : 'bg-negative'}`} style={{ width: `${Math.min(Math.abs(rate), 100)}%` }} />
          </div>
        </>
      </WidgetShell>
    )
  }

  // ── Quarter-size: groot percentage + kleur + mini progress bar ──
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker={kickerLabel} href={href}>
        {(isHouseholdView || isPartnerView) && (
          <div className="mb-1 flex items-center gap-1 text-[10px] text-kern-600">
            {isPartnerView ? <UserCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
            {isPartnerView ? (partnerName ?? 'Partner') : 'Huishouden'}
          </div>
        )}
        <p className={`font-mono text-lg font-semibold tabular-nums ${isPositive ? 'text-positive' : 'text-negative'}`}>
          {rate.toFixed(1)}%
        </p>
        <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
          <div
            className={`h-full rounded-full ${isPositive ? 'bg-positive' : 'bg-negative'}`}
            style={{ width: `${Math.min(Math.abs(rate), 100)}%` }}
          />
        </div>
      </WidgetShell>
    )
  }

  const dailyExp = dailyExpenseRate(monthlyExpenses)
  const freedomTime = dailyExp > 0 && savings > 0
    ? calculateFreedomTime(savings, dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null

  // ── Vorige maand vergelijking ──
  // Historie en maand-op-maand-delta zijn per-gebruiker — alleen in eigen perspectief tonen.
  const { prevMonthIncome, prevMonthExpenses, prevMonthSavingsBudgetSpent } = data
  const prevSavings = prevMonthIncome - prevMonthExpenses + prevMonthSavingsBudgetSpent
  const prevRate = prevMonthIncome > 0 ? (prevSavings / prevMonthIncome) * 100 : 0
  const delta = rate - prevRate
  const hasPrevData = !isHouseholdView && !isPartnerView && prevMonthIncome > 0

  // ── Full-size: sparkline + averages + FIRE benchmark ──
  if (size === 'full') {
    // Use actual savings rate history from snapshots (preferred),
    // fall back to estimated rates from net worth deltas if no snapshot data
    const snapshotHistory = data.savingsHistory ?? []
    let historicalRates: number[]

    if (snapshotHistory.length > 0) {
      // Real savings rate data from net_worth_snapshots.savings_rate
      historicalRates = snapshotHistory.map(s => Math.max(-100, Math.min(100, s.value)))
    } else {
      // Fallback: derive estimated savings rates from net worth deltas
      const history = data.netWorthHistory ?? []
      historicalRates = []
      for (let i = 1; i < history.length; i++) {
        const monthDelta = history[i].value - history[i - 1].value
        const estRate = monthlyIncome > 0 ? (monthDelta / monthlyIncome) * 100 : 0
        historicalRates.push(Math.max(-100, Math.min(100, estRate)))
      }
    }
    // Append current rate as the most recent data point
    const estimatedRates = [...historicalRates, rate]

    // Take last 12 months for sparkline (showcase full year)
    const sparkData = estimatedRates.slice(-12)
    const avg3m = estimatedRates.length >= 3
      ? estimatedRates.slice(-3).reduce((a, b) => a + b, 0) / 3
      : null
    const avg6m = estimatedRates.length >= 6
      ? estimatedRates.slice(-6).reduce((a, b) => a + b, 0) / 6
      : null

    // FIRE-optimaal benchmark
    const fireBenchmark = 50

    // Sparkline SVG
    const svgW = 200
    const svgH = 48
    const minVal = Math.min(...sparkData, 0)
    const maxVal = Math.max(...sparkData, fireBenchmark, 10)
    const range = maxVal - minVal || 1
    const points = sparkData.map((v, i) => {
      const x = sparkData.length > 1 ? (i / (sparkData.length - 1)) * svgW : svgW / 2
      const y = svgH - ((v - minVal) / range) * svgH
      return `${x},${y}`
    }).join(' ')
    const benchmarkY = svgH - ((fireBenchmark - minVal) / range) * svgH

    // Sparkline, gemiddelden en YoY zijn per-gebruiker historie — verbergen in huishoud/partner.
    const showHistory = !isHouseholdView && !isPartnerView

    return (
      <WidgetShell module="kern" size={size} kicker={kickerLabel} href={href}>
        {(isHouseholdView || isPartnerView) && (
          <div className="mb-1.5 flex items-center gap-1 text-[11px] text-kern-600">
            {isPartnerView ? <UserCheck className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
            {isPartnerView ? (partnerName ?? 'Partner') : 'Gecombineerd huishouden'}
          </div>
        )}
        {/* Percentage + bar + bedrag (stacked vertically for 2-col full) */}
        <div>
          <p className={`font-mono text-2xl font-semibold tabular-nums ${isPositive ? 'text-[var(--ink)]' : 'text-negative'}`}>
            {rate.toFixed(1)}%
          </p>

          <div className="mt-2 h-[4px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
            <div
              className={`h-full rounded-full transition-all ${isPositive ? 'bg-positive' : 'bg-negative'}`}
              style={{ width: `${Math.min(Math.abs(rate), 100)}%` }}
            />
          </div>

          <p className="mt-2 text-xs text-[var(--ink-3)]">
            <MaskedAmount value={Math.max(savings, 0)} tone="kern" /> gespaard per maand
          </p>

          {hasPrevData && (
            <p className={`mt-1 text-xs font-mono tabular-nums ${delta >= 0 ? 'text-positive' : 'text-negative'}`}>
              {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}% t.o.v. vorige maand
            </p>
          )}

          {freedomStr && (
            <p className="mt-0.5 font-serif italic text-[12px] text-[var(--ink-3)]">
              +{freedomStr} vrijheid per maand
            </p>
          )}
        </div>

        {/* Sparkline — full width below content */}
        {showHistory && sparkData.length >= 2 && (
          <div className="mt-3">
            <svg width="100%" height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none" className="overflow-visible">
              {/* FIRE benchmark lijn */}
              <line
                x1={0} y1={benchmarkY} x2={svgW} y2={benchmarkY}
                stroke="var(--ink-4)" strokeWidth={1} strokeDasharray="4 3" opacity={0.5}
              />
              <text x={svgW} y={benchmarkY - 3} textAnchor="end" className="fill-[var(--ink-4)]" fontSize={9}>
                50%
              </text>
              {/* Trend lijn */}
              <polyline
                points={points}
                fill="none"
                stroke={isPositive ? 'var(--positive)' : 'var(--negative)'}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Data punten */}
              {sparkData.map((v, i) => {
                const x = sparkData.length > 1 ? (i / (sparkData.length - 1)) * svgW : svgW / 2
                const y = svgH - ((v - minVal) / range) * svgH
                return (
                  <circle
                    key={i}
                    cx={x} cy={y} r={2.5}
                    fill={v >= 0 ? 'var(--positive)' : 'var(--negative)'}
                  />
                )
              })}
            </svg>
          </div>
        )}

        {/* Gemiddelden + benchmark + year comparison */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--ink-3)] font-mono tabular-nums">
          {showHistory && avg3m !== null && (
            <span>3m: {avg3m.toFixed(1)}%</span>
          )}
          {showHistory && avg6m !== null && (
            <span>· 6m: {avg6m.toFixed(1)}%</span>
          )}
          <span className="text-[var(--ink-4)]">{showHistory ? '· ' : ''}FIRE: {fireBenchmark}%+</span>
        </div>
        {/* Year-over-year comparison */}
        {showHistory && estimatedRates.length >= 12 && (() => {
          const thisYear = estimatedRates.slice(-6).reduce((a, b) => a + b, 0) / 6
          const lastYear = estimatedRates.slice(-12, -6).reduce((a, b) => a + b, 0) / 6
          const yoyDelta = thisYear - lastYear
          return (
            <p className={`mt-0.5 text-[11px] font-mono tabular-nums ${yoyDelta >= 0 ? 'text-positive' : 'text-negative'}`}>
              {yoyDelta >= 0 ? '↑' : '↓'} {Math.abs(yoyDelta).toFixed(1)}% t.o.v. vorig halfjaar
            </p>
          )
        })()}
      </WidgetShell>
    )
  }

  // ── Half-size: horizontal layout — left percentage, right details ──
  return (
    <WidgetShell module="kern" size={size} kicker={kickerLabel} href={href}>
      <div className="flex gap-3 h-full">
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          {(isHouseholdView || isPartnerView) && (
            <div className="mb-1 flex items-center gap-1 text-[10px] text-kern-600">
              {isPartnerView ? <UserCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
              {isPartnerView ? (partnerName ?? 'Partner') : 'Huishouden'}
            </div>
          )}
          <p className={`font-mono text-xl font-semibold tabular-nums ${isPositive ? 'text-[var(--ink)]' : 'text-negative'}`}>
            {rate.toFixed(1)}%
          </p>
          <div className="mt-1.5 h-[4px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
            <div
              className={`h-full rounded-full transition-all ${isPositive ? 'bg-positive' : 'bg-negative'}`}
              style={{ width: `${Math.min(Math.abs(rate), 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--ink-3)]">
            <MaskedAmount value={Math.max(savings, 0)} tone="kern" />/mnd
          </p>
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
          {hasPrevData && (
            <p className={`text-[11px] font-mono tabular-nums ${delta >= 0 ? 'text-positive' : 'text-negative'}`}>
              {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}% t.o.v. vorige mnd
            </p>
          )}
          {freedomStr && (
            <p className="font-serif italic text-[11px] text-[var(--ink-3)]">
              +{freedomStr} vrijheid/mnd
            </p>
          )}
        </div>
      </div>
    </WidgetShell>
  )
})
