import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { Lightbulb } from 'lucide-react'
import type { DashboardData, TopRecommendation } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

const PRIORITY_COLORS: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-amber-500',
  3: 'bg-emerald-500',
}

function RecommendationRow({ rec, index }: { rec: TopRecommendation; index: number }) {
  const days = rec.freedomDaysImpact > 0 ? Math.round(rec.freedomDaysImpact) : null

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-[var(--border-ed)] last:border-0">
      <span className="font-mono text-[10px] text-[var(--ink-4)] w-4 shrink-0 tabular-nums">
        {index + 1}
      </span>
      <span className={`h-2 w-2 rounded-full shrink-0 ${PRIORITY_COLORS[rec.priority] ?? 'bg-[var(--ink-4)]'}`} />
      <span className="flex-1 min-w-0 text-sm text-[var(--ink)] truncate">
        {rec.title}
      </span>
      {days !== null && (
        <span className="shrink-0 font-mono text-xs tabular-nums text-wil-700 bg-wil-50 rounded-full px-2 py-px">
          +{days}d
        </span>
      )}
    </div>
  )
}

function FullRecommendationRow({ rec, index }: { rec: TopRecommendation; index: number }) {
  const days = rec.freedomDaysImpact > 0 ? Math.round(rec.freedomDaysImpact) : null

  return (
    <div className="flex items-center gap-2 py-2 border-b border-[var(--border-ed)] last:border-0">
      <span className="font-mono text-[10px] text-[var(--ink-4)] w-4 shrink-0 tabular-nums">
        {index + 1}
      </span>
      <span className={`h-2 w-2 rounded-full shrink-0 ${PRIORITY_COLORS[rec.priority] ?? 'bg-[var(--ink-4)]'}`} />
      <div className="flex-1 min-w-0">
        <span className="text-sm text-[var(--ink)] truncate block">{rec.title}</span>
        {rec.category && (
          <span className="inline-block mt-0.5 text-[10px] uppercase tracking-wide text-[var(--ink-3)] bg-[var(--subtle)] rounded px-1.5 py-px">
            {rec.category}
          </span>
        )}
      </div>
      {days !== null && (
        <span className="shrink-0 font-mono text-xs tabular-nums text-wil-700 bg-wil-50 rounded-full px-2 py-px">
          +{days}d
        </span>
      )}
    </div>
  )
}

export function VoorstellenWidget({ size, data, href }: Props) {
  const { recommendations, topRecommendations } = data

  const topPriority = topRecommendations?.[0]?.priority ?? null

  // ── Quarter-size: count + icon + priority dot ────
  if (size === 'quarter') {
    return (
      <WidgetShell module="wil" size={size} kicker="Voorstellen" href={href}>
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-wil-500 shrink-0" />
          <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
            {recommendations}
          </p>
          {topPriority != null && (
            <span
              className={`inline-block h-2 w-2 rounded-full shrink-0 ${PRIORITY_COLORS[topPriority] ?? 'bg-[var(--ink-4)]'}`}
              title={`Prioriteit ${topPriority}`}
            />
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
          {recommendations === 1 ? 'aanbeveling' : 'aanbevelingen'}
        </p>
      </WidgetShell>
    )
  }

  // ── Half-size: top-2 recommendations list (compact for 1-row height) ────
  if (size === 'half') {
    const top2 = (topRecommendations ?? []).slice(0, 2)

    return (
      <WidgetShell module="wil" size={size} kicker="Voorstellen" href={href}>
        <div>
          {top2.length === 0 ? (
            <div className="flex items-center justify-center py-2 text-center">
              <p className="font-sans text-sm text-[var(--ink-3)]">Geen aanbevelingen</p>
            </div>
          ) : (
            <div className="space-y-0">
              {top2.map((rec, i) => (
                <RecommendationRow key={rec.id} rec={rec} index={i} />
              ))}
            </div>
          )}
          <p className="mt-1 text-[11px] text-[var(--ink-3)]">
            {recommendations} {recommendations === 1 ? 'aanbeveling' : 'aanbevelingen'}
          </p>
        </div>
      </WidgetShell>
    )
  }

  // ── Full-size: stats row + top-5 with category badges ────
  const top5 = (topRecommendations ?? []).slice(0, 5)
  const totalDaysFull = Math.round(
    (topRecommendations ?? []).reduce((sum, r) => sum + (r.freedomDaysImpact > 0 ? r.freedomDaysImpact : 0), 0)
  )

  return (
    <WidgetShell module="wil" size={size} kicker="Voorstellen" href={href}>
      <div>
        {/* Samenvattingsrij */}
        <div className="grid grid-cols-2 divide-x divide-dashed divide-[var(--border-ed)] border border-dashed border-[var(--border-ed)] rounded-[var(--r)] p-3">
          <div className="flex flex-col items-center pr-3">
            <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">{recommendations}</span>
            <span className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] font-sans mt-0.5 text-center">AANBEVELINGEN</span>
          </div>
          <div className="flex flex-col items-center pl-3">
            <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">{totalDaysFull}</span>
            <span className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] font-sans mt-0.5 text-center leading-tight">DAGEN TE WINNEN</span>
          </div>
        </div>

        {/* Aanbevelingenlijst */}
        <p className="label-editorial text-[var(--ink-3)] mt-4 mb-2">TOP VOORSTELLEN</p>

        {top5.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="font-sans text-sm text-[var(--ink-3)]">Geen aanbevelingen</p>
            <p className="font-serif italic text-[11px] text-[var(--ink-4)] mt-1">Je bent helemaal bij</p>
          </div>
        ) : (
          <div>
            {top5.map((rec, i) => (
              <FullRecommendationRow key={rec.id} rec={rec} index={i} />
            ))}
          </div>
        )}
      </div>
    </WidgetShell>
  )
}
