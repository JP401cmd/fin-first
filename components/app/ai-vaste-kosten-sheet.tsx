'use client'

import { useState, useEffect, useCallback } from 'react'
import { Check, X, Loader2, ChevronDown, AlertTriangle } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { formatCurrency } from '@/lib/format'

// ── Types ────────────────────────────────────────────────────

type AiClassification = 'subscription' | 'vaste_kosten' | 'skip'

interface AiSuggestion {
  id: string
  name: string
  monthlyAmount: number
  frequency: 'monthly' | 'weekly' | 'quarterly' | 'yearly'
  occurrences: number
  autoCategory: string
  autoCategoryLabel: string
  aiClassification: AiClassification
  aiReason: string
  confidence: string
}

/** Local state for each suggestion while the user reviews it */
interface SuggestionRow {
  suggestion: AiSuggestion
  /** The classification the user has chosen (starts from AI suggestion) */
  classification: 'subscription' | 'vaste_kosten'
  /** Whether the user has accepted this item for saving */
  accepted: boolean
}

interface AiVasteKostenSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: () => void
}

// ── Classification badges ────────────────────────────────────

const CLASSIFICATION_BADGES: Record<'subscription' | 'vaste_kosten', { label: string; className: string }> = {
  subscription: {
    label: 'Abonnement',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  },
  vaste_kosten: {
    label: 'Vaste kosten',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  },
}

// ── Component ────────────────────────────────────────────────

