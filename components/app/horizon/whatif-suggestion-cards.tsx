'use client'

import { Calendar } from 'lucide-react'
import { Plus, X, Sparkles } from 'lucide-react'

import { LIFE_EVENT_CATALOG } from '@/lib/horizon-data'
import { EVENT_ICONS } from '@/components/app/horizon/log-timeline'
import { MaskedAmount } from '@/components/app/masked-amount'

// SuggestedEvent mirrors the shape returned by the /api/whatif/suggest route (Task 6).
// Defined here to keep the component self-contained until the API route is created.
export interface SuggestedEvent {
  event_type: string
  name: string
  target_age: number | null
  one_time_cost: number
  monthly_cost_change: number
  monthly_income_change: number
  duration_months: number
  explanation: string
}

interface WhatIfSuggestionCardsProps {
  suggestions: SuggestedEvent[]
  loading: boolean
  onAdd: (suggestion: SuggestedEvent) => void
  onDismiss: (index: number) => void
}

export function WhatIfSuggestionCards({
  suggestions,
  loading,
  onAdd,
  onDismiss,
}: WhatIfSuggestionCardsProps) {
  if (!loading && suggestions.length === 0) return null

  return (
    <div className="border border-dashed border-wil-300 bg-wil-50/30 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Sparkles size={12} className="text-wil-600" />
        <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-wil-600">
          Fin suggereert
        </span>
      </div>

      {loading && (
        <div className="space-y-2">
          {[0, 1].map(i => (
            <div key={i} className="animate-pulse bg-wil-50 h-14" />
          ))}
        </div>
      )}

      {suggestions.map((suggestion, index) => {
        const catalog = LIFE_EVENT_CATALOG[suggestion.event_type]
        const iconKey = catalog?.icon ?? 'Calendar'
        // EVENT_ICONS stores pre-rendered ReactNode elements (not component types)
        const icon = EVENT_ICONS[iconKey] ?? <Calendar className="h-4 w-4" />

        const hasOnetime = suggestion.one_time_cost > 0
        const hasMonthly =
          suggestion.monthly_cost_change !== 0 || suggestion.monthly_income_change !== 0

        return (
          <div
            key={`${suggestion.event_type}-${index}`}
            className="flex items-start gap-3 bg-[var(--paper)] border border-[var(--border-ed)] p-3 transition-opacity duration-150"
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center bg-wil-50 text-wil-600">
              {icon}
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-serif text-sm font-semibold text-[var(--ink)] leading-tight">
                {suggestion.name}
              </p>
              <p className="mt-0.5 font-sans text-xs text-[var(--ink-3)] line-clamp-2">
                {suggestion.explanation}
              </p>
              <div className="mt-1 flex flex-wrap gap-2 font-mono tabular-nums text-xs text-[var(--ink-3)]">
                {hasOnetime && (
                  <span>-{<MaskedAmount value={suggestion.one_time_cost} tone="horizon" />}</span>
                )}
                {suggestion.monthly_cost_change > 0 && (
                  <span>-{<MaskedAmount value={suggestion.monthly_cost_change} tone="horizon" />}/mnd</span>
                )}
                {suggestion.monthly_income_change !== 0 && (
                  <span className={suggestion.monthly_income_change > 0 ? 'text-positive' : ''}>
                    {suggestion.monthly_income_change > 0 ? '+' : '-'}
                    {<MaskedAmount value={Math.abs(suggestion.monthly_income_change)} tone="horizon" />}/mnd
                  </span>
                )}
                {suggestion.duration_months > 0 && (
                  <span>{suggestion.duration_months} mnd</span>
                )}
              </div>
            </div>

            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => onAdd(suggestion)}
                className="flex h-8 w-8 items-center justify-center text-wil-600 hover:text-wil-700 hover:bg-wil-50 transition-colors"
                aria-label={`${suggestion.name} toevoegen`}
              >
                <Plus size={16} />
              </button>
              <button
                type="button"
                onClick={() => onDismiss(index)}
                className="flex h-8 w-8 items-center justify-center text-[var(--ink-4)] hover:text-[var(--ink-3)] transition-colors"
                aria-label={`${suggestion.name} negeren`}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
