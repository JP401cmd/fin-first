'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { formatCurrency } from '@/lib/format'
import { TrendingDown, AlertTriangle, ArrowRight } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

type TerSeverity = 'green' | 'orange' | 'red'

function getTerSeverity(weightedTER: number): TerSeverity {
  const pct = weightedTER * 100
  if (pct < 0.3) return 'green'
  if (pct <= 0.8) return 'orange'
  return 'red'
}

const SEVERITY_COLORS: Record<TerSeverity, { dot: string; text: string }> = {
  green:  { dot: 'bg-emerald-500', text: 'text-emerald-600' },
  orange: { dot: 'bg-amber-500',   text: 'text-amber-600' },
  red:    { dot: 'bg-red-500',     text: 'text-red-600' },
}

export const FeeAnalyzerWidget = memo(function FeeAnalyzerWidget({ size, data, href }: Props) {
  const { ref: inViewRef, hasEntered } = useInViewAnimation({ duration: 700 })
  const feeAnalysis = data.feeAnalysis

  // No holdings at all
  if (!feeAnalysis || feeAnalysis.totalPortfolioValue === 0) {
    return (
      <WidgetShell module="kern" size={size} kicker="Kostenanalyse" href={href}>
        <WidgetEmpty icon={TrendingDown} message="Voeg beleggingen toe om je fondskosten te analyseren." />
      </WidgetShell>
    )
  }

  const { weightedTER, totalAnnualFee, perHoldingBreakdown, holdingsWithTER, holdingsWithoutTER } = feeAnalysis
  const totalHoldings = holdingsWithTER + holdingsWithoutTER
  const terCoverage = totalHoldings > 0 ? holdingsWithTER / totalHoldings : 0
  const severity = getTerSeverity(weightedTER)
  const terPctStr = (weightedTER * 100).toFixed(2).replace('.', ',')

  // FIRE impact sentence
  const feeImpactMonths = data.feeImpactMonths ?? 0
  const feeImpactYears = Math.floor(Math.abs(feeImpactMonths) / 12)
  const feeImpactRemainingMonths = Math.abs(feeImpactMonths) % 12
  const fireImpactParts: string[] = []
  if (feeImpactYears > 0) fireImpactParts.push(`${feeImpactYears} jaar`)
  if (feeImpactRemainingMonths > 0) fireImpactParts.push(`${feeImpactRemainingMonths} maand${feeImpactRemainingMonths > 1 ? 'en' : ''}`)
  const fireImpactStr = fireImpactParts.length > 0 ? fireImpactParts.join(' en ') : null

  // Top 3 most expensive holdings
  const top3 = perHoldingBreakdown.filter(h => h.annualFee > 0).slice(0, 3)

  // ── Mini: only weighted TER % with color ──
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Kosten" href={href}>
        <div className="flex items-center gap-2">
          <span className={`inline-block h-3 w-3 rounded-full ${SEVERITY_COLORS[severity].dot}`} />
          <span className={`font-mono tabular-nums text-[12px] font-medium ${SEVERITY_COLORS[severity].text}`}>
            {terPctStr}% TER
          </span>
        </div>
      </WidgetShell>
    )
  }

  // ── Quarter: TER + annual cost ──
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Kostenanalyse" href={href}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${SEVERITY_COLORS[severity].dot}`} />
          <span className={`text-sm font-medium ${SEVERITY_COLORS[severity].text}`}>
            {terPctStr}% gewogen TER
          </span>
        </div>
        <div className="mt-1">
          <p className="text-xs text-[var(--ink-3)]">Jaarlijkse kosten</p>
          <p className="font-mono tabular-nums text-sm font-semibold text-[var(--ink)] mt-0.5">
            {formatCurrency(totalAnnualFee)}
          </p>
        </div>
        {terCoverage < 0.5 && (
          <p className="text-[11px] text-amber-600 mt-1.5 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            <span>TER ontbreekt bij {holdingsWithoutTER} holdings</span>
          </p>
        )}
      </WidgetShell>
    )
  }

  // ── Half: TER + costs + FIRE impact + top 3 expensive holdings ──
  return (
    <WidgetShell module="kern" size={size} kicker="Kostenanalyse" href={href}>
      <div ref={inViewRef}>
        {/* Header: TER indicator */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${SEVERITY_COLORS[severity].dot}`} />
          <span className={`text-sm font-medium ${SEVERITY_COLORS[severity].text}`}>
            {terPctStr}% gewogen TER
          </span>
        </div>

        {/* Annual cost */}
        <div className="mb-2">
          <p className="text-xs text-[var(--ink-3)]">Jaarlijkse fondskosten</p>
          <p className="font-mono tabular-nums text-lg font-semibold text-[var(--ink)] mt-0.5">
            {formatCurrency(totalAnnualFee)}
          </p>
        </div>

        {/* FIRE impact sentence */}
        {fireImpactStr && feeImpactMonths > 0 && (
          <p className="text-xs text-[var(--ink-2)] italic leading-relaxed mb-2">
            Je fondsbeheer kost je {fireImpactStr} vrijheid.
          </p>
        )}

        {/* Top 3 most expensive holdings */}
        {top3.length > 0 && (
          <div className="space-y-1 mt-2">
            <p className="text-[11px] text-[var(--ink-3)] uppercase tracking-wider font-medium">Duurste holdings</p>
            {top3.map((h, i) => {
              const holdingSeverity = getTerSeverity(h.ter)
              return (
                <div
                  key={h.name + i}
                  className="flex items-baseline justify-between text-[11px]"
                  style={{
                    opacity: hasEntered ? 1 : 0,
                    transform: hasEntered ? 'translateY(0)' : 'translateY(4px)',
                    transition: `opacity 400ms ${150 + i * 100}ms ease, transform 400ms ${150 + i * 100}ms ease`,
                  }}
                >
                  <span className="text-[var(--ink-2)] truncate max-w-[55%]">{h.name}</span>
                  <span className={`font-mono tabular-nums ${SEVERITY_COLORS[holdingSeverity].text}`}>
                    {(h.ter * 100).toFixed(2).replace('.', ',')}% · {formatCurrency(h.annualFee)}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* CTA if <50% holdings have TER */}
        {terCoverage < 0.5 && (
          <div className="mt-3 p-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30">
            <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
              <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
              <span>
                Vul de TER in bij je holdings voor een nauwkeuriger beeld.
                <a href="/core/assets" className="inline-flex items-center gap-0.5 ml-1 font-medium text-amber-800 dark:text-amber-300 hover:underline">
                  Aanvullen <ArrowRight className="h-2.5 w-2.5" />
                </a>
              </span>
            </p>
          </div>
        )}
      </div>
    </WidgetShell>
  )
})