export function AiVasteKostenSheet({ open, onOpenChange, onComplete }: AiVasteKostenSheetProps) {
  const [phase, setPhase] = useState<'loading' | 'review' | 'saving' | 'success' | 'error' | 'empty'>('loading')
  const [rows, setRows] = useState<SuggestionRow[]>([])
  const [skippedRows, setSkippedRows] = useState<AiSuggestion[]>([])
  const [showSkipped, setShowSkipped] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [savedCount, setSavedCount] = useState(0)

  // ── Fetch AI analysis ──────────────────────────────────────

  const fetchAnalysis = useCallback(async () => {
    setPhase('loading')
    setRows([])
    setSkippedRows([])
    setShowSkipped(false)
    setErrorMessage('')

    try {
      const res = await fetch('/api/subscriptions/analyse-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (res.status === 422) {
        setErrorMessage('AI is niet geconfigureerd. Stel een API key in via Instellingen.')
        setPhase('error')
        return
      }

      if (!res.ok) {
        setErrorMessage('Er ging iets mis bij de AI analyse. Probeer het opnieuw.')
        setPhase('error')
        return
      }

      const data = await res.json() as {
        suggestions: AiSuggestion[]
        analysedCount: number
        skippedCount: number
      }

      if (!data.suggestions || data.suggestions.length === 0) {
        setPhase('empty')
        return
      }

      // Split into actionable rows and AI-skipped rows
      const actionable = data.suggestions.filter(s => s.aiClassification !== 'skip')
      const skipped = data.suggestions.filter(s => s.aiClassification === 'skip')

      if (actionable.length === 0) {
        setSkippedRows(skipped)
        setPhase('empty')
        return
      }

      setRows(
        actionable.map(s => ({
          suggestion: s,
          classification: s.aiClassification as 'subscription' | 'vaste_kosten',
          accepted: true, // accepted by default
        })),
      )
      setSkippedRows(skipped)
      setPhase('review')
    } catch {
      setErrorMessage('Er ging iets mis bij de AI analyse. Probeer het opnieuw.')
      setPhase('error')
    }
  }, [])

  // Trigger fetch when sheet opens — intentional: we load data when
  // the open prop transitions to true, same pattern as account-form-modal.tsx
  useEffect(() => {
    if (open) { void fetchAnalysis() } // eslint-disable-line react-hooks/set-state-in-effect
  }, [open, fetchAnalysis])

  // ── Row actions ────────────────────────────────────────────

  function toggleAccepted(idx: number) {
    setRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, accepted: !r.accepted } : r,
    ))
  }

  function toggleClassification(idx: number) {
    setRows(prev => prev.map((r, i) =>
      i === idx
        ? { ...r, classification: r.classification === 'subscription' ? 'vaste_kosten' : 'subscription' }
        : r,
    ))
  }

  // ── Save accepted items ────────────────────────────────────

  async function handleSave() {
    const accepted = rows.filter(r => r.accepted)
    if (accepted.length === 0) return

    setPhase('saving')

    try {
      let saved = 0

      for (const row of accepted) {
        const res = await fetch('/api/recurring', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: row.suggestion.name,
            amount: -Math.abs(row.suggestion.monthlyAmount),
            frequency: row.suggestion.frequency,
            counterparty_name: row.suggestion.name,
            category_override: row.classification,
          }),
        })

        if (res.ok) saved++
      }

      setSavedCount(saved)
      setPhase('success')
    } catch {
      setErrorMessage('Er ging iets mis bij het opslaan. Probeer het opnieuw.')
      setPhase('error')
    }
  }

  // ── Close handler ──────────────────────────────────────────

  function handleClose() {
    onOpenChange(false)
    // Reset state for next open
    if (phase === 'success') {
      onComplete()
    }
  }

  // ── Derived counts ────────────────────────────────────────

  const acceptedCount = rows.filter(r => r.accepted).length

  // ── Render ────────────────────────────────────────────────

  return (
    <BottomSheet open={open} onClose={handleClose} title="Will analyseert je vaste kosten" size="md">

      {/* ── Loading ── */}
      {phase === 'loading' && (
        <div className="space-y-4 px-5 py-8">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-wil-500" />
            <p className="text-sm font-medium text-[var(--ink-2)]">
              AI analyseert je transacties...
            </p>
          </div>

          {/* Skeleton rows */}
          <div className="space-y-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="animate-pulse rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-3">
                <div className="flex justify-between">
                  <div className="h-3 w-32 rounded bg-[var(--subtle)]" />
                  <div className="h-3 w-16 rounded bg-[var(--subtle)]" />
                </div>
                <div className="mt-2 h-2.5 w-48 rounded bg-[var(--subtle)]" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {phase === 'error' && (
        <div className="flex flex-col items-center gap-4 px-5 py-12">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
            <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-300" />
          </div>
          <p className="text-center text-sm text-[var(--ink-2)]">
            {errorMessage}
          </p>
          <button
            type="button"
            onClick={() => void fetchAnalysis()}
            className="rounded-[var(--r)] border border-[var(--border-md)] px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            Opnieuw proberen
          </button>
        </div>
      )}

      {/* ── Empty ── */}
      {phase === 'empty' && (
        <div className="flex flex-col items-center gap-4 px-5 py-12">
          <p className="text-center text-sm text-[var(--ink-2)]">
            Alle terugkerende kosten zijn al gecategoriseerd.
          </p>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-[var(--r)] bg-wil-600 px-4 py-2 text-sm font-medium text-white hover:bg-wil-700"
          >
            Sluiten
          </button>
        </div>
      )}

      {/* ── Review ── */}
      {phase === 'review' && (
        <div className="flex flex-col">
          {/* Sticky header with count and save button */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border-ed)] bg-[var(--paper)] px-5 py-3">
            <p className="text-sm text-[var(--ink-2)]">
              <strong className="text-[var(--ink)]">{acceptedCount}</strong> {acceptedCount === 1 ? 'item' : 'items'} geselecteerd
            </p>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={acceptedCount === 0}
              className="inline-flex items-center gap-1.5 rounded-[var(--r)] bg-wil-600 px-4 py-2 text-sm font-medium text-white hover:bg-wil-700 disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" />
              Opslaan
            </button>
          </div>

          {/* Suggestion rows */}
          <div className="space-y-2 px-5 py-4">
            {rows.map((row, idx) => {
              const badge = CLASSIFICATION_BADGES[row.classification]
              return (
                <div
                  key={row.suggestion.id}
                  className={`rounded-[var(--r-lg)] border p-3 transition-all ${
                    row.accepted
                      ? 'border-[var(--border-ed)] bg-[var(--paper)]'
                      : 'border-[var(--border-ed)] bg-[var(--paper)] opacity-40'
                  }`}
                >
                  {/* Top row: name + amount + actions */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--ink)]">
                        {row.suggestion.name}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--ink-3)]">
                        {row.suggestion.aiReason}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <p className="font-mono text-sm tabular-nums text-[var(--ink)]">
                        {formatCurrency(row.suggestion.monthlyAmount)}/mnd
                      </p>
                    </div>
                  </div>

                  {/* Bottom row: classification badge + toggle + accept/reject */}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {/* Classification badge — clickable to toggle */}
                    <button
                      type="button"
                      onClick={() => toggleClassification(idx)}
                      title="Klik om classificatie te wijzigen"
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${badge.className}`}
                    >
                      {badge.label}
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </button>

                    {/* Accept / Reject buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (!row.accepted) toggleAccepted(idx)
                        }}
                        title="Accepteren"
                        className={`rounded-[var(--r-sm)] p-1.5 transition-colors ${
                          row.accepted
                            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-300'
                            : 'text-[var(--ink-4)] hover:bg-emerald-50 hover:text-emerald-500 dark:hover:bg-emerald-950'
                        }`}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (row.accepted) toggleAccepted(idx)
                        }}
                        title="Overslaan"
                        className={`rounded-[var(--r-sm)] p-1.5 transition-colors ${
                          !row.accepted
                            ? 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                            : 'text-[var(--ink-4)] hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-800'
                        }`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Skipped items expandable */}
            {skippedRows.length > 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setShowSkipped(!showSkipped)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-[var(--r)] border border-dashed border-[var(--border-md)] py-2.5 text-xs text-[var(--ink-3)] hover:bg-[var(--subtle)]"
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showSkipped ? 'rotate-180' : ''}`} />
                  Toon overgeslagen ({skippedRows.length})
                </button>

                {showSkipped && (
                  <div className="mt-2 space-y-1">
                    {skippedRows.map(s => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 opacity-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-[var(--ink-2)]">{s.name}</p>
                          <p className="text-[10px] text-[var(--ink-4)]">{s.aiReason}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <p className="font-mono text-xs tabular-nums text-[var(--ink-3)]">
                            {formatCurrency(s.monthlyAmount)}/mnd
                          </p>
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                            Overslaan
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Saving ── */}
      {phase === 'saving' && (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Loader2 className="h-7 w-7 animate-spin text-wil-500" />
          <p className="text-sm text-[var(--ink-3)]">Opslaan...</p>
        </div>
      )}

      {/* ── Success ── */}
      {phase === 'success' && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
            <Check className="h-7 w-7 text-emerald-600 dark:text-emerald-300" />
          </div>
          <div>
            <p className="text-lg font-bold text-[var(--ink)]">Klaar</p>
            <p className="mt-1 text-sm text-[var(--ink-2)]">
              {savedCount} {savedCount === 1 ? 'item' : 'items'} opgeslagen als vaste kost
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-[var(--r)] bg-wil-600 px-6 py-2 text-sm font-medium text-white hover:bg-wil-700"
          >
            Sluiten
          </button>
        </div>
      )}
    </BottomSheet>
  )
}
