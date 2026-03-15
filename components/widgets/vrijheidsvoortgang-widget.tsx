'use client'

import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency } from '@/lib/format'
import { Compass } from 'lucide-react'
import type { DashboardData } from './widget-renderer'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function VrijheidsvoortgangWidget({ size, data, href }: Props) {
  const { netWorth, fireTarget, freedomPct, fireProjResult, simRequiredPortfolio } = data
  const effectiveFire = simRequiredPortfolio ?? fireTarget
  const effectivePct = effectiveFire > 0 ? Math.min((netWorth / effectiveFire) * 100, 100) : freedomPct
  const { ref: inViewRef, hasEntered } = useInViewAnimation({ duration: 700 })

  // Compute delta: change in freedom percentage vs previous month
  const prevMonthPct = (() => {
    const hist = data.netWorthHistory
    if (!hist || hist.length < 2) return null
    const prevNw = hist[hist.length - 2].value
    return effectiveFire > 0 ? Math.min((prevNw / effectiveFire) * 100, 100) : null
  })()
  const pctDelta = prevMonthPct !== null ? effectivePct - prevMonthPct : null

  const fireStatusLabel = (() => {
    const cd = data.simFireCountdown ?? fireProjResult
    return cd.fireDate === 'Bereikt!'
      ? 'Bereikt!'
      : cd.fireDate === 'Niet haalbaar'
        ? 'Verhoog capaciteit'
        : cd.fireDate
  })()

  // ── Mini-size: freedom percentage ────
  if (size === 'mini') {
    return (
      <WidgetShell module="cross" size="mini" kicker="Vrijheidsvoortgang" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {effectivePct.toFixed(1)}%
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter-size: big percentage + compact progress bar + FIRE date ────
  if (size === 'quarter') {
    return (
      <WidgetShell module="cross" size={size} kicker="Vrijheidsvoortgang" href={href}>
        <div ref={inViewRef}>
          <div className="flex items-center gap-1.5 mb-1">
            <Compass className="h-3 w-3 text-horizon-600 shrink-0" />
            <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
              {effectivePct.toFixed(1)}%
            </p>
          </div>
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)] mb-1">
            <div
              className="h-full rounded-full bg-gradient-to-r from-horizon-400 to-horizon-600"
              style={{
                width: hasEntered ? `${Math.min(effectivePct, 100)}%` : '0%',
                transition: hasEntered ? 'width 700ms cubic-bezier(.22,1,.36,1)' : 'none',
              }}
            />
          </div>
          <p className="text-[10px] text-[var(--ink-3)] truncate">
            {fireStatusLabel}
          </p>
        </div>
      </WidgetShell>
    )
  }

  // ── Half-size (2col × 1row = 160px landscape) ────
  if (size === 'half') {
    return (
      <WidgetShell module="cross" size={size} kicker="Vrijheidsvoortgang" href={href}>
        <div ref={inViewRef}>
          <div className="flex items-center gap-2 mb-1">
            <Compass className="h-3.5 w-3.5 text-horizon-600 shrink-0" />
            <p className="font-mono text-xl font-semibold tabular-nums text-[var(--ink)]">
              {effectivePct.toFixed(1)}%
            </p>
            {pctDelta !== null && (
              <span className={`text-xs font-mono tabular-nums ${pctDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {pctDelta >= 0 ? '+' : ''}{pctDelta.toFixed(1)}%
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="h-[4px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)] mb-1.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-horizon-400 to-horizon-600"
              style={{
                width: hasEntered ? `${Math.min(effectivePct, 100)}%` : '0%',
                transition: hasEntered ? 'width 700ms cubic-bezier(.22,1,.36,1)' : 'none',
              }}
            />
          </div>

          <p className="text-[11px] text-[var(--ink-3)] font-mono tabular-nums">
            {formatCurrency(netWorth)} / {formatCurrency(effectiveFire)}{simRequiredPortfolio ? ' (sim)' : ''}
          </p>
        </div>
      </WidgetShell>
    )
  }

  // ── Full-size: milestones, growth rate, estimated dates ────
  const milestones = [25, 50, 75, 100] as const

  // Monthly growth rate from netWorthHistory
  const monthlyGrowthRate = (() => {
    const hist = data.netWorthHistory
    if (!hist || hist.length < 2) return null
    const oldest = hist[0].value
    const newest = hist[hist.length - 1].value
    const months = hist.length - 1
    if (oldest <= 0 || months <= 0) return null
    return (newest - oldest) / months
  })()

  // Estimate date to reach a milestone percentage
  const estimateDateForMilestone = (targetPct: number): string | null => {
    if (effectivePct >= targetPct) return 'Bereikt'
    if (!monthlyGrowthRate || monthlyGrowthRate <= 0) return null
    const targetValue = (targetPct / 100) * effectiveFire
    const remaining = targetValue - netWorth
    const monthsNeeded = Math.ceil(remaining / monthlyGrowthRate)
    if (monthsNeeded > 600) return null // > 50 years, not realistic
    const date = new Date()
    date.setMonth(date.getMonth() + monthsNeeded)
    return date.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
  }

  return (
    <WidgetShell module="cross" size={size} kicker="Vrijheidsvoortgang" href={href}>
      <div ref={inViewRef}>
        <div className="flex items-center gap-2 mb-2">
          <Compass className="h-3.5 w-3.5 text-horizon-600 shrink-0" />
          <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
            {effectivePct.toFixed(1)}%
          </p>
          {pctDelta !== null && (
            <span className={`text-xs font-mono tabular-nums ${pctDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {pctDelta >= 0 ? '+' : ''}{pctDelta.toFixed(1)}%
            </span>
          )}
        </div>

        {/* Progress bar with milestone markers */}
        <div className="relative mb-3">
          <div className="h-[6px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-horizon-400 to-horizon-600"
              style={{
                width: hasEntered ? `${Math.min(effectivePct, 100)}%` : '0%',
                transition: hasEntered ? 'width 700ms cubic-bezier(.22,1,.36,1)' : 'none',
              }}
            />
          </div>
          {/* Milestone markers */}
          {milestones.map(m => (
            <div
              key={m}
              className="absolute top-0 flex flex-col items-center"
              style={{ left: `${m}%`, transform: 'translateX(-50%)' }}
            >
              <div className={`w-[2px] h-[6px] ${effectivePct >= m ? 'bg-horizon-700' : 'bg-[var(--ink-4)]'}`} />
              <span className={`text-[9px] mt-0.5 tabular-nums ${effectivePct >= m ? 'text-horizon-600 font-medium' : 'text-[var(--ink-4)]'}`}>
                {m}%
              </span>
            </div>
          ))}
        </div>

        {/* Wealth vs Goal */}
        <p className="text-xs text-[var(--ink-3)] font-mono tabular-nums">
          Vermogen {formatCurrency(netWorth)} / Doel {formatCurrency(effectiveFire)}{simRequiredPortfolio ? ' (sim)' : ''}
        </p>

        {/* Monthly growth rate */}
        {monthlyGrowthRate !== null && (
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            <span className="text-[var(--ink-2)] font-medium">Groeisnelheid:</span>{' '}
            <span className="font-mono tabular-nums">{formatCurrency(monthlyGrowthRate)}/mnd</span>
          </p>
        )}

        {/* Milestone estimated dates */}
        <div className="mt-2 space-y-0.5">
          {milestones.map(m => {
            const est = estimateDateForMilestone(m)
            if (est === null) return null
            const reached = est === 'Bereikt'
            return (
              <div key={m} className="flex items-center justify-between text-[11px]">
                <span className={`font-mono tabular-nums ${reached ? 'text-horizon-600 font-medium' : 'text-[var(--ink-3)]'}`}>
                  {m}% vrijheid
                </span>
                <span className={`font-mono tabular-nums ${reached ? 'text-emerald-600' : 'text-[var(--ink-3)]'}`}>
                  {reached ? 'Bereikt' : `~${est}`}
                </span>
              </div>
            )
          })}
        </div>

        <p className="mt-2 font-serif italic text-[11px] text-[var(--ink-3)]">
          {(() => {
            const cd = data.simFireCountdown ?? fireProjResult
            return cd.fireDate === 'Bereikt!'
              ? 'Volledige vrijheid bereikt!'
              : cd.fireDate === 'Niet haalbaar'
                ? 'Verhoog spaarcapaciteit'
                : `Vrijheid: ${cd.fireDate}`
          })()}
        </p>
      </div>
    </WidgetShell>
  )
}
