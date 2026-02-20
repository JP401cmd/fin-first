import type { ReportWilSection } from '@/lib/report-data'
import { SectionKicker } from './section-kicker'
import { ReportSparkline } from './report-sparkline'
import { CheckCircle2, AlertTriangle, Info, TrendingUp, Target } from 'lucide-react'

export function WilColumn({ wil }: { wil: ReportWilSection }) {
  return (
    <div className="space-y-6">
      <SectionKicker module="wil" title="De Wil" subtitle="Acties & Inzichten" />

      {/* Actions completed */}
      <div className="report-section">
        <div className="flex items-baseline justify-between mb-1">
          <span className="font-inter text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">Acties voltooid</span>
          <span className="font-dm-mono text-lg tabular-nums font-bold text-wil-600">{wil.actionsCompleted}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="font-inter text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">Vrijheidsdagen gewonnen</span>
          <span className="font-dm-mono text-lg tabular-nums font-bold text-wil-600">{wil.freedomDaysWon}</span>
        </div>

        {/* Vrijheidsdagen sparkline */}
        {wil.freedomDaysByPeriod.length >= 2 && (
          <ReportSparkline
            values={wil.freedomDaysByPeriod.map(p => p.days)}
            color="#3d3048"
            height={40}
            showFill={true}
            className="mt-2"
          />
        )}

        {wil.topActions.length > 0 && (
          <div className="mt-3 space-y-1.5 border-t border-dashed border-[var(--border-ed)] pt-3">
            {wil.topActions.slice(0, 3).map(a => (
              <div key={a.id} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-wil-500" />
                <span className="font-inter text-[11px] text-[var(--ink-2)] leading-snug">{a.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Spending insights */}
      {wil.spendingInsights.length > 0 && (
        <div className="report-section">
          <p className="report-kicker font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] mb-3">
            Inzichten
          </p>
          <div className="space-y-2.5">
            {wil.spendingInsights.map(insight => {
              const Icon = insight.severity === 'warning' ? AlertTriangle
                : insight.severity === 'positive' ? TrendingUp
                  : Info
              const iconColor = insight.severity === 'warning' ? 'text-amber-500'
                : insight.severity === 'positive' ? 'text-kern-500'
                  : 'text-[var(--ink-3)]'

              return (
                <div key={insight.id} className="flex items-start gap-2">
                  <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${iconColor}`} />
                  <div>
                    <p className="font-inter text-[11px] font-medium text-[var(--ink)]">{insight.title}</p>
                    <p className="font-inter text-[10px] text-[var(--ink-3)] leading-snug">{insight.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Goals */}
      {wil.goalsProgress.length > 0 && (
        <div className="report-section">
          <p className="report-kicker font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] mb-3">
            Doelen
          </p>
          <div className="space-y-3">
            {wil.goalsProgress.map(g => (
              <div key={g.id}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="font-inter text-[11px] text-[var(--ink-2)]">{g.name}</span>
                  <span className="font-dm-mono text-[11px] tabular-nums text-[var(--ink-3)]">{g.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-wil-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-wil-500 transition-all"
                    style={{ width: `${Math.min(g.pct, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Badges */}
      {wil.badgesEarned.length > 0 && (
        <div className="report-section">
          <p className="report-kicker font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] mb-3">
            Badges
          </p>
          <div className="flex flex-wrap gap-2">
            {wil.badgesEarned.map(b => (
              <span
                key={b.slug}
                className="inline-flex items-center gap-1 rounded-full bg-wil-50 px-2.5 py-1 font-inter text-[10px] font-medium text-wil-700 border border-wil-200"
              >
                {b.icon && <span className="text-xs">{b.icon}</span>}
                {b.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
