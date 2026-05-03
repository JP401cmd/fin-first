'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowRight, Clock, X, RefreshCw, Loader2 } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { WillDots } from '@/components/app/will-dots'
import { RecommendationCard } from '@/components/app/recommendation-card'
import { RecommendationModal } from '@/components/app/recommendation-modal'
import { PostponeForm } from '@/components/app/postpone-form'
import { BudgetIcon, formatCurrency } from '@/components/app/budget-shared'
import type { Recommendation } from '@/lib/recommendation-data'
import {
  RECOMMENDATION_TYPE_LABELS,
  RECOMMENDATION_TYPE_ICONS,
  getRecommendationTypeColor,
} from '@/lib/recommendation-data'

const EXPECTED_COUNT = 3
const POLL_INTERVAL_MS = 2000

const GENERATING_MESSAGES = [
  'Je financi\u00eble profiel analyseren\u2026',
  'Besparingsmogelijkheden zoeken\u2026',
  'Vrijheidsdagen berekenen\u2026',
  'Voorstellen samenstellen\u2026',
]

type Phase = 'generating' | 'results' | 'error'

type GenerationModalProps = {
  open: boolean
  onClose: () => void
  onNewRecommendations: (recs: Recommendation[]) => void
}

/* ── Segmented progress bar ─────────────────────────────── */

