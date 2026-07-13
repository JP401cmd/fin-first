'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { calculateFreedomTime, formatFreedomTimeString, dailyExpenseRate } from '@/lib/format'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { DashboardData } from './widget-renderer'
import { ShieldCheck, Lightbulb } from 'lucide-react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

/** Color based on months covered: red <3m, orange 3-5m, green >=6m */
function progressColor(months: number): { text: string; bar: string; bg: string } {
  if (months >= 6) return { text: 'text-positive', bar: 'bg-positive', bg: 'bg-positive/10' }
  if (months >= 3) return { text: 'text-[var(--ink-2)]', bar: 'bg-[var(--ink-3)]', bg: 'bg-[var(--subtle)]' }
  return { text: 'text-negative', bar: 'bg-negative', bg: 'bg-negative/10' }
}

export const NoodfondsWidget = memo(function NoodfondsWidget({ size, data, href }: Props) {
  const { emergencyFund } = data
  const { currentAmount, targetAmount, monthsCovered, targetMonths, isComplete } = emergencyFund
  const pct = targetAmount > 0 ? Math.min((currentAmount / targetAmount) * 100, 100) : 0
  const colors = progressColor(monthsCovered)
  const monthlyExpenses = targetMonths > 0 ? targetAmount / targetMonths : 0

  // Freedom time framing
  const dailyExp = dailyExpenseRate(data.monthlyExpenses)
  const freedomTime = dailyExp > 0 && currentAmount > 0
    ? calculateFreedomTime(currentAmount, dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null

  // In-view fill-animatie (700ms bezier, 0% → doel; transition:none pre-entered).
  // Eén hook bovenaan; per render toont het widget precies één size, dus dezelfde
  // ref op elke size-track is rules-of-hooks-veilig.
  const { ref: barRef, hasEntered } = useInViewAnimation({ duration: 700 })
  const barTransition = hasEntered ? 'width 700ms cubic-bezier(.22,1,.36,1)' : 'none'

  // ── Mini-size ────────────────────────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Noodfonds" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {monthsCovered.toFixed(1)} mnd
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter: compact months + mini progress bar ──
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Noodfonds" href={href}>
        <p className={`font-mono text-lg font-semibold tabular-nums ${colors.text}`}>
          {monthsCovered.toFixed(1)} <span className="text-xs text-[var(--ink-3)]">van {targetMonths} maanden</span>
        </p>
        {/* Mini progress bar */}
        <div ref={barRef} className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
          <div
            className={`h-full rounded-full ${colors.bar}`}
            style={{ width: hasEntered ? `${pct}%` : '0%', transition: barTransition }}
          />
        </div>
        {isComplete && (
          <p className="mt-1 text-[10px] font-medium text-positive">Compleet</p>
        )}
      </WidgetShell>
    )
  }

  // ── Half: compact for 1-row height — progress bar + bedrag + maanden ──
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker="Noodfonds" href={href}>
        {/* Header with icon */}
        <div className="flex items-center gap-2">
          <div className={`flex-shrink-0 rounded-md p-1.5 ${colors.bg}`}>
            <ShieldCheck className={`h-4 w-4 ${colors.text}`} strokeWidth={1.5} />
          </div>
          <p className={`font-mono text-xl font-semibold tabular-nums ${isComplete ? 'text-positive' : 'text-[var(--ink)]'}`}>
            {monthsCovered.toFixed(1)}<span className="text-sm text-[var(--ink-3)]"> / {targetMonths} mnd</span>
          </p>
        </div>

        {/* Progress bar */}
        <div ref={barRef} className="mt-2 h-[5px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
          <div
            className={`h-full rounded-full ${colors.bar}`}
            style={{ width: hasEntered ? `${pct}%` : '0%', transition: barTransition }}
          />
        </div>

        {/* Amount */}
        <div className="mt-1.5 flex justify-between text-[11px] text-[var(--ink-3)]">
          <MaskedAmount value={currentAmount} tone="kern" />
          <MaskedAmount value={targetAmount} tone="kern" />
        </div>

        {/* Freedom time or complete state */}
        {isComplete ? (
          <p className="mt-1.5 font-serif italic text-[11px] text-positive">
            Noodfonds bereikt — {targetMonths} maanden ademruimte
          </p>
        ) : freedomStr ? (
          <p className="mt-1.5 font-serif italic text-[11px] text-[var(--ink-3)]">
            {freedomStr} vrijheid opgebouwd als vangnet
          </p>
        ) : null}
      </WidgetShell>
    )
  }

  // ── Full: progress bar with milestones + bedrag + berekening + tips ──
  // Milestone positions on the bar
  const milestones = [1, 3, 6].map(m => ({
    months: m,
    pct: targetMonths > 0 ? Math.min((m / targetMonths) * 100, 100) : 0,
    reached: monthsCovered >= m,
    label: `${m}m`,
  }))

  const remaining = Math.max(targetAmount - currentAmount, 0)

  return (
    <WidgetShell module="kern" size={size} kicker="Noodfonds" href={href}>
      {/* Header with icon */}
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 rounded-lg p-2 ${colors.bg}`}>
          <ShieldCheck className={`h-5 w-5 ${colors.text}`} strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`font-mono text-2xl font-semibold tabular-nums ${isComplete ? 'text-positive' : 'text-[var(--ink)]'}`}>
            {monthsCovered.toFixed(1)}<span className="text-base text-[var(--ink-3)]"> / {targetMonths} maanden gedekt</span>
          </p>
          {isComplete && (
            <p className="mt-0.5 text-sm font-medium text-positive">
              Noodfonds bereikt!
            </p>
          )}
        </div>
      </div>

      {/* Progress bar with milestone markers */}
      <div className="mt-3 relative">
        <div ref={barRef} className="h-[8px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
          <div
            className={`h-full rounded-full ${colors.bar}`}
            style={{ width: hasEntered ? `${pct}%` : '0%', transition: barTransition }}
          />
        </div>
        {/* Milestone markers */}
        <div className="relative h-4 mt-0.5">
          {milestones.map(m => (
            <div
              key={m.months}
              className="absolute flex flex-col items-center"
              style={{ left: `${m.pct}%`, transform: 'translateX(-50%)' }}
            >
              <div className={`w-[2px] h-[6px] ${m.reached ? colors.bar : 'bg-[var(--border-md)]'}`} />
              <span className={`text-[9px] font-mono tabular-nums ${m.reached ? colors.text : 'text-[var(--ink-4)]'}`}>
                {m.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Amounts */}
      <div className="mt-1 flex justify-between text-xs text-[var(--ink-3)]">
        <MaskedAmount value={currentAmount} tone="kern" />
        <span>Doel: <MaskedAmount value={targetAmount} tone="kern" /></span>
      </div>

      {/* Calculation explanation */}
      <div className="mt-3 rounded-lg bg-[var(--subtle)] px-3 py-2 text-[11px] text-[var(--ink-3)]">
        <p className="font-medium text-[var(--ink-2)]">Berekening</p>
        <p className="mt-0.5">
          {targetMonths}&times; <MaskedAmount value={monthlyExpenses} tone="kern" /> maanduitgaven = <MaskedAmount value={targetAmount} tone="kern" /> doel
        </p>
        {!isComplete && remaining > 0 && (
          <p className="mt-0.5">
            Nog <MaskedAmount value={remaining} tone="kern" /> te gaan
          </p>
        )}
      </div>

      {/* Tips to reach faster (only when not complete) */}
      {!isComplete && (
        <div className="mt-3 flex items-start gap-2 text-[11px] text-[var(--ink-3)]">
          <Lightbulb className="h-3.5 w-3.5 flex-shrink-0 text-amber-500 mt-0.5" strokeWidth={1.5} />
          <div>
            <p className="font-medium text-[var(--ink-2)]">Sneller bereiken</p>
            <ul className="mt-0.5 space-y-0.5 list-none">
              <li>Automatiseer een vaste storting per maand</li>
              <li>Zet onverwachte meevallers direct opzij</li>
              <li>Begin met 1 maand, bouw stap voor stap op</li>
            </ul>
          </div>
        </div>
      )}

      {/* Freedom time framing */}
      {freedomStr && (
        <p className="mt-2 font-serif italic text-[12px] text-[var(--ink-3)]">
          {isComplete
            ? `${freedomStr} vrijheid als vangnet — financiele rust`
            : `${freedomStr} vrijheid opgebouwd, op weg naar volledige rust`
          }
        </p>
      )}
    </WidgetShell>
  )
})
