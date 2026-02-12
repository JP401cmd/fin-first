'use client'

import { Clock, Sparkles } from 'lucide-react'
import { BudgetIcon, formatCurrency } from '@/components/app/budget-shared'
import type { Recommendation } from '@/lib/recommendation-data'
import {
  RECOMMENDATION_TYPE_LABELS,
  RECOMMENDATION_TYPE_ICONS,
  getRecommendationTypeColor,
} from '@/lib/recommendation-data'

type RecommendationCardProps = {
  recommendation: Recommendation
  onClick: () => void
}

export function RecommendationCard({ recommendation, onClick }: RecommendationCardProps) {
  const colors = getRecommendationTypeColor(recommendation.recommendation_type)
  const iconName = RECOMMENDATION_TYPE_ICONS[recommendation.recommendation_type]
  const typeLabel = RECOMMENDATION_TYPE_LABELS[recommendation.recommendation_type]
  const isPostponed = recommendation.status === 'postponed'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full cursor-pointer overflow-hidden rounded-xl border ${colors.border} bg-gradient-to-br from-teal-50 via-white to-amber-50/30 px-4 py-3 text-left transition-all hover:shadow-md`}
    >
      <div className="flex items-center gap-3">
        {/* Type icon */}
        <div className={`flex shrink-0 items-center justify-center rounded-lg ${colors.bgLight} p-2`}>
          <BudgetIcon name={iconName} className={`h-4 w-4 ${colors.text}`} />
        </div>

        {/* Title + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {isPostponed && <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
            <h3 className="truncate text-sm font-semibold text-zinc-900">{recommendation.title}</h3>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
            <span className={`font-medium ${colors.text}`}>{typeLabel}</span>
            {recommendation.current_value != null && recommendation.proposed_value != null && (
              <>
                <span>·</span>
                <span>
                  {formatCurrency(recommendation.current_value)} → {formatCurrency(recommendation.proposed_value)}/mnd
                </span>
              </>
            )}
          </div>
        </div>

        {/* Freedom days */}
        {recommendation.freedom_days_per_year != null && recommendation.freedom_days_per_year > 0 && (
          <div className="shrink-0 text-right">
            <div className="text-sm font-bold text-teal-600">
              {Math.round(recommendation.freedom_days_per_year)} dagen
            </div>
          </div>
        )}

        {/* Priority stars */}
        {recommendation.priority_score != null && recommendation.priority_score > 0 && (
          <div className="flex shrink-0 items-center gap-0.5">
            {Array.from({ length: recommendation.priority_score }).map((_, i) => (
              <Sparkles key={i} className="h-3 w-3 text-amber-400" />
            ))}
          </div>
        )}
      </div>
    </button>
  )
}
