'use client'

import { useState, useCallback } from 'react'
import {
  Loader2, CheckCircle, HelpCircle, Check, ChevronDown, GitFork, Sparkles,
} from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { createClient } from '@/lib/supabase/client'
import type { Budget } from '@/lib/budget-data'

// ─── Types ────────────────────────────────────────────────────────────────────

type Transaction = {
  id: string
  date: string
  description: string
  counterparty_name: string | null
  counterparty_iban: string | null
  amount: number
  import_hash: string | null
  budget_id: string | null
  reference?: string | null
}

type AISuggestion = {
  import_hash: string
  budget_slug: string | null
  budget_id: string | null
  confidence: number
  reasoning: string
}

type RowState = {
  tx: Transaction
  suggestion: AISuggestion | null
  accepted: boolean
  acceptedBudgetId: string | null
  acceptedBudgetName: string | null
  makeRule: boolean
}

type BulkApplyPrompt = {
  matchField: 'counterparty_name' | 'description'
  matchValue: string
  budgetId: string
  budgetName: string
  siblingCount: number
}

type Props = {
  transactions: Transaction[]
  budgets: Budget[]
  budgetGroups: { parent: Budget; children: Budget[] }[]
  onClose: () => void
  onSaved: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

const SHOW_MORE_STEP = 20

// ─── Component ────────────────────────────────────────────────────────────────

export function AICategorizeSheet({ transactions, budgets, budgetGroups, onClose, onSaved }: Props) {
  const [phase, setPhase] = useState<'choice' | 'ai' | 'review' | 'saving' | 'success'>('choice')
  const [rows, setRows] = useState<RowState[]>([])
  const [aiError, setAiError] = useState<string | null>(null)
  const [showCount, setShowCount] = useState(SHOW_MORE_STEP)
  const [savedCount, setSavedCount] = useState(0)
  const [ruleCount, setRuleCount] = useState(0)
  const [bulkUpdated, setBulkUpdated] = useState(0)
  const [bulkApplyPrompt, setBulkApplyPrompt] = useState<BulkApplyPrompt | null>(null)
  const [aiBatchProgress, setAiBatchProgress] = useState({ current: 0, total: 0 })

  // ── Fetch AI suggestions (parallel batches, max 3 concurrent) ─────────────

  const fetchSuggestions = useCallback(async () => {
    setPhase('ai')
    setAiError(null)
    setAiBatchProgress({ current: 0, total: 0 })

    try {
      const payload = transactions.map((tx) => ({
        import_hash: tx.import_hash ?? `${tx.date}-${tx.amount}-${tx.description}`,
        description: tx.description,
        counterparty_name: tx.counterparty_name,
        amount: tx.amount,
        reference: tx.reference,
      }))

      // Split into batches of 20
      const batches: typeof payload[] = []
      for (let i = 0; i < payload.length; i += 20) {
        batches.push(payload.slice(i, i + 20))
      }

      setAiBatchProgress({ current: 0, total: payload.length })

      // Parallel fetch with max 3 concurrent (semaphore pattern)
      const allResults: AISuggestion[] = []
      let completedCount = 0
      let nextIdx = 0

      async function runWorker(): Promise<void> {
        while (nextIdx < batches.length) {
          const idx = nextIdx++
          const batch = batches[idx]
          const res = await fetch('/api/ai/categorize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactions: batch }),
          })

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}))
            throw new Error((errData as { error?: string }).error ?? 'AI-analyse niet beschikbaar')
          }

          const data = await res.json() as { results: AISuggestion[] }
          allResults.push(...data.results)
          completedCount += batch.length
          setAiBatchProgress((prev) => ({ ...prev, current: completedCount }))
        }
      }

      const workers = Array.from({ length: Math.min(3, batches.length) }, () => runWorker())
      await Promise.all(workers)

      // Build suggestion map
      const suggestionMap = new Map<string, AISuggestion>()
      for (const s of allResults) {
        suggestionMap.set(s.import_hash, s)
      }

      // Build rows
      const initialRows: RowState[] = transactions.map((tx) => {
        const hash = tx.import_hash ?? `${tx.date}-${tx.amount}-${tx.description}`
        const suggestion = suggestionMap.get(hash) ?? null

        // Pre-fill accepted state if AI has a high-confidence suggestion
        return {
          tx,
          suggestion,
          accepted: false,
          acceptedBudgetId: null,
          acceptedBudgetName: null,
          makeRule: false,
        }
      })

      setRows(initialRows)
      setPhase('review')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI-analyse niet beschikbaar'
      setAiError(msg)
      // Fall back to review mode without suggestions
      setRows(transactions.map((tx) => ({
        tx,
        suggestion: null,
        accepted: false,
        acceptedBudgetId: null,
        acceptedBudgetName: null,
        makeRule: false,
      })))
      setPhase('review')
    }
  }, [transactions])

  function startManual() {
    setRows(transactions.map((tx) => ({
      tx,
      suggestion: null,
      accepted: false,
      acceptedBudgetId: null,
      acceptedBudgetName: null,
      makeRule: false,
    })))
    setPhase('review')
  }

  // ── Row actions ───────────────────────────────────────────────────────────

  function acceptSuggestion(idx: number) {
    setBulkApplyPrompt(null)
    const row = rows[idx]
    if (!row?.suggestion?.budget_id) return
    const budget = budgets.find((b) => b.id === row.suggestion!.budget_id)
    const updatedRows = rows.map((r, i) => {
      if (i !== idx || !r.suggestion?.budget_id) return r
      return {
        ...r,
        accepted: true,
        acceptedBudgetId: r.suggestion.budget_id,
        acceptedBudgetName: budget?.name ?? r.suggestion.budget_slug,
        makeRule: true,
      }
    })
    setRows(updatedRows)
    const matchField = row.tx.counterparty_name ? 'counterparty_name' as const : 'description' as const
    const matchValue = row.tx.counterparty_name || row.tx.description
    const budgetId = row.suggestion.budget_id
    const budgetName = budget?.name ?? row.suggestion.budget_slug ?? ''
    if (matchValue) detectSiblings(updatedRows, idx, matchField, matchValue, budgetId, budgetName)
  }

  function setManualBudget(idx: number, budgetId: string) {
    setBulkApplyPrompt(null)
    const row = rows[idx]
    const budget = budgets.find((b) => b.id === budgetId)
    const updatedRows = rows.map((r, i) => {
      if (i !== idx) return r
      return {
        ...r,
        accepted: !!budgetId,
        acceptedBudgetId: budgetId || null,
        acceptedBudgetName: budget?.name ?? null,
        makeRule: false,
      }
    })
    setRows(updatedRows)
    if (budgetId && row) {
      const matchField = row.tx.counterparty_name ? 'counterparty_name' as const : 'description' as const
      const matchValue = row.tx.counterparty_name || row.tx.description
      const budgetName = budget?.name ?? ''
      if (matchValue) detectSiblings(updatedRows, idx, matchField, matchValue, budgetId, budgetName)
    }
  }

  function toggleMakeRule(idx: number) {
    setRows((prev) => prev.map((r, i) =>
      i === idx ? { ...r, makeRule: !r.makeRule } : r
    ))
  }

  function detectSiblings(
    updatedRows: RowState[],
    currentIdx: number,
    matchField: 'counterparty_name' | 'description',
    matchValue: string,
    budgetId: string,
    budgetName: string,
  ) {
    const siblings = updatedRows.filter((r, i) =>
      i !== currentIdx &&
      !r.accepted &&
      (matchField === 'counterparty_name'
        ? r.tx.counterparty_name?.toLowerCase() === matchValue.toLowerCase()
        : r.tx.description?.toLowerCase().includes(matchValue.toLowerCase()))
    )
    if (siblings.length > 0) {
      setBulkApplyPrompt({ matchField, matchValue, budgetId, budgetName, siblingCount: siblings.length })
    }
  }

  function applyToSiblings() {
    if (!bulkApplyPrompt) return
    const { matchField, matchValue, budgetId, budgetName } = bulkApplyPrompt
    setRows((prev) => prev.map((r) => {
      if (r.accepted) return r
      const matches = matchField === 'counterparty_name'
        ? r.tx.counterparty_name?.toLowerCase() === matchValue.toLowerCase()
        : r.tx.description?.toLowerCase().includes(matchValue.toLowerCase())
      if (!matches) return r
      return { ...r, accepted: true, acceptedBudgetId: budgetId, acceptedBudgetName: budgetName, makeRule: false }
    }))
    setBulkApplyPrompt(null)
  }

  function acceptAll() {
    setRows((prev) => prev.map((r) => {
      if (!r.suggestion?.budget_id) return r
      const budget = budgets.find((b) => b.id === r.suggestion!.budget_id)
      return {
        ...r,
        accepted: true,
        acceptedBudgetId: r.suggestion.budget_id,
        acceptedBudgetName: budget?.name ?? r.suggestion.budget_slug,
        makeRule: true,
      }
    }))
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    setPhase('saving')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setPhase('review')
      return
    }

    const accepted = rows.filter((r) => r.accepted && r.acceptedBudgetId)
    let saved = 0
    let rules = 0
    let bulk = 0

    for (const row of accepted) {
      // Update transaction
      await supabase
        .from('transactions')
        .update({ budget_id: row.acceptedBudgetId, category_source: 'ai' })
        .eq('id', row.tx.id)

      saved++

      // Create rule if requested
      if (row.makeRule) {
        const matchField = row.tx.counterparty_name ? 'counterparty_name' : 'description'
        const matchValue = row.tx.counterparty_name || row.tx.description
        if (matchValue) {
          await supabase.from('category_corrections')
            .delete()
            .eq('user_id', user.id)
            .eq('match_field', matchField)
            .ilike('match_value', matchValue)
          await supabase.from('category_corrections')
            .insert({ user_id: user.id, match_field: matchField, match_value: matchValue, budget_id: row.acceptedBudgetId })
          rules++

          // Also save IBAN correction if IBAN is available (more reliable matching)
          if (row.tx.counterparty_iban) {
            const normalizedIban = row.tx.counterparty_iban.replace(/\s/g, '').toUpperCase()
            await supabase.from('category_corrections')
              .delete()
              .eq('user_id', user.id)
              .eq('match_field', 'counterparty_iban')
              .ilike('match_value', normalizedIban)
            await supabase.from('category_corrections')
              .insert({ user_id: user.id, match_field: 'counterparty_iban', match_value: normalizedIban, budget_id: row.acceptedBudgetId })
          }

          // Retroactively apply rule to all uncategorised matching transactions
          let bulkQuery = supabase
            .from('transactions')
            .update({ budget_id: row.acceptedBudgetId, category_source: 'rule' })
            .eq('user_id', user.id)
            .is('budget_id', null)
            .neq('id', row.tx.id)

          if (matchField === 'counterparty_name') {
            bulkQuery = bulkQuery.ilike('counterparty_name', matchValue)
          } else {
            bulkQuery = bulkQuery.ilike('description', `%${matchValue}%`)
          }

          // Also match by IBAN for retroactive application
          if (row.tx.counterparty_iban) {
            const { data: ibanBulk } = await supabase
              .from('transactions')
              .update({ budget_id: row.acceptedBudgetId, category_source: 'rule' })
              .eq('user_id', user.id)
              .is('budget_id', null)
              .neq('id', row.tx.id)
              .eq('counterparty_iban', row.tx.counterparty_iban)
              .select('id')
            bulk += ibanBulk?.length ?? 0
          }

          const { data: bulkResult } = await bulkQuery.select('id')
          bulk += bulkResult?.length ?? 0
        }
      }
    }

    setSavedCount(saved)
    setRuleCount(rules)
    setBulkUpdated(bulk)
    setPhase('success')
  }

  // ── Derived counts ────────────────────────────────────────────────────────

  const acceptedCount = rows.filter((r) => r.accepted).length
  const pendingCount = rows.filter((r) => !r.accepted).length
  const aiSuggestionCount = rows.filter((r) => r.suggestion?.budget_id).length

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <BottomSheet open onClose={onClose} title="Transacties categoriseren">

      {/* ── Choice ── */}
      {phase === 'choice' && (
        <div className="flex flex-col gap-4 py-4">
          <p className="text-sm text-[var(--ink-2)]">
            <strong className="text-[var(--ink)]">{transactions.length}</strong> {transactions.length === 1 ? 'transactie' : 'transacties'} zonder categorie.
            Hoe wil je verdergaan?
          </p>

          {/* Vraag Will */}
          <button
            type="button"
            onClick={() => void fetchSuggestions()}
            className="flex items-start gap-4 rounded-[var(--r-lg)] border border-dashed border-wil-300 bg-wil-50/50 px-4 py-4 text-left transition-all hover:border-wil-400 hover:shadow-[var(--s1)]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wil-100">
              <Sparkles className="h-4 w-4 text-wil-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">Vraag Will</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--ink-3)]">
                Will analyseert de transacties en stelt categorieën voor op basis van beschrijving en tegenpartij.
              </p>
            </div>
          </button>

          {/* Handmatig */}
          <button
            type="button"
            onClick={startManual}
            className="flex items-start gap-4 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-4 text-left transition-all hover:border-[var(--border-md)] hover:shadow-[var(--s1)]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--subtle)]">
              <HelpCircle className="h-4 w-4 text-[var(--ink-3)]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">Handmatig categoriseren</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--ink-3)]">
                Wijs zelf per transactie een categorie toe vanuit een keuzelijst.
              </p>
            </div>
          </button>
        </div>
      )}

      {/* ── AI processing ── */}
      {phase === 'ai' && (
        <div className="space-y-4 py-6">
          <div className="flex flex-col items-center gap-3 pb-2">
            <Loader2 className="h-7 w-7 animate-spin text-wil-500" />
            <p className="text-sm font-medium text-[var(--ink-2)]">
              {aiBatchProgress.total > 0
                ? <>Will categoriseert… <span className="font-mono tabular-nums">{aiBatchProgress.current}</span> van <span className="font-mono tabular-nums">{aiBatchProgress.total}</span> transacties</>
                : 'Will analyseert'
              }
            </p>
          </div>

          {/* Progress bar */}
          {aiBatchProgress.total > 0 && (
            <div className="h-1.5 rounded-full bg-wil-100 overflow-hidden mx-4">
              <div
                className="h-1.5 rounded-full bg-wil-500"
                style={{
                  width: `${(aiBatchProgress.current / aiBatchProgress.total) * 100}%`,
                  transition: 'width 0.4s ease-out',
                }}
              />
            </div>
          )}

          {/* Fhin editorial quote card */}
          <div className="rounded-[var(--r-lg)] border border-dashed border-wil-200 bg-wil-50/50 px-4 py-3">
            <p className="font-[var(--font-source-serif)] text-[13px] italic leading-relaxed text-[var(--ink-2)] border-l-[3px] border-wil-500 pl-3">
              &ldquo;{transactions.length} transacties worden vergeleken met jouw eerdere gewoonten…&rdquo;
            </p>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-wil-600">— Will</p>
          </div>

          {/* Skeleton rows */}
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-3 animate-pulse">
                <div className="flex justify-between">
                  <div className="h-3 w-32 rounded bg-[var(--subtle)]" />
                  <div className="h-3 w-16 rounded bg-[var(--subtle)]" />
                </div>
                <div className="mt-2 h-2.5 w-48 rounded bg-[var(--subtle)]" />
                <div className="mt-2 h-7 w-full rounded bg-[var(--subtle)]" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Review ── */}
      {phase === 'review' && (
        <div className="flex flex-col gap-0">
          {/* AI error fallback */}
          {aiError && (
            <div className="mb-3 rounded-[var(--r)] border border-orange-200 bg-orange-50 px-3 py-2 text-[11px] text-orange-700">
              {aiError}
            </div>
          )}

          {/* Sticky header */}
          <div className="sticky top-0 z-10 bg-[var(--paper)] border-b border-[var(--border-ed)] px-0 py-3 flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-3 text-sm text-[var(--ink-2)]">
              <span>
                <strong className="text-[var(--ink)]">{pendingCount}</strong> van {rows.length} nog te beoordelen
              </span>
              {aiSuggestionCount > 0 && (
                <span className="flex items-center gap-1 text-kern-600 text-xs font-medium">
                  <Sparkles className="h-3 w-3" />
                  {aiSuggestionCount} AI-voorstellen
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {aiSuggestionCount > 0 && (
                <button
                  type="button"
                  onClick={acceptAll}
                  className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-kern-300 px-3 py-1.5 text-xs font-medium text-kern-700 hover:bg-kern-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  Alles goedkeuren
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={acceptedCount === 0}
                className="inline-flex items-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-kern-700 disabled:opacity-40"
              >
                <Check className="h-3.5 w-3.5" />
                Opslaan
              </button>
            </div>
          </div>

          {/* Bulk-apply prompt */}
          {bulkApplyPrompt && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-[var(--r)] border border-dashed border-wil-300 bg-wil-50/50 px-4 py-3 text-sm">
              <p className="text-[var(--ink-2)]">
                <span className="font-medium text-[var(--ink)]">{bulkApplyPrompt.siblingCount}</span> andere{' '}
                <span className="font-medium text-[var(--ink)]">'{bulkApplyPrompt.matchValue}'</span>-transacties.{' '}
                Ook als <span className="font-medium text-[var(--ink)]">{bulkApplyPrompt.budgetName}</span>?
              </p>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={applyToSiblings}
                  className="rounded-[var(--r-sm)] bg-wil-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-wil-700"
                >
                  Ja, allemaal
                </button>
                <button
                  type="button"
                  onClick={() => setBulkApplyPrompt(null)}
                  className="rounded-[var(--r-sm)] border border-[var(--border-md)] px-3 py-1.5 text-xs text-[var(--ink-2)] hover:bg-[var(--subtle)]"
                >
                  Overslaan
                </button>
              </div>
            </div>
          )}

          {/* Transaction rows */}
          <div className="space-y-2">
            {rows.slice(0, showCount).map((row, idx) => (
              <TransactionRow
                key={row.tx.id}
                row={row}
                idx={idx}
                budgetGroups={budgetGroups}
                onAcceptSuggestion={() => acceptSuggestion(idx)}
                onManualBudget={(bId) => setManualBudget(idx, bId)}
                onToggleMakeRule={() => toggleMakeRule(idx)}
              />
            ))}
          </div>

          {rows.length > showCount && (
            <button
              type="button"
              onClick={() => setShowCount((n) => n + SHOW_MORE_STEP)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[var(--r)] border border-dashed border-[var(--border-md)] py-2.5 text-xs text-[var(--ink-3)] hover:bg-[var(--subtle)]"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              {rows.length - showCount} meer transacties tonen
            </button>
          )}
        </div>
      )}

      {/* ── Saving ── */}
      {phase === 'saving' && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-kern-500" />
          <p className="text-sm text-[var(--ink-3)]">Opslaan…</p>
        </div>
      )}

      {/* ── Success ── */}
      {phase === 'success' && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-kern-100">
            <CheckCircle className="h-7 w-7 text-kern-600" />
          </div>
          <div>
            <p className="text-lg font-bold font-[var(--font-playfair)] text-[var(--ink)]">Klaar</p>
            <p className="mt-1 text-sm text-[var(--ink-2)]">
              {savedCount} {savedCount === 1 ? 'transactie' : 'transacties'} gecategoriseerd
            </p>
            {ruleCount > 0 && (
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                {ruleCount} {ruleCount === 1 ? 'regel' : 'regels'} aangemaakt
                {bulkUpdated > 0 && (
                  <> — {bulkUpdated} eerder{bulkUpdated === 1 ? 'e transactie' : 'e transacties'} automatisch gecategoriseerd</>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onSaved}
            className="rounded-[var(--r)] bg-kern-600 px-6 py-2 text-sm font-medium text-white hover:bg-kern-700"
          >
            Sluiten
          </button>
        </div>
      )}
    </BottomSheet>
  )
}

// ─── Transaction Row ───────────────────────────────────────────────────────────

type RowProps = {
  row: RowState
  idx: number
  budgetGroups: { parent: Budget; children: Budget[] }[]
  onAcceptSuggestion: () => void
  onManualBudget: (budgetId: string) => void
  onToggleMakeRule: () => void
}

function TransactionRow({ row, budgetGroups, onAcceptSuggestion, onManualBudget, onToggleMakeRule }: RowProps) {
  const { tx, suggestion, accepted, acceptedBudgetName, makeRule } = row
  const hasSuggestion = !!suggestion?.budget_id

  return (
    <div className={`rounded-[var(--r-lg)] border p-3 transition-colors ${
      accepted
        ? 'border-emerald-200 bg-emerald-50/30'
        : 'border-[var(--border-ed)] bg-[var(--paper)]'
    }`}>
      {/* Row header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-[var(--ink-3)]">{formatDate(tx.date)}</p>
          <p className="mt-0.5 truncate text-sm font-medium text-[var(--ink)] line-clamp-2">{tx.description}</p>
          {tx.counterparty_name && (
            <p className="mt-0.5 truncate text-[11px] text-[var(--ink-3)]">{tx.counterparty_name}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className={`font-[var(--font-dm-mono)] text-sm font-medium tabular-nums ${
            tx.amount > 0 ? 'text-emerald-600' : 'text-[var(--ink)]'
          }`}>
            {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
          </p>
          {accepted && (
            <span className="mt-0.5 flex items-center justify-end gap-0.5 text-[10px] text-emerald-600">
              <Check className="h-3 w-3" />
              Gekeurd
            </span>
          )}
        </div>
      </div>

      {/* AI suggestion block */}
      {hasSuggestion && !accepted && (
        <div className="mt-2 rounded-r-[var(--r-sm)] border border-dashed border-kern-200 bg-kern-50/50 px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 mb-1">
                <Sparkles className="h-3 w-3 text-kern-500 shrink-0" />
                <p className="font-[var(--font-source-serif)] text-[11px] italic text-[var(--ink-2)] line-clamp-2">
                  {suggestion.reasoning}
                </p>
              </div>
              <p className="text-xs font-medium text-kern-700">
                {budgetGroups.flatMap((g) => g.children).find((b) => b.id === suggestion.budget_id)?.name ?? suggestion.budget_slug}
              </p>
            </div>
            <button
              type="button"
              onClick={onAcceptSuggestion}
              className="shrink-0 inline-flex items-center gap-1 rounded-[var(--r-sm)] bg-[var(--kern)] px-2.5 py-1.5 text-xs font-medium text-white min-h-[32px] hover:opacity-90"
            >
              <Check className="h-3 w-3" />
              OK
            </button>
          </div>
        </div>
      )}

      {/* Accepted AI suggestion — show rule toggle */}
      {accepted && hasSuggestion && (
        <div className="mt-2 flex items-center gap-2 rounded-[var(--r-sm)] border border-dashed border-[var(--border-ed)] px-3 py-1.5">
          <GitFork className="h-3.5 w-3.5 text-[var(--ink-3)] shrink-0" />
          <span className="text-[11px] text-[var(--ink-3)] flex-1">
            Maak ook een regel
            <span className="ml-1 text-[var(--ink-4)]">
              Altijd &ldquo;{tx.counterparty_name || tx.description.slice(0, 30)}&rdquo; → {acceptedBudgetName}
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={makeRule}
            onClick={onToggleMakeRule}
            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
              makeRule ? 'bg-kern-500' : 'bg-[var(--border-md)]'
            }`}
          >
            <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
              makeRule ? 'translate-x-3.5' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      )}

      {/* Manual selection — no AI suggestion or manual override */}
      {!hasSuggestion && (
        <div className="mt-2 flex items-center gap-2">
          <HelpCircle className="h-3.5 w-3.5 text-[var(--ink-4)] shrink-0" />
          <select
            value={row.acceptedBudgetId ?? ''}
            onChange={(e) => onManualBudget(e.target.value)}
            className="flex-1 rounded border border-[var(--border-ed)] px-2 py-1 text-xs outline-none focus:border-kern-500"
          >
            <option value="">Kies handmatig</option>
            {budgetGroups
              .filter((g) => g.children.length > 0)
              .map((g) => (
                <optgroup key={g.parent.id} label={g.parent.name}>
                  {g.children.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              ))}
          </select>
        </div>
      )}

      {/* Manual selection for rows with AI suggestion (override) */}
      {hasSuggestion && !accepted && (
        <div className="mt-1.5 flex justify-end">
          <button
            type="button"
            onClick={() => {
              // Show the select by setting a flag — handled via manual select appearing below
            }}
            className="font-[var(--font-source-serif)] text-[11px] italic text-kern-600 hover:underline"
          >
            Andere categorie kiezen →
          </button>
        </div>
      )}

      {/* Manual override dropdown for rows that had AI suggestions */}
      {hasSuggestion && (
        <div className={`mt-1 ${accepted ? 'hidden' : ''}`} id={`manual-${row.tx.id}`}>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onManualBudget(e.target.value)
            }}
            className="w-full rounded border border-dashed border-[var(--border-ed)] px-2 py-1 text-xs text-[var(--ink-3)] outline-none focus:border-kern-500 focus:text-[var(--ink)]"
            aria-label="Andere categorie kiezen"
          >
            <option value="">— Andere categorie kiezen —</option>
            {budgetGroups
              .filter((g) => g.children.length > 0)
              .map((g) => (
                <optgroup key={g.parent.id} label={g.parent.name}>
                  {g.children.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              ))}
          </select>
        </div>
      )}
    </div>
  )
}
