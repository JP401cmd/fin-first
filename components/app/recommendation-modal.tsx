'use client'

import { useState } from 'react'
import { X, Check, Clock, ArrowRight, Sparkles, Pencil, ArrowLeft } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { BudgetIcon, formatCurrency } from '@/components/app/budget-shared'
import { PostponeForm } from '@/components/app/postpone-form'
import type { Recommendation } from '@/lib/recommendation-data'
import {
  RECOMMENDATION_TYPE_LABELS,
  RECOMMENDATION_TYPE_ICONS,
  getRecommendationTypeColor,
} from '@/lib/recommendation-data'

type RecommendationModalProps = {
  recommendation: Recommendation
  onDecide: (id: string, action: 'accept' | 'reject' | 'postpone', data?: Record<string, unknown>) => Promise<void>
  onClose: () => void
}

type ActionDraft = {
  title: string
  description?: string
  freedom_days_impact: number
  euro_impact_monthly?: number
  enabled: boolean
  editing: boolean
  scheduled_week_offset: number | null
}

function getMonday(offset: number): string {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day // Monday = 1
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff + offset * 7)
  return monday.toISOString().split('T')[0]
}

function formatWeekLabel(offset: number): string {
  const monday = new Date(getMonday(offset))
  const label = monday.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  if (offset === 0) return `Deze week — ${label}`
  if (offset === 1) return `Volgende week — ${label}`
  return `Week ${offset} — ${label}`
}

