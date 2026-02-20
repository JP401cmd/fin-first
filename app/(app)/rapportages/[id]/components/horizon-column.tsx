import type { ReportHorizonSection } from '@/lib/report-data'
import { formatCurrency } from '@/lib/format'
import { SectionKicker } from './section-kicker'
import { Flame, Calendar, TrendingUp } from 'lucide-react'

export function HorizonColumn({ horizon }: { horizon: ReportHorizonSection }) {
  return (
    <div className="space-y-6">
      <SectionKicker module="horizon" title="De Horizon" subtitle="Toekomst" />

      {/* FIRE progress */}
      {(horizon.fireStart || horizon.fireEnd) && (
        <div className="report-section">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="h-4 w-4 text-horizon-600" />
            <span className="font-inter text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">
              FIRE voortgang
            </span>
          </div>

          {horizon.fireStart && horizon.fireEnd && (
            <div className="mb-3">
              <div className="flex items-baseline justify-between mb-1">
                <span className="font-dm-mono text-2xl tabular-nums font-bold text-horizon-700">
                  {horizon.fireEnd.percentage}%
                </span>
                {horizon.fireProgressDelta != null && (
                  <span className={`font-dm-mono text-sm tabular-nums ${horizon.fireProgressDelta >= 0 ? 'text-kern-600' : 'text-red-600'}`}>
                    {horizon.fireProgressDelta >= 0 ? '+' : ''}{horizon.fireProgressDelta}%
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div className="h-2 rounded-full bg-horizon-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-horizon-500 to-horizon-400"
                  style={{ width: `${Math.min(horizon.fireEnd.percentage, 100)}%` }}
                />
              </div>

              <div className="mt-1.5 flex justify-between font-inter text-[10px] text-[var(--ink-4)]">
                <span>Begin: {horizon.fireStart.percentage}%</span>
                <span>Doel: {formatCurrency(horizon.fireEnd.fireTarget)}</span>
              </div>
            </div>
          )}

          {horizon.fireDate && (
            <div className="flex items-center gap-2 text-[var(--ink-2)]">
              <Calendar className="h-3.5 w-3.5 text-horizon-500" />
              <span className="font-inter text-[11px]">
                FIRE-datum: <span className="font-dm-mono font-medium">{horizon.fireDate}</span>
                {horizon.fireAge && (
                  <span className="text-[var(--ink-3)]"> (leeftijd {horizon.fireAge})</span>
                )}
              </span>
            </div>
          )}

          {horizon.monthlyPassiveIncome != null && horizon.monthlyPassiveIncome > 0 && (
            <div className="mt-1 flex items-center gap-2 text-[var(--ink-2)]">
              <TrendingUp className="h-3.5 w-3.5 text-horizon-500" />
              <span className="font-inter text-[11px]">
                Passief inkomen: <span className="font-dm-mono font-medium">{formatCurrency(horizon.monthlyPassiveIncome)}/mnd</span>
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
          <div className="space-y-2">
            {[
              { label: '1 jaar', value: horizon.projectedNetWorth1y },
              { label: '3 jaar', value: horizon.projectedNetWorth3y },
              { label: '5 jaar', value: horizon.projectedNetWorth5y },
            ].filter(p => p.value != null).map(p => (
              <div key={p.label} className="flex items-baseline justify-between">
                <span className="font-inter text-xs text-[var(--ink-2)]">{p.label}</span>
                <span className="font-dm-mono text-xs tabular-nums font-medium text-horizon-700">
                  {formatCurrency(p.value!)}
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
