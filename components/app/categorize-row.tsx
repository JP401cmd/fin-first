'use client'

// Gedeelde bouwstenen van het "Transacties categoriseren"-scherm: de per-rij
// review-kaart (TransactionRow), de rij-types en de kleine formatters. Zowel de
// platte review-lijst (AICategorizeSheet, reviewMode 'list') als de "Vraag
// Fin"-wizard (CategorizeWizard) renderen hiermee EXACT dezelfde rij — niet
// dupliceren, hergebruiken (WP-C, feature #881).

import { Check, HelpCircle, Sparkles, GitFork } from 'lucide-react'
import { buildBudgetSelectEntries, budgetOptionLabel, type Budget } from '@/lib/budget-data'
import type { CombinedProposalSource } from '@/lib/auto-categorize'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Transaction = {
  id: string
  date: string
  description: string
  counterparty_name: string | null
  counterparty_iban: string | null
  amount: number
  import_hash: string | null
  budget_id: string | null
  reference?: string | null
  /** Nodig voor spiegelpaar-detectie (overboekingen tussen eigen rekeningen). */
  account_id?: string | null
}

/**
 * Eén voorstel in de review-fase. Sinds de combined pass komen voorstellen uit
 * VIER bronnen — regelmotor ('rule'), eigen-rekening/spiegelpaar ('transfer'/
 * 'mirror'), AI ('ai') en propagatie van een AI-oordeel naar dezelfde
 * tegenpartij ('propagated'). ALLE bronnen worden ter bevestiging voorgelegd;
 * niets wordt in deze flow stil toegepast.
 */
export type SheetSuggestion = {
  budget_id: string
  budget_name: string | null
  confidence: number
  reasoning: string | null
  source: CombinedProposalSource
  /** Waarde voor transactions.category_source bij accepteren. */
  category_source: string
}

/** Herkomst-label per voorstel-bron (review-rij + kop + wizard-kaart). */
export const SOURCE_LABELS: Record<CombinedProposalSource, string> = {
  rule: 'Regel',
  transfer: 'Overboeking',
  mirror: 'Overboeking',
  ai: 'Fin',
  propagated: 'Afgeleid',
}

export type RowState = {
  tx: Transaction
  suggestion: SheetSuggestion | null
  accepted: boolean
  acceptedBudgetId: string | null
  acceptedBudgetName: string | null
  /** category_source die handleSave voor deze rij wegschrijft (herkomst-getrouw). */
  acceptedCategorySource: string | null
  makeRule: boolean
  /**
   * Fin heeft deze rij in een AI-ronde beoordeeld maar géén bruikbaar voorstel
   * kunnen geven (representant zonder budget_id/leeg resultaat óf een gefaalde
   * batch). Gevoed door `runCombinedCategorization`'s `onNoMatch` (per ronde) +
   * `result.noMatchIds` (vangnet). De wizard toont dan meteen de handmatige
   * fallback i.p.v. eindeloos te blijven laden. Groepen die alsnog via propagatie
   * een voorstel krijgen worden hier NIET gemarkeerd (motor-contract).
   */
  aiNoMatch?: boolean
}

// ─── Formatters ────────────────────────────────────────────────────────────────

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

// ─── Transaction Row ───────────────────────────────────────────────────────────

export type RowProps = {
  row: RowState
  idx: number
  budgetGroups: { parent: Budget; children: Budget[] }[]
  onAcceptSuggestion: () => void
  onManualBudget: (budgetId: string) => void
  onToggleMakeRule: () => void
  /**
   * Houd de "andere categorie"-select ook op een reeds goedgekeurde rij
   * zichtbaar. Nodig in de controle-stap (stap 3), waar wijzigen mogelijk moet
   * blijven; elders (platte lijst, stap 1-bulk) blijft die verborgen zodra
   * gekeurd. Wijzigen loopt via de bestaande onManualBudget-semantiek.
   */
  editableWhenAccepted?: boolean
}