function SegmentedProgress({ count, total }: { count: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${
              i < count ? 'bg-wil-500' : 'bg-[var(--subtle)]'
            }`}
          />
        ))}
      </div>
      <span className="font-mono text-xs tabular-nums text-[var(--ink-3)]">
        {count}/{total}
      </span>
    </div>
  )
}

/* ── Skeleton card (matches RecommendationCard layout) ─── */

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-[var(--r-lg)] border border-[var(--border-ed)] border-l-4 border-l-wil-200 bg-[var(--paper)] px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="h-7 w-7 shrink-0 rounded-full bg-wil-100" />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="h-3.5 w-2/5 rounded bg-[var(--border-ed)]" />
          <div className="h-3 w-16 rounded bg-[var(--subtle)]" />
        </div>
        <div className="h-3.5 w-14 rounded bg-wil-100/60" />
      </div>
    </div>
  )
}

/* ── Newspaper primitives ────────────────────────────────── */

function Masthead() {
  const today = new Date()
  const dateStr = today.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
        <span>{dateStr}</span>
        <span>Will Analyse</span>
      </div>
      <div className="mt-1.5 border-t-2 border-b border-[var(--ink)] py-1">
        <p className="text-center font-display text-[13px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
          Nieuwe Voorstellen
        </p>
      </div>
    </div>
  )
}

function ArticleRule() {
  return <div className="my-1 border-t border-[var(--border-ed)]" />
}

/* ── Newspaper article for a single recommendation ─────── */

function ArticleCard({
  rec,
  index,
  isDecided,
  isInlineTarget,
  inlineType,
  actionLoading,
  rejectReason,
  onView,
  onPostpone,
  onReject,
  onDecide,
  onCancelInline,
  onRejectReasonChange,
}: {
  rec: Recommendation
  index: number
  isDecided: boolean
  isInlineTarget: boolean
  inlineType?: 'postpone' | 'reject'
  actionLoading: boolean
  rejectReason: string
  onView: () => void
  onPostpone: () => void
  onReject: () => void
  onDecide: (action: 'reject' | 'postpone', data?: Record<string, unknown>) => void
  onCancelInline: () => void
  onRejectReasonChange: (value: string) => void
}) {
  const colors = getRecommendationTypeColor(rec.recommendation_type)
  const iconName = RECOMMENDATION_TYPE_ICONS[rec.recommendation_type]
  const typeLabel = RECOMMENDATION_TYPE_LABELS[rec.recommendation_type]
  const borderColor = colors.bg.replace('bg-', 'border-l-')

  const hasFreedomDays = rec.freedom_days_per_year != null && rec.freedom_days_per_year > 0
  const hasEuroImpact = rec.euro_impact_yearly != null && rec.euro_impact_yearly > 0

  return (
    <div
      className={`transition-all duration-300 ${
        isDecided ? 'max-h-0 overflow-hidden opacity-0' : 'max-h-[800px] opacity-100'
      }`}
    >
      <article className={`border-l-2 ${borderColor} pl-4`}>
        {/* Article number + category badge */}
        <div className="mb-2 flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold tabular-nums text-[var(--ink-4)]">
            {String(index + 1).padStart(2, '0')}
          </span>
          <div className={`flex items-center gap-1 rounded-full ${colors.bgLight} px-2 py-0.5`}>
            <BudgetIcon name={iconName} className={`h-3 w-3 ${colors.text}`} />
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${colors.text}`}>
              {typeLabel}
            </span>
          </div>
        </div>

        {/* Headline — clickable to view details */}
        <button
          type="button"
          onClick={onView}
          className="w-full text-left"
        >
          <h3 className="font-display text-[17px] font-bold leading-snug tracking-tight text-[var(--ink)] sm:text-[19px]">
            {rec.title}
          </h3>
        </button>

        {/* Description as byline */}
        <p className="mt-1.5 font-serif text-[13px] leading-relaxed text-[var(--ink-3)]">
          {rec.description}
        </p>

        {/* Impact stats — ledger row style */}
        {(hasFreedomDays || hasEuroImpact) && (
          <div className="mt-3 flex items-baseline gap-4 border-y border-dotted border-[var(--border-ed)] py-2">
            {hasFreedomDays && (
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-base font-bold tabular-nums text-wil-600">
                  {Math.round(rec.freedom_days_per_year!)}
                </span>
                <span className="font-serif text-[12px] italic text-[var(--ink-3)]">
                  dagen extra vrijheid/jaar
                </span>
              </div>
            )}
            {hasEuroImpact && (
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {formatCurrency(rec.euro_impact_yearly!)}
                </span>
                <span className="font-serif text-[12px] italic text-[var(--ink-3)]">
                  /jaar
                </span>
              </div>
            )}
          </div>
        )}

        {/* Action buttons — editorial style */}
        {!isInlineTarget && (
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={onView}
              disabled={actionLoading}
              className="flex min-h-[44px] items-center gap-1.5 border-b-2 border-wil-500 pb-0.5 text-[13px] font-semibold text-wil-600 transition-colors hover:border-wil-600 hover:text-wil-700 disabled:opacity-50"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Bekijken
            </button>
            <button
              type="button"
              onClick={onPostpone}
              disabled={actionLoading}
              className="flex min-h-[44px] items-center gap-1.5 text-[13px] font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)] disabled:opacity-50"
            >
              <Clock className="h-3.5 w-3.5" />
              Later
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={actionLoading}
              className="flex min-h-[44px] items-center gap-1.5 text-[13px] font-medium text-[var(--ink-4)] transition-colors hover:text-[var(--ink-3)] disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              Niet voor mij
            </button>
          </div>
        )}

        {/* Inline postpone form */}
        {isInlineTarget && inlineType === 'postpone' && (
          <PostponeForm
            mode="recommendation"
            onSubmit={(data) =>
              onDecide('postpone', {
                reason: data.reason,
                postponed_until: data.postponed_until,
              })
            }
            onCancel={onCancelInline}
          />
        )}

        {/* Inline reject form */}
        {isInlineTarget && inlineType === 'reject' && (
          <div className="mt-3 space-y-2 rounded-lg border border-red-100 bg-red-50/50 p-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                Waarom niet? (optioneel)
              </label>
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => onRejectReasonChange(e.target.value)}
                placeholder="Bijv. niet relevant, te moeilijk, doe ik al..."
                className="w-full rounded-md border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-red-300 focus:outline-none focus:ring-1 focus:ring-red-300"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onDecide('reject', { reason: rejectReason })}
                disabled={actionLoading}
                className="flex min-h-[44px] items-center gap-1.5 rounded-md bg-red-500 px-3 text-xs font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
              >
                {actionLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
                Afwijzen
              </button>
              <button
                type="button"
                onClick={onCancelInline}
                className="flex min-h-[44px] items-center rounded-md px-3 text-xs font-medium text-[var(--ink-3)] transition-colors hover:bg-zinc-100"
              >
                Annuleren
              </button>
            </div>
          </div>
        )}
      </article>
    </div>
  )
}

/* ── Main component ──────────────────────────────────────── */

