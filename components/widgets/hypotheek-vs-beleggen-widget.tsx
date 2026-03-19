'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { formatCurrency } from '@/lib/format'
import { Home, TrendingUp, Scale, ArrowRight } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const HypotheekVsBeleggenWidget = memo(function HypotheekVsBeleggenWidget({ size, data, href }: Props) {
  const { ref: inViewRef, hasEntered } = useInViewAnimation({ duration: 700 })
  const hvb = data.hvbSummary

  // Null-state: no mortgage
  if (!hvb) {
    return (
      <WidgetShell module="kern" size={size} kicker="Hypotheek vs Beleggen" href={href}>
        <WidgetEmpty icon={Home} message="Voeg een hypotheek toe om aflossen vs beleggen te vergelijken." />
      </WidgetShell>
    )
  }

  const { restschuld, rente, breakevenRendement, aanbeveling, isTaxDeductible } = hvb

  const breakevenPctStr = (breakevenRendement * 100).toFixed(1).replace('.', ',')
  const rentePctStr = rente.toFixed(2).replace('.', ',')

  const adviesLabel = aanbeveling === 'beleggen'
    ? 'Beleggen is voordeliger'
    : aanbeveling === 'aflossen'
      ? 'Extra aflossen is voordeliger'
      : 'Vrijwel gelijkwaardig'

  const adviesColor = aanbeveling === 'beleggen'
    ? 'text-emerald-600'
    : aanbeveling === 'aflossen'
      ? 'text-amber-600'
      : 'text-[var(--ink-3)]'

  const AdviesIcon = aanbeveling === 'beleggen' ? TrendingUp : aanbeveling === 'aflossen' ? Home : Scale

  // ── Quarter: compact summary ──
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Hypotheek vs Beleggen" href={href}>
        <div className="flex items-center gap-2 mb-1.5">
          <AdviesIcon className={`h-4 w-4 ${adviesColor}`} />
          <span className={`text-sm font-medium ${adviesColor}`}>{adviesLabel}</span>
        </div>
        <div className="mt-1">
          <p className="text-xs text-[var(--ink-3)]">Breakeven rendement</p>
          <p className="font-mono tabular-nums text-sm font-semibold text-[var(--ink)] mt-0.5">
            {breakevenPctStr}%
          </p>
        </div>
      </WidgetShell>
    )
  }

  // ── Half (default): full summary ──
  return (
    <WidgetShell module="kern" size={size} kicker="Hypotheek vs Beleggen" href={href}>
      <div ref={inViewRef}>
        {/* Recommendation header */}
        <div className="flex items-center gap-2 mb-2">
          <AdviesIcon className={`h-4 w-4 ${adviesColor}`} />
          <span className={`text-sm font-semibold ${adviesColor}`}>{adviesLabel}</span>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div
            style={{
              opacity: hasEntered ? 1 : 0,
              transform: hasEntered ? 'translateY(0)' : 'translateY(4px)',
              transition: 'opacity 400ms 100ms ease, transform 400ms 100ms ease',
            }}
          >
            <p className="text-xs text-[var(--ink-3)]">Restschuld</p>
            <p className="font-mono tabular-nums text-sm font-semibold text-[var(--ink)] mt-0.5">
              {formatCurrency(restschuld)}
            </p>
          </div>
          <div
            style={{
              opacity: hasEntered ? 1 : 0,
              transform: hasEntered ? 'translateY(0)' : 'translateY(4px)',
              transition: 'opacity 400ms 200ms ease, transform 400ms 200ms ease',
            }}
          >
            <p className="text-xs text-[var(--ink-3)]">Hypotheekrente</p>
            <p className="font-mono tabular-nums text-sm font-semibold text-[var(--ink)] mt-0.5">
              {rentePctStr}%
            </p>
          </div>
        </div>

        {/* Breakeven rendement */}
        <div
          className="p-2.5 rounded-md bg-[var(--subtle)] border border-[var(--border-ed)]"
          style={{
            opacity: hasEntered ? 1 : 0,
            transform: hasEntered ? 'translateY(0)' : 'translateY(4px)',
            transition: 'opacity 400ms 300ms ease, transform 400ms 300ms ease',
          }}
        >
          <p className="text-xs text-[var(--ink-3)] mb-0.5">Breakeven rendement</p>
          <p className="font-mono tabular-nums text-lg font-bold text-[var(--ink)]">
            {breakevenPctStr}%
          </p>
          <p className="text-[11px] text-[var(--ink-3)] leading-snug mt-0.5">
            {aanbeveling === 'beleggen'
              ? 'Je verwacht rendement ligt boven dit punt — beleggen wint.'
              : aanbeveling === 'aflossen'
                ? 'Je verwacht rendement ligt onder dit punt — aflossen wint.'
                : 'Je verwacht rendement ligt dicht bij dit punt.'}
          </p>
        </div>

        {/* Tax deductibility note */}
        {isTaxDeductible && (
          <p
            className="text-[11px] text-[var(--ink-3)] mt-2 italic"
            style={{
              opacity: hasEntered ? 1 : 0,
              transition: 'opacity 400ms 400ms ease',
            }}
          >
            Incl. hypotheekrenteaftrek
          </p>
        )}

        {/* CTA */}
        <div
          className="flex items-center gap-1 mt-2 text-[11px] text-[var(--ink-3)]"
          style={{
            opacity: hasEntered ? 1 : 0,
            transition: 'opacity 400ms 500ms ease',
          }}
        >
          <span>Bekijk volledige vergelijking</span>
          <ArrowRight className="h-3 w-3" />
        </div>
      </div>
    </WidgetShell>
  )
})