export function TransactionRow({ row, budgetGroups, onAcceptSuggestion, onManualBudget, onToggleMakeRule, editableWhenAccepted = false }: RowProps) {
  const { tx, suggestion, accepted, acceptedBudgetName, makeRule } = row
  const hasSuggestion = !!suggestion?.budget_id

  return (
    <div className={`rounded-[var(--r-lg)] border p-4 transition-colors ${
      accepted
        ? 'border-positive/30 bg-positive/5'
        : 'border-[var(--border-ed)] bg-[var(--paper)]'
    }`}>
      {/* Row header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-[var(--ink-3)]">{formatDate(tx.date)}</p>
          <p className="mt-1 truncate text-sm font-medium text-[var(--ink)] line-clamp-2">{tx.description}</p>
          {tx.counterparty_name && (
            <p className="mt-1 truncate text-[11px] text-[var(--ink-3)]">{tx.counterparty_name}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className={`font-[var(--font-dm-mono)] text-sm font-medium tabular-nums ${
            tx.amount > 0 ? 'text-positive' : 'text-[var(--ink)]'
          }`}>
            {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
          </p>
          {accepted && (
            <span className="mt-1 flex items-center justify-end gap-0.5 text-[10px] text-positive">
              <Check className="h-3 w-3" />
              Gekeurd
            </span>
          )}
        </div>
      </div>

      {/* Voorstel-blok — regel, Fin, afgeleid of overboeking (herkomst-label per rij) */}
      {hasSuggestion && !accepted && (
        <div className="mt-3 rounded-r-[var(--r-sm)] border border-dashed border-kern-200 bg-kern-50/50 px-3 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 mb-2">
                <Sparkles className="h-3 w-3 text-kern-500 shrink-0" />
                <span className="shrink-0 rounded-full border border-kern-200 bg-[var(--paper)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-kern-700">
                  {SOURCE_LABELS[suggestion.source]}
                </span>
                {suggestion.reasoning && (
                  <p className="font-[var(--font-source-serif)] text-[11px] italic text-[var(--ink-2)] line-clamp-2">
                    {suggestion.reasoning}
                  </p>
                )}
              </div>
              <p className="text-xs font-medium text-kern-700">
                {budgetGroups.flatMap((g) => g.children).find((b) => b.id === suggestion.budget_id)?.name ?? suggestion.budget_name}
              </p>
            </div>
            <button
              type="button"
              onClick={onAcceptSuggestion}
              className="shrink-0 inline-flex items-center gap-1 rounded-[var(--r-sm)] bg-[var(--kern)] px-3 py-2 text-xs font-medium text-white min-h-[44px] hover:opacity-90"
            >
              <Check className="h-3 w-3" />
              OK
            </button>
          </div>
        </div>
      )}

      {/* Accepted AI suggestion — show rule toggle */}
      {accepted && hasSuggestion && (
        <div className="mt-3 flex items-center gap-2 rounded-[var(--r-sm)] border border-dashed border-[var(--border-ed)] px-3 py-2.5">
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
        <div className="mt-3 flex items-center gap-2">
          <HelpCircle className="h-3.5 w-3.5 text-[var(--ink-4)] shrink-0" />
          <select
            value={row.acceptedBudgetId ?? ''}
            onChange={(e) => onManualBudget(e.target.value)}
            className="flex-1 rounded border border-[var(--border-ed)] px-2 py-2 min-h-[44px] text-xs outline-none focus:border-kern-500"
          >
            <option value="">Kies handmatig</option>
            {buildBudgetSelectEntries(budgetGroups).map((entry) =>
              entry.kind === 'group' ? (
                <optgroup key={entry.id} label={entry.label}>
                  {entry.options.map((c) => (
                    <option key={c.id} value={c.id}>{budgetOptionLabel(c)}</option>
                  ))}
                </optgroup>
              ) : (
                <option key={entry.id} value={entry.id}>{budgetOptionLabel(entry)}</option>
              )
            )}
          </select>
        </div>
      )}

      {/* Manual override dropdown for rows that had suggestions */}
      {hasSuggestion && (
        <div className={`mt-2 ${accepted && !editableWhenAccepted ? 'hidden' : ''}`} id={`manual-${row.tx.id}`}>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onManualBudget(e.target.value)
            }}
            className="w-full rounded border border-dashed border-[var(--border-ed)] px-2 py-2 min-h-[44px] text-xs text-[var(--ink-3)] outline-none focus:border-kern-500 focus:text-[var(--ink)]"
            aria-label="Andere categorie kiezen"
          >
            <option value="">— Andere categorie kiezen —</option>
            {buildBudgetSelectEntries(budgetGroups).map((entry) =>
              entry.kind === 'group' ? (
                <optgroup key={entry.id} label={entry.label}>
                  {entry.options.map((c) => (
                    <option key={c.id} value={c.id}>{budgetOptionLabel(c)}</option>
                  ))}
                </optgroup>
              ) : (
                <option key={entry.id} value={entry.id}>{budgetOptionLabel(entry)}</option>
              )
            )}
          </select>
        </div>
      )}
    </div>
  )
}
