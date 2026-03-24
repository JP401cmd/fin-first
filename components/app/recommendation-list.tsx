'use client'

import { useState, useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import { WillDots } from '@/components/app/will-dots'
import { RecommendationCard } from '@/components/app/recommendation-card'
import { RecommendationModal } from '@/components/app/recommendation-modal'
import { RecommendationGenerationModal } from '@/components/app/recommendation-generation-modal'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { BudgetIcon } from '@/components/app/budget-shared'
import type { Recommendation, RecommendationType } from '@/lib/recommendation-data'
import {
  RECOMMENDATION_TYPE_LABELS,
  RECOMMENDATION_TYPE_ICONS,
  getRecommendationTypeColor,
} from '@/lib/recommendation-data'

const MAX_VISIBLE = 5

type RecommendationListProps = {
  initialRecommendations: Recommendation[]
  /** When true, hides the internal header (icon + title + count + description). Used when parent renders a unified column header. */
  hideHeader?: boolean
  /** Increment to trigger generation from parent */
  generateTrigger?: number
}

export function RecommendationList({ initialRecommendations, hideHeader, generateTrigger }: RecommendationListProps) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>(initialRecommendations)
  useEffect(() => { setRecommendations(initialRecommendations) }, [initialRecommendations])
  const [error, setError] = useState<string | null>(null)
  const [selectedRec, setSelectedRec] = useState<Recommendation | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [generationModalOpen, setGenerationModalOpen] = useState(false)

  // Allow parent to trigger generation via counter prop
  useEffect(() => {
    if (generateTrigger && generateTrigger > 0) {
      setGenerationModalOpen(true)
    }
  }, [generateTrigger])

  function openGenerationModal() {
    setError(null)
    setGenerationModalOpen(true)
  }

  function handleNewRecommendations(recs: Recommendation[]) {
    setRecommendations((prev) => [...recs, ...prev])
  }

  async function handleDecide(id: string, action: 'accept' | 'reject' | 'postpone', data?: Record<string, unknown>) {
    const res = await fetch(`/api/ai/recommendations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data }),
    })

    if (!res.ok) return

    setRecommendations((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        if (action === 'accept') return { ...r, status: 'accepted' as const }
        if (action === 'reject') return { ...r, status: 'rejected' as const }
        if (action === 'postpone') {
          return {
            ...r,
            status: 'postponed' as const,
            postponed_until: (data?.postponed_until as string) || null,
          }
        }
        return r
      })
    )

    setSelectedRec(null)
  }

  const pending = recommendations.filter(
    (r) => r.status === 'pending' ||
      (r.status === 'postponed' && r.postponed_until && new Date(r.postponed_until) <= new Date())
  )

  const visible = pending.slice(0, MAX_VISIBLE)
  const hasMore = pending.length > MAX_VISIBLE

  // --- Header (shared between empty + filled state) ---
  const header = (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-wil-500" />
          <h2 className="text-sm font-semibold text-[var(--ink)]">Voorstellen</h2>
          <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--subtle)] px-1.5 font-mono text-[10px] font-bold tabular-nums text-[var(--ink-3)]">
            {pending.length}
          </span>
        </div>
        {pending.length > 0 && (
          <button
            type="button"
            onClick={openGenerationModal}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] bg-transparent px-2.5 py-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)] hover:bg-[var(--subtle)] disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Analyseren</span>
          </button>
        )}
      </div>
      <p className="mt-1.5 text-xs text-[var(--ink-3)]">
        Persoonlijke aanbevelingen op basis van je financiele profiel
      </p>
    </div>
  )

  // --- Empty state ---
  if (pending.length === 0 && !generationModalOpen) {
    return (
      <div className="space-y-4">
        {!hideHeader && header}
        <div className="py-6 text-center">
          <div className="mx-auto mb-3 flex justify-center">
            <WillDots size={40} />
          </div>
          <p className="mb-4 font-serif text-sm text-[var(--ink-3)]">
            Will analyseert je profiel en ontdekt verborgen vrijheidsdagen.
          </p>
          {error && (
            <p className="mb-3 text-xs text-red-600">{error}</p>
          )}
          <button
            type="button"
            onClick={openGenerationModal}
            className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-xs font-semibold text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)] hover:bg-[var(--subtle)] disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Analyseren
          </button>
        </div>

        {/* Generation modal */}
        <RecommendationGenerationModal
          open={generationModalOpen}
          onClose={() => setGenerationModalOpen(false)}
          onNewRecommendations={handleNewRecommendations}
        />
      </div>
    )
  }

  // --- Filled state ---
  return (
    <div className="space-y-4">
      {!hideHeader && header}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* Visible recommendation cards (max 5, compact) */}
      <div className="space-y-2">
        {visible.map((rec) => (
          <RecommendationCard
            key={rec.id}
            recommendation={rec}
            compact
            onClick={() => setSelectedRec(rec)}
          />
        ))}
      </div>

      {/* "Bekijk alle" link when more than 5 */}
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full rounded-[var(--r)] py-2 text-center text-xs font-medium text-wil-600 transition-colors hover:bg-wil-50"
        >
          Bekijk alle {pending.length} voorstellen
        </button>
      )}

      {/* BottomSheet with all recommendations, grouped by type */}
      <BottomSheet
        open={showAll}
        onClose={() => setShowAll(false)}
        title="Alle voorstellen"
        size="lg"
      >
        <div className="px-5 pb-6 pt-2">
          <p className="mb-5 text-sm text-[var(--ink-3)]">
            {pending.length} openstaande {pending.length === 1 ? 'aanbeveling' : 'aanbevelingen'} op basis van je financiele profiel
          </p>
          <div className="space-y-6">
            {(Object.keys(RECOMMENDATION_TYPE_LABELS) as RecommendationType[])
              .map((type) => {
                const group = pending.filter((r) => r.recommendation_type === type)
                if (group.length === 0) return null
                const colors = getRecommendationTypeColor(type)
                const iconName = RECOMMENDATION_TYPE_ICONS[type]
                return (
                  <div key={type}>
                    <div className="mb-2 flex items-center gap-2">
                      <div className={`flex items-center justify-center rounded-md ${colors.bgLight} p-1`}>
                        <BudgetIcon name={iconName} className={`h-3.5 w-3.5 ${colors.text}`} />
                      </div>
                      <h4 className="text-xs font-semibold text-[var(--ink-2)]">
                        {RECOMMENDATION_TYPE_LABELS[type]}
                      </h4>
                      <span className="font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
                        {group.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {group.map((rec) => (
                        <RecommendationCard
                          key={rec.id}
                          recommendation={rec}
                          onClick={() => { setShowAll(false); setSelectedRec(rec) }}
                        />
                      ))}
                    </div>
                  </div>
                )
              })
              .filter(Boolean)}
          </div>
        </div>
      </BottomSheet>

      {/* Detail modal */}
      {selectedRec && (
        <RecommendationModal
          recommendation={selectedRec}
          onDecide={handleDecide}
          onClose={() => setSelectedRec(null)}
        />
      )}

      {/* Generation modal */}
      <RecommendationGenerationModal
        open={generationModalOpen}
        onClose={() => setGenerationModalOpen(false)}
        onNewRecommendations={handleNewRecommendations}
      />
    </div>
  )
}
