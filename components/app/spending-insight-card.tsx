'use client'

import {
  Calendar, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Activity, Sparkles,
} from 'lucide-react'
import type { SpendingInsight } from '@/lib/spending-patterns'

const ICON_MAP: Record<string, React.ElementType> = {
  'calendar': Calendar,
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  'alert-triangle': AlertTriangle,
  'check-circle': CheckCircle2,
  'activity': Activity,
}

const SEVERITY_STYLES: Record<string, { bg: string; border: string; iconBg: string; iconColor: string; badge: string; badgeBg: string }> = {
  info: {
    bg: 'bg-white',
    border: 'border-blue-100',
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    badge: 'text-blue-700',
    badgeBg: 'bg-blue-50',
  },
  positive: {
    bg: 'bg-white',
    border: 'border-emerald-100',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    badge: 'text-emerald-700',
    badgeBg: 'bg-emerald-50',
  },
  warning: {
    bg: 'bg-white',
    border: 'border-amber-100',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    badge: 'text-amber-700',
    badgeBg: 'bg-amber-50',
  },
}

function SpendingInsightCard({ insight }: { insight: SpendingInsight }) {
  const IconComponent = ICON_MAP[insight.icon] ?? Activity
  const style = SEVERITY_STYLES[insight.severity] ?? SEVERITY_STYLES.info

  const { pattern } = insight
  const hasImpact = pattern.impactDays !== undefined && pattern.impactDays > 0

  return (
    <div
      className={`rounded-xl border ${style.border} ${style.bg} p-4 transition-all hover:shadow-sm`}
      data-testid={`spending-insight-${insight.id}`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${style.iconBg}`}>
          <IconComponent className={`h-5 w-5 ${style.iconColor}`} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-zinc-800">{insight.title}</p>
            {pattern.confidence === 'high' && (
              <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${style.badgeBg} ${style.badge}`}>
                betrouwbaar
              </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-zinc-600">{insight.description}</p>

          {/* Details row */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            {pattern.averageAmount && (
              <span>
                Gem. €{Math.round(pattern.averageAmount).toLocaleString('nl-NL')}/mnd
              </span>
            )}
            {pattern.peakAmount && pattern.averageAmount && pattern.peakAmount !== pattern.averageAmount && (
              <span>
                Piek: €{Math.round(pattern.peakAmount).toLocaleString('nl-NL')}/mnd
              </span>
            )}
            {pattern.monthsAffected && pattern.monthsAffected.length > 0 && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${style.badgeBg} ${style.badge}`}>
                <Calendar className="h-3 w-3" />
                {pattern.monthsAffected.join(', ')}
              </span>
            )}
            {hasImpact && (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-purple-700">
                {pattern.type === 'falling_trend' || pattern.type === 'anomaly_low' || pattern.type === 'seasonal_low'
                  ? `+${pattern.impactDays} vrijheidsdagen`
                  : `${pattern.impactDays} vrijheidsdagen`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Section component for spending pattern insights on De Kern page.
 */
export function SpendingInsightsSection({
  insights,
  dataMonths,
  message,
  isLoading,
}: {
  insights: SpendingInsight[]
  dataMonths: number
  message?: string
  isLoading?: boolean
}) {
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3" data-testid="spending-insights-loading">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 rounded-xl bg-zinc-100" />
        ))}
      </div>
    )
  }

  if (insights.length === 0 && dataMonths < 3) {
    return (
      <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-6 text-center" data-testid="spending-insights-empty">
        <Sparkles className="mx-auto h-8 w-8 text-zinc-300" />
        <p className="mt-2 text-sm font-medium text-zinc-500">Nog niet genoeg data</p>
        <p className="mt-1 text-xs text-zinc-400">
          {message || 'Minimaal 3 maanden transactiehistorie nodig voor patroonanalyse. Blijf je transacties importeren!'}
        </p>
      </div>
    )
  }

  if (insights.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-6 text-center" data-testid="spending-insights-none">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
        <p className="mt-2 text-sm font-medium text-zinc-600">Geen opvallende patronen</p>
        <p className="mt-1 text-xs text-zinc-400">
          Je uitgaven zijn consistent — geen seizoenspieken of trends gedetecteerd.
        </p>
      </div>
    )
  }

  return (
    <div data-testid="spending-insights-list">
      <div className="space-y-3">
        {insights.map(insight => (
          <SpendingInsightCard key={insight.id} insight={insight} />
        ))}
      </div>
      {message && (
        <p className="mt-3 text-center text-xs text-zinc-400" data-testid="spending-insights-message">
          {message}
        </p>
      )}
    </div>
  )
}

export { SpendingInsightCard }
export type { SpendingInsight }
