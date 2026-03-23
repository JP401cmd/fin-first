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

  // ── Mini: advies label (Aflossen / Beleggen / Gelijk) ──
  if (size === 'mini') {
    const miniLabel = aanbeveling === 'beleggen'
      ? 'Beleggen'
      : aanbeveling === 'aflossen'
        ? 'Aflossen'
        : 'Gelijk'
    return (
      <WidgetShell module="kern" size="mini" kicker="Hyp. vs Beleggen" href={href}>
        <div className="flex items-center gap-2">
          <AdviesIcon className={`h-3.5 w-3.5 ${adviesColor}`} />
          <span className={`text-[12px] font-medium truncate ${adviesColor}`}>{miniLabel}</span>
        </div>
      </WidgetShell>
    )
  }

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

  // ── Half: full summary ──
  if (size === 'half') {
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
  }

  // ── Full (default): complete comparison with 10-year scenario ──
  // Simple 10-year projection: invest restschuld at expected return vs pay off at rente
  const years = 10
  // Assume breakevenRendement approximates the after-tax cost of the mortgage;
  // use a reasonable expected return of breakeven + 2% for beleggen scenario,
  // but cap it to show realistic numbers based on available data
  const expectedReturn = breakevenRendement + 0.02
  const beleggenWaarde = restschuld * Math.pow(1 + expectedReturn, years)
  const aflossenBesparing = restschuld * rente / 100 * years // Total interest saved over 10 years (simplified linear)
  const beleggenWinst = beleggenWaarde - restschuld
  const verschil = beleggenWinst - aflossenBesparing

  return (
    <WidgetShell module="kern" size={size} kicker="Hypotheek vs Beleggen" href={href}>
      <div ref={inViewRef}>
        {/* Recommendation header */}
        <div className="flex items-center gap-2 mb-2">
          <AdviesIcon className={`h-4 w-4 ${adviesColor}`} />
          <span className={`text-sm font-semibold ${adviesColor}`}>{adviesLabel}</span>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-3 mb-2">
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

        {/* Breakeven rendement card */}
        <div
          className="p-2 rounded-md bg-[var(--subtle)] border border-[var(--border-ed)] mb-2"
          style={{
            opacity: hasEntered ? 1 : 0,
            transform: hasEntered ? 'translateY(0)' : 'translateY(4px)',
            transition: 'opacity 400ms 300ms ease, transform 400ms 300ms ease',
          }}
        >
          <p className="text-xs text-[var(--ink-3)] mb-0.5">Breakeven rendement</p>
          <p className="font-mono tabular-nums text-base font-bold text-[var(--ink)]">
            {breakevenPctStr}%
          </p>
        </div>

        {/* 10-year scenario comparison */}
        <div
          className="border border-[var(--border-ed)] rounded-md overflow-hidden mb-2"
          style={{
            opacity: hasEntered ? 1 : 0,
            transition: 'opacity 400ms 400ms ease',
          }}
        >
          <div className="text-[10px] uppercase tracking-wider font-medium text-[var(--ink-3)] bg-[var(--subtle)] px-2 py-1 border-b border-[var(--border-ed)]">
            10-jaar scenario
          </div>
          <div className="px-2 py-1.5 space-y-1">
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="text-[var(--ink-2)] flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-emerald-500" />
                Beleggen
              </span>
              <span className="font-mono tabular-nums text-emerald-600 font-medium">
                +{formatCurrency(beleggenWinst)}
              </span>
            </div>
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="text-[var(--ink-2)] flex items-center gap-1">
                <Home className="h-3 w-3 text-amber-500" />
                Aflossen
              </span>
              <span className="font-mono tabular-nums text-amber-600 font-medium">
                +{formatCurrency(aflossenBesparing)}
              </span>
            </div>
            <div className="border-t border-[var(--border-ed)] pt-1 flex items-baseline justify-between text-[11px]">
              <span className="text-[var(--ink-3)]">Verschil</span>
              <span className={`font-mono tabular-nums font-semibold ${verschil >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {verschil >= 0 ? '+' : ''}{formatCurrency(verschil)}
              </span>
            </div>
          </div>
        </div>

        {/* Tax deductibility note */}
        {isTaxDeductible && (
          <p
            className="text-[11px] text-[var(--ink-3)] italic"
            style={{
              opacity: hasEntered ? 1 : 0,
              transition: 'opacity 400ms 500ms ease',
            }}
          >
            Incl. hypotheekrenteaftrek — netto kosten zijn lager.
          </p>
        )}

        {/* CTA */}
        <div
          className="flex items-center gap-1 mt-1.5 text-[11px] text-[var(--ink-3)]"
          style={{
            opacity: hasEntered ? 1 : 0,
            transition: 'opacity 400ms 600ms ease',
          }}
        >
          <span>Bekijk volledige vergelijking</span>
          <ArrowRight className="h-3 w-3" />
        </div>
      </div>
    </WidgetShell>
  )
})
