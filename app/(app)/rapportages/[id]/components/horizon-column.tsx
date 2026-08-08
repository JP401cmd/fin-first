'use client'

import { useCallback } from 'react'
import type { ReportHorizonSection } from '@/lib/report-data'
import { formatMaskedCurrency } from '@/lib/format'
import { formatFireAge } from '@/lib/horizon/fire-format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { useResolvedModuleColor } from '@/lib/hooks/use-resolved-module-color'
import { SectionLabel } from '@/components/editorial'
import { ReportSparkline } from './report-sparkline'
import { Flame, Calendar, TrendingUp } from 'lucide-react'

/**
 * euro-view: exempt (D13) — een rapportage is een GEDEELD artefact. Twee
 * mensen die hetzelfde rapport openen (of dezelfde PDF naast elkaar leggen)
 * moeten dezelfde bedragen zien; die mogen niet afhangen van de
 * weergavevoorkeur van wie op "exporteren" drukte. Rapportage, de deelbare
 * freedom-card en de briefing tonen daarom ALTIJD nominaal (toekomstige
 * euro's), met de grondslag in de tekst — ongeacht `profiles.euro_view`.
 * Bewuste uitzondering op de app-brede schakelaar, geen omissie.
 */
export function HorizonColumn({
  horizon,
  accentColor = '#c4a06b',
}: {
  horizon: ReportHorizonSection
  /** Hex-fallback for the sparkline stroke. See `useResolvedModuleColor` notes. */
  accentColor?: string
}) {
  const { masked } = useMaskedAmounts()
  const fc = useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
  const resolvedAccent = useResolvedModuleColor('--module-active-700', accentColor)
  const resolvedThreshold = useResolvedModuleColor('--module-active-500', accentColor)

  return (
    <div className="space-y-6">
      <SectionLabel num="iii.">Toekomst</SectionLabel>

      {/* FIRE progress */}
      {(horizon.fireStart || horizon.fireEnd) && (
        <div className="report-section">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="h-4 w-4 text-[var(--module-active-700)]" />
            <span className="font-inter text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">
              FIRE voortgang
            </span>
          </div>

          {horizon.fireStart && horizon.fireEnd && (
            <div className="mb-3">
              <div className="flex items-baseline justify-between mb-1">
                <span className="font-dm-mono text-2xl tabular-nums font-bold text-[var(--module-active-700)]">
                  {horizon.fireEnd.percentage}%
                </span>
                {horizon.fireProgressDelta != null && (
                  <span className={`font-dm-mono text-sm tabular-nums ${horizon.fireProgressDelta >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                    {horizon.fireProgressDelta >= 0 ? '+' : ''}{horizon.fireProgressDelta}%
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div className="h-2 rounded-full bg-[var(--module-active-100)]/40 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--module-active-500)] to-[var(--module-active-300)]"
                  style={{ width: `${Math.min(horizon.fireEnd.percentage, 100)}%` }}
                />
              </div>

              <div className="mt-1.5 flex justify-between font-inter text-[10px] text-[var(--ink-4)]">
                <span>Begin: {horizon.fireStart.percentage}%</span>
                <span>Doel: {fc(horizon.fireEnd.fireTarget)}</span>
              </div>
            </div>
          )}

          {horizon.fireDate && (
            <div className="flex items-center gap-2 text-[var(--ink-2)]">
              <Calendar className="h-3.5 w-3.5 text-[var(--module-active-500)]" />
              <span className="font-inter text-[11px]">
                FIRE-datum: <span className="font-dm-mono font-medium">{horizon.fireDate}</span>
                {horizon.fireAge && (
                  <span className="text-[var(--ink-3)]"> (leeftijd {formatFireAge(horizon.fireAge)})</span>
                )}
              </span>
            </div>
          )}

          {horizon.monthlyPassiveIncome != null && horizon.monthlyPassiveIncome > 0 && (
            <div className="mt-1 flex items-center gap-2 text-[var(--ink-2)]">
              <TrendingUp className="h-3.5 w-3.5 text-[var(--module-active-500)]" />
              <span className="font-inter text-[11px]">
                Passief inkomen: <span className="font-dm-mono font-medium">{fc(horizon.monthlyPassiveIncome)}/mnd</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Projections */}
      {(horizon.projectedNetWorth1y || horizon.projectedNetWorth3y || horizon.projectedNetWorth5y) && (
        <div className="report-section">
          <p className="report-kicker font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] mb-3">
            Projectie
          </p>

          {/* Projection sparkline chart */}
          {horizon.projectionPoints && horizon.projectionPoints.length >= 2 && (() => {
            const values = horizon.projectionPoints.map(p => p.netWorth)
            // Year boundary markers (every 12 months in the filtered-to-every-2nd-month array)
            const yearMarkers = [6, 12, 18, 24, 30]
              .filter(i => i < values.length)
              .map(i => ({ index: i, label: `${Math.round(horizon.projectionPoints[i].month / 12)}j` }))
            const fireTarget = horizon.fireEnd?.fireTarget

            return (
              <ReportSparkline
                values={values}
                color={resolvedAccent}
                height={80}
                showFill={true}
                thresholdValue={fireTarget && fireTarget > 0 ? fireTarget : undefined}
                thresholdColor={resolvedThreshold}
                markers={yearMarkers}
                className="mb-3"
              />
            )
          })()}

          {/* Scalar annotations */}
          <div className="flex justify-between border-t border-dotted border-[var(--rule-soft)] pt-2">
            {[
              { label: '1j', value: horizon.projectedNetWorth1y },
              { label: '3j', value: horizon.projectedNetWorth3y },
              { label: '5j', value: horizon.projectedNetWorth5y },
            ].filter(p => p.value != null).map(p => (
              <div key={p.label} className="text-center">
                <span className="block font-inter text-[10px] text-[var(--ink-3)]">{p.label}</span>
                <span className="font-dm-mono text-xs tabular-nums font-medium text-[var(--module-active-700)]">
                  {fc(p.value!)}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 font-inter text-[10px] text-[var(--ink-4)]">
            Op basis van 7% jaarlijks rendement en huidig spaarpatroon
          </p>
        </div>
      )}
    </div>
  )
}