export function RecommendationGenerationModal({
  open,
  onClose,
  onNewRecommendations,
}: GenerationModalProps) {
  const [phase, setPhase] = useState<Phase>('generating')
  const [newRecs, setNewRecs] = useState<Recommendation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [messageIndex, setMessageIndex] = useState(0)

  // Results-phase state
  const [selectedRec, setSelectedRec] = useState<Recommendation | null>(null)
  const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set())
  const [inlineAction, setInlineAction] = useState<{
    id: string
    type: 'postpone' | 'reject'
  } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const messageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedRef = useRef(false)
  const onNewRecsRef = useRef(onNewRecommendations)
  onNewRecsRef.current = onNewRecommendations

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const handleClose = useCallback(() => {
    stopPolling()
    onClose()
  }, [onClose, stopPolling])

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setPhase('generating')
      setNewRecs([])
      setError(null)
      setMessageIndex(0)
      setSelectedRec(null)
      setDecidedIds(new Set())
      setInlineAction(null)
      setRejectReason('')
      startedRef.current = false
    }
  }, [open])

  // Rotating status messages
  useEffect(() => {
    if (!open || phase !== 'generating') {
      if (messageTimerRef.current) clearInterval(messageTimerRef.current)
      return
    }
    messageTimerRef.current = setInterval(() => {
      setMessageIndex((i) => (i + 1) % GENERATING_MESSAGES.length)
    }, 3000)
    return () => {
      if (messageTimerRef.current) clearInterval(messageTimerRef.current)
    }
  }, [open, phase])

  // Start generation + polling
  useEffect(() => {
    if (!open || startedRef.current) return
    startedRef.current = true

    function startPolling() {
      stopPolling()
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch('/api/ai/recommendations/initial')
          const data = await res.json()

          if (data.error) {
            setError(data.error)
            setPhase('error')
            stopPolling()
            return
          }

          if (data.recommendations?.length) {
            setNewRecs(data.recommendations as Recommendation[])
          }

          if (data.status !== 'generating') {
            const recs = (data.recommendations ?? []) as Recommendation[]
            setNewRecs(recs)
            if (recs.length > 0) {
              setPhase('results')
              onNewRecsRef.current(recs)
            } else {
              setError('Will kon geen nieuwe voorstellen genereren.')
              setPhase('error')
            }
            stopPolling()
          }
        } catch {
          // Network error — keep polling, it may recover
        }
      }, POLL_INTERVAL_MS)
    }

    fetch('/api/ai/recommendations/initial', { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
          setPhase('error')
          return
        }
        if (data.recommendations?.length) {
          setNewRecs(data.recommendations as Recommendation[])
          setPhase('results')
          onNewRecsRef.current(data.recommendations as Recommendation[])
          return
        }
        if (data.status === 'generating') {
          startPolling()
          return
        }
        // POST returned without results and without generating status
        setError('Will kon geen nieuwe voorstellen genereren.')
        setPhase('error')
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Er ging iets mis')
        setPhase('error')
      })

    return () => stopPolling()
  }, [open, stopPolling])

  // Retry after error
  function handleRetry() {
    setPhase('generating')
    setError(null)
    setNewRecs([])
    startedRef.current = false
  }

  // --- Action handling (results phase) ---

  const handleDecide = useCallback(
    async (
      id: string,
      action: 'accept' | 'reject' | 'postpone',
      data?: Record<string, unknown>,
    ) => {
      setActionLoading(true)
      try {
        const res = await fetch(`/api/ai/recommendations/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...data }),
        })
        if (!res.ok) return

        setDecidedIds((prev) => new Set(prev).add(id))
        setInlineAction(null)
        setRejectReason('')
        setSelectedRec(null)
      } finally {
        setActionLoading(false)
      }
    },
    [],
  )

  // Cards that are still undecided
  const undecidedRecs = newRecs.filter((r) => !decidedIds.has(r.id))
  const allDecided = phase === 'results' && newRecs.length > 0 && undecidedRecs.length === 0

  // Auto-close when all decided
  useEffect(() => {
    if (!allDecided) return
    const t = setTimeout(handleClose, 1500)
    return () => clearTimeout(t)
  }, [allDecided, handleClose])

  // Total impact across all new recommendations
  const totalFreedomDays = newRecs.reduce(
    (sum, r) => sum + (r.freedom_days_per_year ?? 0),
    0,
  )
  const totalEuroYearly = newRecs.reduce(
    (sum, r) => sum + (r.euro_impact_yearly ?? 0),
    0,
  )

  return (
    <>
      <BottomSheet
        open={open}
        onClose={handleClose}
        title={phase === 'generating' ? 'Aanbevelingen genereren' : 'Nieuwe aanbevelingen'}
        size="lg"
        initialMobileHeight="65vh"
      >
        {/* ── Generating phase ─────────────────────────────── */}
        {phase === 'generating' && (
          <div className="px-5 pb-6 pt-4">
            <div
              className="mb-5 flex flex-col items-center gap-3"
              role="status"
              aria-live="polite"
              aria-label={GENERATING_MESSAGES[messageIndex]}
            >
              <WillDots size={56} state="thinking" />
              <p className="text-center text-sm font-medium text-[var(--ink-2)]">
                {GENERATING_MESSAGES[messageIndex]}
              </p>
            </div>

            <div className="mb-5">
              <SegmentedProgress count={newRecs.length} total={EXPECTED_COUNT} />
            </div>

            <div className="space-y-2">
              {newRecs.map((rec) => (
                <div key={rec.id} className="pointer-events-none opacity-80">
                  <RecommendationCard
                    recommendation={rec}
                    compact
                    onClick={() => {}}
                  />
                </div>
              ))}
              {Array.from({ length: Math.max(0, EXPECTED_COUNT - newRecs.length) }).map(
                (_, i) => (
                  <SkeletonCard key={`skel-${i}`} />
                ),
              )}
            </div>
          </div>
        )}

        {/* ── Results phase — Mini Krantje ─────────────────── */}
        {phase === 'results' && !allDecided && (
          <div className="px-5 pb-6 pt-4 sm:px-7">
            {/* Newspaper masthead */}
            <Masthead />

            {/* Lead paragraph */}
            <p className="mb-1 font-serif text-[13px] italic leading-relaxed text-[var(--ink-3)]">
              Will heeft je financi&euml;le profiel geanalyseerd en {newRecs.length} concrete
              verbeteringen gevonden.
            </p>

            {/* Summary stats — 2-column newspaper stats */}
            {(totalFreedomDays > 0 || totalEuroYearly > 0) && (
              <div className="my-3 flex border-y border-[var(--border-ed)] py-2.5">
                {totalFreedomDays > 0 && (
                  <div className={`flex-1 text-center ${totalEuroYearly > 0 ? 'border-r border-[var(--border-ed)]' : ''}`}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-4)]">
                      Totale impact
                    </p>
                    <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-wil-600">
                      {Math.round(totalFreedomDays)}
                      <span className="ml-1 font-serif text-[12px] font-normal italic text-[var(--ink-3)]">
                        dagen
                      </span>
                    </p>
                  </div>
                )}
                {totalEuroYearly > 0 && (
                  <div className="flex-1 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-4)]">
                      Jaarlijks
                    </p>
                    <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-[var(--ink)]">
                      {formatCurrency(totalEuroYearly)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Articles */}
            <div>
              {newRecs.map((rec, i) => (
                <div key={rec.id}>
                  {i > 0 && <ArticleRule />}
                  <div className="py-3">
                    <ArticleCard
                      rec={rec}
                      index={i}
                      isDecided={decidedIds.has(rec.id)}
                      isInlineTarget={inlineAction?.id === rec.id}
                      inlineType={inlineAction?.id === rec.id ? inlineAction.type : undefined}
                      actionLoading={actionLoading}
                      rejectReason={rejectReason}
                      onView={() => setSelectedRec(rec)}
                      onPostpone={() => setInlineAction({ id: rec.id, type: 'postpone' })}
                      onReject={() => setInlineAction({ id: rec.id, type: 'reject' })}
                      onDecide={(action, data) => handleDecide(rec.id, action, data)}
                      onCancelInline={() => {
                        setInlineAction(null)
                        setRejectReason('')
                      }}
                      onRejectReasonChange={setRejectReason}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Footer line */}
            <div className="mt-2 border-t-2 border-[var(--ink)] pt-1.5">
              <p className="text-center text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
                Gegenereerd door Will &mdash; je persoonlijke financiele analist
              </p>
            </div>
          </div>
        )}

        {/* ── All decided ──────────────────────────────────── */}
        {allDecided && (
          <div className="flex flex-col items-center gap-3 px-5 pb-8 pt-6">
            <WillDots size={48} state="success" />
            <p className="text-center font-display text-base font-bold text-[var(--ink)]">
              Alle voorstellen beoordeeld
            </p>
            <p className="font-serif text-[13px] italic text-[var(--ink-3)]">
              Je keuzes zijn verwerkt
            </p>
          </div>
        )}

        {/* ── Error phase ──────────────────────────────────── */}
        {phase === 'error' && (
          <div className="flex flex-col items-center gap-4 px-5 pb-8 pt-6">
            <WillDots size={48} state="error" />
            <p className="text-center text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="flex min-h-[44px] items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] px-4 text-xs font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Opnieuw proberen
            </button>
          </div>
        )}
      </BottomSheet>

      {/* ── Accept-flow modal (stacked on top via portal) ─── */}
      {selectedRec && (
        <RecommendationModal
          recommendation={selectedRec}
          onDecide={handleDecide}
          onClose={() => setSelectedRec(null)}
        />
      )}
    </>
  )
}
