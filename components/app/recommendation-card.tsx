'use client'

import { Clock, Landmark, CreditCard, ArrowUpDown, Receipt, type LucideIcon } from 'lucide-react'
import { BudgetIcon } from '@/components/app/budget-shared'
import type { Recommendation } from '@/lib/recommendation-data'
import {
  RECOMMENDATION_TYPE_LABELS,
  RECOMMENDATION_TYPE_ICONS,
  getRecommendationTypeColor,
} from '@/lib/recommendation-data'
import { tagToLever, type LeverId } from '@/lib/lever-mapping'

// ── Lever icon config (consistent with kompas) ────────────────────────────────

const LEVER_ICON: Record<LeverId, LucideIcon> = {
  assets: Landmark,
  debts: CreditCard,
  cashflow: ArrowUpDown,
  tax: Receipt,
}

const LEVER_TOOLTIP: Record<LeverId, string> = {
  assets: 'Bezittingen',
  debts: 'Schulden',
  cashflow: 'Cashflow',
  tax: 'Belasting',
}

type RecommendationCardProps = {
  recommendation: Recommendation
  onClick: () => void
  /** Show only icon + title (used in the column view) */
  compact?: boolean
}

export function RecommendationCard({ recommendation, onClick, compact }: RecommendationCardProps) {
  const colors = getRecommendationTypeColor(recommendation.recommendation_type)
  const iconName = RECOMMENDATION_TYPE_ICONS[recommendation.recommendation_type]
  const typeLabel = RECOMMENDATION_TYPE_LABELS[recommendation.recommendation_type]
  const isPostponed = recommendation.status === 'postponed'

  // Lever icon (consistent with kompas)
  const leverId = tagToLever(recommendation.recommendation_type)
  const LeverIcon = LEVER_ICON[leverId]
  const leverTooltip = LEVER_TOOLTIP[leverId]

  // Map bg color class to border-l color class (e.g. "bg-wil-500" → "border-l-wil-500")
  const borderLeftColor = colors.bg.replace('bg-', 'border-l-')

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full cursor-pointer overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] border-l-4 ${borderLeftColor} bg-[var(--paper)] px-3 py-2.5 text-left transition-all duration-150 ease-in-out hover:border-[var(--border-md)] hover:-translate-y-px`}
    >
      <div className="flex items-center gap-2.5">
        {/* Type icon */}
        <div className={`flex shrink-0 items-center justify-center rounded-md ${colors.bgLight} p-1.5`}>
          <BudgetIcon name={iconName} className={`h-4 w-4 ${colors.text}`} />
        </div>

        {/* Title + lever icon */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isPostponed && <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
          <h3 className="truncate text-sm font-semibold text-[var(--ink)]">{recommendation.title}</h3>
          <span title={leverTooltip} className="shrink-0 text-[var(--ink-4)]">
            <LeverIcon className="h-3 w-3" />
          </span>
        </div>

        {!compact && (
          <>
            {/* Type label */}
            <span className={`shrink-0 text-xs font-medium ${colors.text}`}>{typeLabel}</span>

            {/* Freedom days */}
            {recommendation.freedom_days_per_year != null && recommendation.freedom_days_per_year > 0 && (
              <div className="shrink-0 text-right">
                <div className="text-sm">
                  <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">{Math.round(recommendation.freedom_days_per_year)}</span>{' '}
                  <span className="font-serif italic text-[var(--ink-3)]">dagen</span>
                </div>
              </div>
            )}

            {/* Priority indicator: filled dot (high), outline dot (medium), nothing (low) */}
            {recommendation.priority_score != null && recommendation.priority_score >= 2 && (
              <div className="shrink-0" title="Hoge prioriteit">
                <div className="h-2 w-2 rounded-full bg-wil-500" />
              </div>
            )}
            {recommendation.priority_score != null && recommendation.priority_score === 1 && (
              <div className="shrink-0" title="Medium prioriteit">
                <div className="h-2 w-2 rounded-full border border-wil-400" />
              </div>
            )}
          </>
        )}
      </div>
    </button>
  )
}
