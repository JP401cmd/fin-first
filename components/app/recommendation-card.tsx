'use client'

import { useState } from 'react'
import { Check, Clock, X, Sparkles, ArrowRight } from 'lucide-react'
import { BudgetIcon, formatCurrency } from '@/components/app/budget-shared'
import { PostponeForm } from '@/components/app/postpone-form'
import type { Recommendation } from '@/lib/recommendation-data'
import {
  RECOMMENDATION_TYPE_LABELS,
  RECOMMENDATION_TYPE_ICONS,
  getRecommendationTypeColor,
} from '@/lib/recommendation-data'

type RecommendationCardProps = {
  recommendation: Recommendation
  onDecide: (id: string, action: 'accept' | 'reject' | 'postpone', data?: Record<string, unknown>) => Promise<void>
}

export function RecommendationCard({ recommendation, onDecide }: RecommendationCardProps) {
  const [expandedAction, setExpandedAction] = useState<'postpone' | 'reject' | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const colors = getRecommendationTypeColor(recommendation.recommendation_type)
  const iconName = RECOMMENDATION_TYPE_ICONS[recommendation.recommendation_type]
  const typeLabel = RECOMMENDATION_TYPE_LABELS[recommendation.recommendation_type]

  async function handleAction(action: 'accept' | 'reject' | 'postpone', data?: Record<string, unknown>) {
    setIsLoading(true)
    try {
      await onDecide(recommendation.id, action, data)
    } finally {
      setIsLoading(false)
    }
  }

  const isPostponed = recommendation.status === 'postponed'

  return (
    <div className={`relative overflow-hidden rounded-xl border ${colors.border} bg-gradient-to-br from-teal-50 via-white to-amber-50/30 p-5 transition-all hover:shadow-md`}>
      {/* Type badge */}
      <div className="mb-3 flex items-center justify-between">
        <div className={`flex items-center gap-2 rounded-full ${colors.bgLight} px-3 py-1`}>
          <BudgetIcon name={iconName} className={`h-3.5 w-3.5 ${colors.text}`} />
          <span className={`text-xs font-medium ${colors.text}`}>{typeLabel}</span>
        </div>
        {recommendation.priority_score && (
          <div className="flex items-center gap-1">
            {Array.from({ length: recommendation.priority_score }).map((_, i) => (
              <Sparkles key={i} className="h-3 w-3 text-amber-400" />
            ))}
          </div>
        )}
      </div>

      {/* Title & description */}
      <h3 className="mb-2 text-lg font-semibold text-zinc-900">{recommendation.title}</h3>
      <p className="mb-4 text-sm leading-relaxed text-zinc-600">{recommendation.description}</p>

      {/* Freedom days highlight */}
      {recommendation.freedom_days_per_year != null && recommendation.freedom_days_per_year > 0 && (
        <div className="mb-4 rounded-lg bg-teal-50 p-3 text-center">
          <div className="text-3xl font-bold text-teal-600">
            {Math.round(recommendation.freedom_days_per_year)} dagen
          </div>
          <div className="text-sm text-teal-500">extra vrijheid per jaar</div>
        </div>
      )}

      {/* Before/after comparison */}
      {recommendation.current_value != null && recommendation.proposed_value != null && (
        <div className="mb-4 flex items-center justify-center gap-3 text-sm">
          <span className="rounded-md bg-zinc-100 px-2.5 py-1 font-medium text-zinc-600">
            {formatCurrency(recommendation.current_value)}/mnd
          </span>
          <ArrowRight className="h-4 w-4 text-teal-500" />
          <span className="rounded-md bg-teal-100 px-2.5 py-1 font-medium text-teal-700">
            {formatCurrency(recommendation.proposed_value)}/mnd
          </span>
        </div>
      )}

      {/* Euro impact */}
      {recommendation.euro_impact_yearly != null && recommendation.euro_impact_yearly > 0 && (
        <p className="mb-4 text-center text-xs text-zinc-500">
          Besparing: {formatCurrency(recommendation.euro_impact_monthly || 0)}/mnd ({formatCurrency(recommendation.euro_impact_yearly)}/jaar)
        </p>
      )}

      {/* Suggested actions */}
      {recommendation.suggested_actions && recommendation.suggested_actions.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Concrete stappen</h4>
          <ul className="space-y-1.5">
            {recommendation.suggested_actions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400" />
                <span>
                  {action.title}
                  {action.freedom_days_impact > 0 && (
                    <span className="ml-1 text-teal-600">({Math.round(action.freedom_days_impact)} dagen)</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Postponed banner */}
      {isPostponed && recommendation.postponed_until && (
        <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-center text-sm text-amber-700">
          <Clock className="mr-1 inline h-3.5 w-3.5" />
          Uitgesteld tot {new Date(recommendation.postponed_until).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      )}

      {/* Action buttons */}
      {(recommendation.status === 'pending' || isPostponed) && !expandedAction && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleAction('accept')}
            disabled={isLoading}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-600 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            Accepteren
          </button>
          <button
            type="button"
            onClick={() => setExpandedAction('postpone')}
            disabled={isLoading}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-teal-200 px-4 py-2 text-sm font-medium text-teal-600 transition-colors hover:bg-teal-50 disabled:opacity-50"
          >
            <Clock className="h-4 w-4" />
            Later
          </button>
          <button
            type="button"
            onClick={() => setExpandedAction('reject')}
            disabled={isLoading}
            className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Postpone inline form */}
      {expandedAction === 'postpone' && (
        <PostponeForm
          mode="recommendation"
          onSubmit={(data) =>
            handleAction('postpone', { reason: data.reason, postponed_until: data.postponed_until })
          }
          onCancel={() => setExpandedAction(null)}
        />
      )}

      {/* Reject inline form */}
      {expandedAction === 'reject' && (
        <div className="mt-3 space-y-3 rounded-lg border border-red-100 bg-red-50/50 p-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Waarom niet? (optioneel)
            </label>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Bijv. niet relevant, te moeilijk, doe ik al..."
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-red-300 focus:outline-none focus:ring-1 focus:ring-red-300"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleAction('reject', { reason: rejectReason })}
              disabled={isLoading}
              className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              Afwijzen
            </button>
            <button
              type="button"
              onClick={() => setExpandedAction(null)}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100"
            >
              Annuleren
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