export function RecommendationModal({ recommendation, onDecide, onClose }: RecommendationModalProps) {
  const [step, setStep] = useState<'detail' | 'accept-flow' | 'postpone' | 'reject'>('detail')
  const [rejectReason, setRejectReason] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [actionDrafts, setActionDrafts] = useState<ActionDraft[]>(() =>
    (recommendation.suggested_actions || []).map((a) => ({
      title: a.title,
      description: a.description,
      freedom_days_impact: a.freedom_days_impact,
      euro_impact_monthly: a.euro_impact_monthly,
      enabled: true,
      editing: false,
      scheduled_week_offset: null,
    }))
  )
  const [applyBudget, setApplyBudget] = useState(true)

  const colors = getRecommendationTypeColor(recommendation.recommendation_type)
  const iconName = RECOMMENDATION_TYPE_ICONS[recommendation.recommendation_type]
  const typeLabel = RECOMMENDATION_TYPE_LABELS[recommendation.recommendation_type]
  const isPostponed = recommendation.status === 'postponed'

  async function handleAction(action: 'accept' | 'reject' | 'postpone', data?: Record<string, unknown>) {
    setIsLoading(true)
    try {
      await onDecide(recommendation.id, action, data)
      onClose()
    } finally {
      setIsLoading(false)
    }
  }

  function handleAcceptFlow() {
    const selectedActions = actionDrafts
      .filter((a) => a.enabled)
      .map((a) => ({
        title: a.title,
        description: a.description,
        freedom_days_impact: a.freedom_days_impact,
        euro_impact_monthly: a.euro_impact_monthly,
        scheduled_week: a.scheduled_week_offset !== null ? getMonday(a.scheduled_week_offset) : null,
      }))

    const data: Record<string, unknown> = { selected_actions: selectedActions }
    if (showBudgetToggle) {
      data.apply_budget = applyBudget
    }

    handleAction('accept', data)
  }

  const showBudgetToggle =
    recommendation.recommendation_type === 'budget_optimization' &&
    recommendation.related_budget_slug != null &&
    recommendation.proposed_value != null

  function updateDraft(index: number, updates: Partial<ActionDraft>) {
    setActionDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...updates } : d)))
  }

  return (
    <BottomSheet open={true} onClose={onClose} title={typeLabel}>
        {step === 'detail' && (
          <>
            {/* Type-badge + priority sparkles row */}
            <div className="flex items-center gap-2 px-6 pt-4">
              <div className={`flex items-center gap-1.5 rounded-full ${colors.bgLight} px-3 py-1`}>
                <BudgetIcon name={iconName} className={`h-3.5 w-3.5 ${colors.text}`} />
                <span className={`text-xs font-medium ${colors.text}`}>{typeLabel}</span>
              </div>
              {recommendation.priority_score != null && recommendation.priority_score > 0 && (
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: recommendation.priority_score }).map((_, i) => (
                    <Sparkles key={i} className="h-3 w-3 text-amber-400" />
                  ))}
                </div>
              )}
            </div>

            {/* Body */}
            <div className="space-y-4 px-6 py-5">
              <h2
                className="text-2xl font-black tracking-[-0.02em] text-[var(--ink)] leading-tight"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >{recommendation.title}</h2>
              <p className="text-sm leading-relaxed text-[var(--ink-2)]">{recommendation.description}</p>

              {/* Freedom days highlight */}
              {recommendation.freedom_days_per_year != null && recommendation.freedom_days_per_year > 0 && (
                <div className="rounded-lg bg-wil-50 p-3 text-center">
                  <div className="text-3xl font-bold text-wil-600">
                    {Math.round(recommendation.freedom_days_per_year)} dagen
                  </div>
                  <div className="text-sm text-wil-500">extra vrijheid per jaar</div>
                </div>
              )}

              {/* Before/after comparison */}
              {recommendation.current_value != null && recommendation.proposed_value != null && (
                <div className="flex items-center justify-center gap-3 text-sm">
                  <span className="rounded-md bg-zinc-100 px-2.5 py-1 font-medium text-[var(--ink-2)]">
                    {formatCurrency(recommendation.current_value)}/mnd
                  </span>
                  <ArrowRight className="h-4 w-4 text-wil-500" />
                  <span className="rounded-md bg-wil-100 px-2.5 py-1 font-medium text-wil-700">
                    {formatCurrency(recommendation.proposed_value)}/mnd
                  </span>
                </div>
              )}

              {/* Euro impact */}
              {recommendation.euro_impact_yearly != null && recommendation.euro_impact_yearly > 0 && (
                <p className="text-center text-xs text-[var(--ink-3)]">
                  Besparing: {formatCurrency(recommendation.euro_impact_monthly || 0)}/mnd ({formatCurrency(recommendation.euro_impact_yearly)}/jaar)
                </p>
              )}

              {/* Suggested actions */}
              {recommendation.suggested_actions && recommendation.suggested_actions.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">Concrete stappen</h4>
                  <ul className="space-y-1.5">
                    {recommendation.suggested_actions.map((action, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[var(--ink-2)]">
                        <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-wil-400" />
                        <span>
                          {action.title}
                          {action.freedom_days_impact > 0 && (
                            <span className="ml-1 text-wil-600">({Math.round(action.freedom_days_impact)} dagen)</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Postponed banner */}
              {isPostponed && recommendation.postponed_until && (
                <div className="rounded-md bg-amber-50 px-3 py-2 text-center text-sm text-amber-700">
                  <Clock className="mr-1 inline h-3.5 w-3.5" />
                  Uitgesteld tot {new Date(recommendation.postponed_until).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="border-t border-[var(--border-ed)] px-6 py-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep('accept-flow')}
                  disabled={isLoading}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-wil-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wil-600 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Accepteren
                </button>
                <button
                  type="button"
                  onClick={() => setStep('postpone')}
                  disabled={isLoading}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-wil-200 px-4 py-2.5 text-sm font-medium text-wil-600 transition-colors hover:bg-wil-50 disabled:opacity-50"
                >
                  <Clock className="h-4 w-4" />
                  Later
                </button>
                <button
                  type="button"
                  onClick={() => setStep('reject')}
                  disabled={isLoading}
                  className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium text-[var(--ink-3)] transition-colors hover:bg-zinc-100 hover:text-[var(--ink-2)] disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}

        {step === 'postpone' && (
          <div className="px-6 py-5">
            <h2 className="mb-4 text-lg font-semibold text-[var(--ink)]">Uitstellen</h2>
            <PostponeForm
              mode="recommendation"
              onSubmit={(data) =>
                handleAction('postpone', { reason: data.reason, postponed_until: data.postponed_until })
              }
              onCancel={() => setStep('detail')}
            />
          </div>
        )}

        {step === 'reject' && (
          <div className="px-6 py-5">
            <h2 className="mb-4 text-lg font-semibold text-[var(--ink)]">Afwijzen</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                  Waarom niet? (optioneel)
                </label>
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Bijv. niet relevant, te moeilijk, doe ik al..."
                  className="w-full rounded-md border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-red-300 focus:outline-none focus:ring-1 focus:ring-red-300"
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
                  onClick={() => setStep('detail')}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--ink-3)] transition-colors hover:bg-zinc-100"
                >
                  Annuleren
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'accept-flow' && (
          <div className="px-6 py-5">
            {/* Section-kicker — title staat al in cascade-header */}
            <div className="mb-4 flex items-center gap-2.5">
              <span
                aria-hidden
                className="inline-block w-7 h-px shrink-0"
                style={{ background: 'var(--module-active-500)' }}
              />
              <span className="text-[10px] uppercase tracking-[0.20em] font-mono text-[var(--module-active-700)]">
                Acties plannen
              </span>
            </div>

            {actionDrafts.length === 0 ? (
              <p className="mb-4 text-sm text-[var(--ink-3)]">Geen concrete stappen gevonden. Je kunt het voorstel toch accepteren.</p>
            ) : (
              <div className="mb-4 space-y-3">
                {actionDrafts.map((draft, index) => (
                  <div key={index} className={`rounded-lg border p-3 transition-colors ${draft.enabled ? 'border-wil-200 bg-wil-50/30' : 'border-[var(--border-ed)] bg-[var(--subtle)] opacity-60'}`}>
                    {/* Row: checkbox + title + impact */}
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={draft.enabled}
                        onChange={(e) => updateDraft(index, { enabled: e.target.checked })}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--border-md)] text-wil-500 focus:ring-wil-500"
                      />
                      <div className="min-w-0 flex-1">
                        {draft.editing ? (
                          <input
                            type="text"
                            value={draft.title}
                            onChange={(e) => updateDraft(index, { title: e.target.value })}
                            onBlur={() => updateDraft(index, { editing: false })}
                            onKeyDown={(e) => { if (e.key === 'Enter') updateDraft(index, { editing: false }) }}
                            autoFocus
                            className="w-full rounded border border-wil-300 bg-[var(--paper)] px-2 py-0.5 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-wil-400"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-zinc-800">{draft.title}</span>
                            <button
                              type="button"
                              onClick={() => updateDraft(index, { editing: true })}
                              className="shrink-0 rounded p-0.5 text-[var(--ink-3)] hover:bg-zinc-200 hover:text-[var(--ink-2)]"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                        {draft.description && (
                          <p className="mt-0.5 text-xs text-[var(--ink-3)]">{draft.description}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        {draft.freedom_days_impact > 0 && (
                          <div className="text-xs font-semibold text-wil-600">{Math.round(draft.freedom_days_impact)} dagen</div>
                        )}
                        {draft.euro_impact_monthly != null && draft.euro_impact_monthly > 0 && (
                          <div className="text-xs text-[var(--ink-3)]">{formatCurrency(draft.euro_impact_monthly)}/mnd</div>
                        )}
                      </div>
                    </div>

                    {/* Week scheduler */}
                    {draft.enabled && (
                      <div className="ml-6 mt-2 space-y-1.5">
                        <label className="flex items-center gap-2 text-xs text-[var(--ink-2)]">
                          <input
                            type="checkbox"
                            checked={draft.scheduled_week_offset !== null}
                            onChange={(e) =>
                              updateDraft(index, { scheduled_week_offset: e.target.checked ? 0 : null })
                            }
                            className="h-3.5 w-3.5 rounded border-[var(--border-md)] text-wil-500 focus:ring-wil-500"
                          />
                          Inplannen
                        </label>
                        {draft.scheduled_week_offset !== null && (
                          <div className="space-y-1">
                            <input
                              type="range"
                              min={0}
                              max={52}
                              value={draft.scheduled_week_offset}
                              onChange={(e) =>
                                updateDraft(index, { scheduled_week_offset: Number(e.target.value) })
                              }
                              className="w-full accent-wil-500"
                            />
                            <div className="text-xs font-medium text-wil-600">
                              {formatWeekLabel(draft.scheduled_week_offset)}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Auto budget adjustment */}
            {showBudgetToggle && (
              <div className="mb-4 rounded-lg border border-wil-200 bg-wil-50/30 p-3">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={applyBudget}
                    onChange={(e) => setApplyBudget(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--border-md)] text-wil-500 focus:ring-wil-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-zinc-800">Budget automatisch aanpassen</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--ink-3)]">
                      <span>{recommendation.related_budget_slug}:</span>
                      <span>{formatCurrency(recommendation.current_value!)}/mnd</span>
                      <ArrowRight className="h-3 w-3 text-wil-500" />
                      <span className="font-medium text-wil-600">{formatCurrency(recommendation.proposed_value!)}/mnd</span>
                    </div>
                  </div>
                </label>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-[var(--border-ed)] pt-4">
              <button
                type="button"
                onClick={() => setStep('detail')}
                className="flex items-center gap-1 text-sm font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Terug
              </button>
              <button
                type="button"
                onClick={handleAcceptFlow}
                disabled={isLoading}
                className="flex items-center gap-1.5 rounded-lg bg-wil-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wil-600 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                Bevestigen & plannen
              </button>
            </div>
          </div>
        )}
    </BottomSheet>
  )
}
