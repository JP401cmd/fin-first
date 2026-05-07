'use client'

/**
 * ReviewStep — verplichte validatielaag tussen extractie en import.
 *
 * Per CLAUDE.md "Validatie-strategie": de gebruiker mag overslaan, maar
 * mag NIET stilzwijgend overschrijven. Daarom:
 *   · Elke rij heeft een `needsReview` flag — pas weg als de gebruiker
 *     ófwel het bedrag wijzigt, ófwel "klopt zo" aanvinkt, ófwel verwijdert.
 *   · Geen update-on-conflict: als er al een asset met dezelfde naam
 *     bestaat, vragen we hoe de gebruiker dat wil oplossen.
 *   · Profile-updates (bruto-inkomen) tonen huidige naast geïmporteerde
 *     waarde, geen overschrijven zonder zichtbare keuze.
 *
 * Pattern volgt `onboarding-nieuws-only.tsx:438-502` (`ReviewSection` /
 * `ReviewItem`) maar geduplikeerd in `review-primitives.tsx` zodat de
 * editorial-aangifte-context apart styling kan dragen (delta-veld,
 * needsReview, conflict-warn).
 *
 * Dual-mode dispatch:
 *   - `mode='direct-import'`: POST naar /api/onboarding/aangifte-import →
 *     created ids → onSuccess.
 *   - `mode='onboarding-collect'`: bouw QuickAddInput-items en geef ze
 *     terug via `onCollect`; geen netwerk-call.
 */

import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ASSET_TYPE_LABELS, type AssetType } from '@/lib/asset-data'
import { DEBT_TYPE_LABELS, type DebtType } from '@/lib/debt-data'
import type {
  AangifteExtractionResult,
  AangifteAssetReviewItem,
  AangifteDebtReviewItem,
  AangifteImportPayload,
  AangifteImportResponse,
  AangifteProfileUpdates,
} from '@/lib/aangifte/types'
import {
  ReviewCard,
  ReviewSection,
  PeildatumBanner,
} from './review-primitives'

// ── Types ─────────────────────────────────────────────────────────

export type ReviewMode = 'onboarding-collect' | 'direct-import'

interface ReviewStepProps {
  extraction: AangifteExtractionResult
  mode: ReviewMode
  onSuccess: (payload: { assetIds: string[]; debtIds: string[]; collected?: { assets: AangifteAssetReviewItem[]; debts: AangifteDebtReviewItem[]; profileUpdates: AangifteProfileUpdates } }) => void
  onCancel: () => void
}

/**
 * Per-rij review-state. We extenderen wat de extractie levert met:
 *   - `confirmed` — gebruiker heeft expliciet "klopt zo" geklikt of bedrag bewerkt.
 *   - `actualValue` — optionele actuele waarde (delta tov peildatum).
 *   - `removed` — uit lijst verwijderd; blijft in state voor undo maar telt niet.
 *   - `conflictResolution` — keuze bij naam-conflict.
 */
interface AssetReviewState {
  id: string
  name: string
  asset_type: AssetType
  current_value: number
  woz_value: number | null
  subtype: string | null
  actualValue: string // optionele "nu actueel" delta; lege string = niet meegenomen
  confirmed: boolean
  removed: boolean
  conflictWith: { id: string; name: string } | null
  conflictResolution: 'replace' | 'side-by-side' | 'skip' | null
}

interface DebtReviewState {
  id: string
  name: string
  debt_type: DebtType
  current_balance: number
  interest_rate: number | null
  repayment_type: string | null
  subtype: string | null
  is_tax_deductible: boolean | null
  actualBalance: string
  confirmed: boolean
  removed: boolean
  conflictWith: { id: string; name: string } | null
  conflictResolution: 'replace' | 'side-by-side' | 'skip' | null
}

/**
 * Box 1-component review: per kind een dedicated mapping-keuze.
 */
type IncomeMapping = 'main_income' | 'aow_confirm' | 'separate_pension' | 'ignore'

interface IncomeReviewState {
  index: number
  kind: 'loon' | 'pensioen' | 'aow' | 'uitkering' | 'winst'
  annual_amount: number
  label: string
  mapping: IncomeMapping
}

// ── Helpers ───────────────────────────────────────────────────────

function genId(prefix: string, index: number): string {
  return `${prefix}-${index}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Default mapping per Box 1-kind. AOW → bevestig, loon → hoofdinkomen,
 * pensioen → bundel in hoofdinkomen, uitkering/winst → hoofdinkomen.
 */
function defaultMapping(kind: IncomeReviewState['kind']): IncomeMapping {
  if (kind === 'aow') return 'aow_confirm'
  return 'main_income'
}

function monthsSince(peildatum: string): number {
  const peil = new Date(peildatum)
  const now = new Date()
  return Math.max(
    0,
    (now.getFullYear() - peil.getFullYear()) * 12 + (now.getMonth() - peil.getMonth()),
  )
}

/** Tolerant string-to-number parser (NL formatting). */
function parseAmount(value: string): number | null {
  if (!value || !value.trim()) return null
  const normalized = value.replace(/\./g, '').replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  if (Number.isNaN(parsed) || parsed < 0) return null
  return parsed
}

// ── Component ─────────────────────────────────────────────────────

export function ReviewStep({ extraction, mode, onSuccess, onCancel }: ReviewStepProps) {
  // Initial state vanuit de extractie. Elke rij krijgt een UID en `confirmed=false`.
  const [assets, setAssets] = useState<AssetReviewState[]>(() =>
    extraction.assets.map((a, i) => ({
      id: genId('asset', i),
      name: a.name,
      asset_type: a.asset_type as AssetType,
      current_value: a.current_value,
      woz_value: a.woz_value,
      subtype: a.subtype,
      actualValue: '',
      confirmed: false,
      removed: false,
      conflictWith: null,
      conflictResolution: null,
    })),
  )
  const [debts, setDebts] = useState<DebtReviewState[]>(() =>
    extraction.debts.map((d, i) => ({
      id: genId('debt', i),
      name: d.name,
      debt_type: d.debt_type as DebtType,
      current_balance: d.current_balance,
      interest_rate: d.interest_rate,
      repayment_type: d.repayment_type,
      subtype: d.subtype,
      is_tax_deductible: d.is_tax_deductible,
      actualBalance: '',
      confirmed: false,
      removed: false,
      conflictWith: null,
      conflictResolution: null,
    })),
  )
  const [incomes, setIncomes] = useState<IncomeReviewState[]>(() =>
    extraction.box1_components.map((b, i) => ({
      index: i,
      kind: b.kind,
      annual_amount: b.annual_amount,
      label: b.label,
      mapping: defaultMapping(b.kind),
    })),
  )
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // ── Conflict-detectie: haal user's huidige assets/debts op ─────
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    const fetchExisting = async () => {
      try {
        // Parallelle queries — beide tabellen kunnen onafhankelijk laden.
        const [{ data: existingAssets }, { data: existingDebts }] = await Promise.all([
          supabase.from('assets').select('id, name').eq('is_active', true),
          supabase.from('debts').select('id, name').eq('is_active', true),
        ])
        if (cancelled) return

        // Match op kleine letters + getrimde naam — voorkomt valse positieven
        // op " ING Betaalrekening" vs "ING betaalrekening".
        const norm = (s: string) => s.toLowerCase().trim()

        if (existingAssets) {
          setAssets((prev) =>
            prev.map((a) => {
              const match = (existingAssets as { id: string; name: string }[]).find(
                (e) => norm(e.name) === norm(a.name),
              )
              return match ? { ...a, conflictWith: match } : a
            }),
          )
        }
        if (existingDebts) {
          setDebts((prev) =>
            prev.map((d) => {
              const match = (existingDebts as { id: string; name: string }[]).find(
                (e) => norm(e.name) === norm(d.name),
              )
              return match ? { ...d, conflictWith: match } : d
            }),
          )
        }
      } catch {
        // Silent fail — conflict-detectie is niet kritisch. Gebruiker kan
        // doorgaan en eventuele duplicaten later handmatig oplossen.
      }
    }
    void fetchExisting()
    return () => {
      cancelled = true
    }
  }, [])

  // ── Asset/debt mutators ─────────────────────────────────────────

  const updateAsset = (id: string, patch: Partial<AssetReviewState>) => {
    setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }
  const updateDebt = (id: string, patch: Partial<DebtReviewState>) => {
    setDebts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }

  // ── Bevestig-knop gating ────────────────────────────────────────

  /**
   * Knop is pas actief als alle non-removed rijen óf bevestigd óf hebben een
   * conflict-resolution. Per CLAUDE.md: één-klik-acknowledge per rij is het
   * minimum.
   */
  const allReviewed = useMemo(() => {
    const activeAssets = assets.filter((a) => !a.removed)
    const activeDebts = debts.filter((d) => !d.removed)
    const everyAssetOk = activeAssets.every(
      (a) => a.confirmed || (a.conflictWith != null && a.conflictResolution != null),
    )
    const everyDebtOk = activeDebts.every(
      (d) => d.confirmed || (d.conflictWith != null && d.conflictResolution != null),
    )
    // Income-mapping is altijd al gekozen (default mapping), dus geen extra gate.
    return everyAssetOk && everyDebtOk
  }, [assets, debts])

  const totalActiveCount = useMemo(() => {
    return (
      assets.filter((a) => !a.removed && a.conflictResolution !== 'skip').length +
      debts.filter((d) => !d.removed && d.conflictResolution !== 'skip').length
    )
  }, [assets, debts])

  // ── Submit ──────────────────────────────────────────────────────

  /**
   * Bouw de payload op uit de review-state. Items met `removed=true` of
   * `conflictResolution='skip'` worden niet meegestuurd. Bij `conflictResolution='replace'`
   * kan de server kiezen om te overschrijven (B3-implementatie); we sturen
   * de vlag mee voor zichtbaarheid.
   */
  const buildPayload = (): AangifteImportPayload => {
    const idempotencyKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2)

    const assetItems: AangifteAssetReviewItem[] = assets
      .filter((a) => !a.removed && a.conflictResolution !== 'skip')
      .map((a) => {
        const actual = parseAmount(a.actualValue)
        const item: AangifteAssetReviewItem = {
          name: a.name,
          asset_type: a.asset_type,
          current_value: a.current_value,
          field3: a.subtype ?? null,
        }
        if (actual != null) {
          item.current_value_actual = actual
        }
        return item
      })

    const debtItems: AangifteDebtReviewItem[] = debts
      .filter((d) => !d.removed && d.conflictResolution !== 'skip')
      .map((d) => {
        const actual = parseAmount(d.actualBalance)
        const item: AangifteDebtReviewItem = {
          name: d.name,
          debt_type: d.debt_type,
          current_balance: d.current_balance,
          field3: d.interest_rate ?? d.subtype ?? null,
        }
        if (actual != null) {
          item.current_balance_actual = actual
        }
        return item
      })

    // Profile updates uit Box 1 income mapping
    const profile: AangifteProfileUpdates = {}
    let mainIncomeTotal = 0
    let incomeTypeWinner: 'employee' | 'self_employed' | 'mixed' | 'pension' | 'unemployed' | null = null

    for (const inc of incomes) {
      if (inc.mapping === 'main_income') {
        mainIncomeTotal += inc.annual_amount
        if (inc.kind === 'winst') incomeTypeWinner = 'self_employed'
        else if (inc.kind === 'pensioen' && incomeTypeWinner == null) incomeTypeWinner = 'pension'
        else if (inc.kind === 'uitkering' && incomeTypeWinner == null) incomeTypeWinner = 'unemployed'
        else if (inc.kind === 'loon' && incomeTypeWinner !== 'self_employed') incomeTypeWinner = 'employee'
      }
      if (inc.mapping === 'aow_confirm') {
        profile.aow_active = true
      }
    }
    if (mainIncomeTotal > 0) {
      profile.gross_annual_income = mainIncomeTotal
    }
    if (incomeTypeWinner) {
      profile.income_type = incomeTypeWinner
    }

    return {
      assets: assetItems,
      debts: debtItems,
      profile_updates: profile,
      peildatum: extraction.peildatum,
      tax_year: extraction.tax_year,
      idempotency_key: idempotencyKey,
    }
  }

  const handleConfirm = async () => {
    setSubmitting(true)
    setSubmitError(null)

    const payload = buildPayload()

    if (mode === 'onboarding-collect') {
      // Geen netwerk-call — geef de items terug aan parent. Parent injecteert
      // ze in de onboarding-state (`quickAssets` / `quickDebts`).
      onSuccess({
        assetIds: [],
        debtIds: [],
        collected: {
          assets: payload.assets,
          debts: payload.debts,
          profileUpdates: payload.profile_updates,
        },
      })
      setSubmitting(false)
      return
    }

    // mode === 'direct-import' — call B3's API
    try {
      const res = await fetch('/api/onboarding/aangifte-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.status === 404) {
        throw new Error('De import is nog niet beschikbaar — probeer het later opnieuw.')
      }

      if (!res.ok) {
        let detail = `Import mislukt (${res.status})`
        try {
          const data = (await res.json()) as { error?: string }
          if (data?.error) detail = data.error
        } catch {
          // body niet-JSON → gebruik fallback
        }
        throw new Error(detail)
      }

      const result = (await res.json()) as AangifteImportResponse
      if (!result.ok) {
        throw new Error(result.error || 'Import mislukt')
      }

      onSuccess({ assetIds: result.asset_ids, debtIds: result.debt_ids })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Onbekende fout bij opslaan'
      setSubmitError(message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────

  const monthsOld = monthsSince(extraction.peildatum)

  return (
    <div className="space-y-5">
      {/* Editorial header met peildatum-banner */}
      <div className="space-y-2">
        <p className="flex items-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
          <span
            className="inline-block w-7 h-px bg-[var(--color-kern-500)] mr-2.5 align-middle"
            aria-hidden="true"
          />
          Stap 2 — controle
        </p>
        <h2 className="font-serif text-2xl text-[var(--ink)] leading-tight">
          Klopt deze{' '}
          <em className="font-serif italic font-normal text-[var(--color-kern-700)]">samenvatting</em>?
        </h2>
      </div>

      <PeildatumBanner taxYear={extraction.tax_year} peildatum={extraction.peildatum} monthsOld={monthsOld} />

      {/* Bezittingen */}
      {assets.length > 0 && (
        <ReviewSection title="Bezittingen" count={assets.filter((a) => !a.removed).length}>
          {assets.map((asset) =>
            asset.removed ? null : (
              <ReviewCard
                key={asset.id}
                name={asset.name}
                onNameChange={(v) => updateAsset(asset.id, { name: v, confirmed: true })}
                typeLabel={ASSET_TYPE_LABELS[asset.asset_type] ?? asset.asset_type}
                value={asset.current_value}
                onValueChange={(v) => updateAsset(asset.id, { current_value: v, confirmed: true })}
                actualValue={asset.actualValue}
                onActualChange={(v) => updateAsset(asset.id, { actualValue: v, confirmed: true })}
                confirmed={asset.confirmed}
                onConfirm={() => updateAsset(asset.id, { confirmed: true })}
                onRemove={() => updateAsset(asset.id, { removed: true })}
                conflictName={asset.conflictWith?.name ?? null}
                conflictResolution={asset.conflictResolution}
                onConflictResolve={(resolution) =>
                  updateAsset(asset.id, { conflictResolution: resolution, confirmed: true })
                }
                actualPlaceholder="actueel"
              />
            ),
          )}
        </ReviewSection>
      )}

      {/* Schulden */}
      {debts.length > 0 && (
        <ReviewSection title="Schulden" count={debts.filter((d) => !d.removed).length}>
          {debts.map((debt) =>
            debt.removed ? null : (
              <ReviewCard
                key={debt.id}
                name={debt.name}
                onNameChange={(v) => updateDebt(debt.id, { name: v, confirmed: true })}
                typeLabel={DEBT_TYPE_LABELS[debt.debt_type] ?? debt.debt_type}
                value={debt.current_balance}
                onValueChange={(v) => updateDebt(debt.id, { current_balance: v, confirmed: true })}
                actualValue={debt.actualBalance}
                onActualChange={(v) => updateDebt(debt.id, { actualBalance: v, confirmed: true })}
                confirmed={debt.confirmed}
                onConfirm={() => updateDebt(debt.id, { confirmed: true })}
                onRemove={() => updateDebt(debt.id, { removed: true })}
                conflictName={debt.conflictWith?.name ?? null}
                conflictResolution={debt.conflictResolution}
                onConflictResolve={(resolution) =>
                  updateDebt(debt.id, { conflictResolution: resolution, confirmed: true })
                }
                actualPlaceholder="actueel"
              />
            ),
          )}
        </ReviewSection>
      )}

      {/* Box 1 inkomen */}
      {incomes.length > 0 && (
        <ReviewSection title="Box 1 — inkomen" count={incomes.length}>
          <div className="divide-y divide-[var(--border-ed)]">
            {incomes.map((inc) => (
              <div key={inc.index} className="px-4 py-3 space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-serif text-sm text-[var(--ink)]">{inc.label}</p>
                  {inc.annual_amount > 0 && (
                    <p className="font-mono text-sm tabular-nums text-[var(--ink-2)]">
                      €{inc.annual_amount.toLocaleString('nl-NL')}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {inc.kind === 'aow' ? (
                    <>
                      <RadioPill
                        active={inc.mapping === 'aow_confirm'}
                        onClick={() =>
                          setIncomes((prev) =>
                            prev.map((p) =>
                              p.index === inc.index ? { ...p, mapping: 'aow_confirm' } : p,
                            ),
                          )
                        }
                      >
                        Bevestig AOW actief
                      </RadioPill>
                      <RadioPill
                        active={inc.mapping === 'ignore'}
                        onClick={() =>
                          setIncomes((prev) =>
                            prev.map((p) => (p.index === inc.index ? { ...p, mapping: 'ignore' } : p)),
                          )
                        }
                      >
                        Negeren
                      </RadioPill>
                    </>
                  ) : inc.kind === 'pensioen' ? (
                    <>
                      <RadioPill
                        active={inc.mapping === 'main_income'}
                        onClick={() =>
                          setIncomes((prev) =>
                            prev.map((p) =>
                              p.index === inc.index ? { ...p, mapping: 'main_income' } : p,
                            ),
                          )
                        }
                      >
                        Inclusief in hoofdinkomen
                      </RadioPill>
                      <RadioPill
                        active={inc.mapping === 'separate_pension'}
                        onClick={() =>
                          setIncomes((prev) =>
                            prev.map((p) =>
                              p.index === inc.index ? { ...p, mapping: 'separate_pension' } : p,
                            ),
                          )
                        }
                      >
                        Apart als pensioen
                      </RadioPill>
                      <RadioPill
                        active={inc.mapping === 'ignore'}
                        onClick={() =>
                          setIncomes((prev) =>
                            prev.map((p) => (p.index === inc.index ? { ...p, mapping: 'ignore' } : p)),
                          )
                        }
                      >
                        Negeren
                      </RadioPill>
                    </>
                  ) : (
                    <>
                      <RadioPill
                        active={inc.mapping === 'main_income'}
                        onClick={() =>
                          setIncomes((prev) =>
                            prev.map((p) =>
                              p.index === inc.index ? { ...p, mapping: 'main_income' } : p,
                            ),
                          )
                        }
                      >
                        Hoofdinkomen
                      </RadioPill>
                      <RadioPill
                        active={inc.mapping === 'ignore'}
                        onClick={() =>
                          setIncomes((prev) =>
                            prev.map((p) => (p.index === inc.index ? { ...p, mapping: 'ignore' } : p)),
                          )
                        }
                      >
                        Negeren
                      </RadioPill>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ReviewSection>
      )}

      {/* Empty extraction guard */}
      {assets.length === 0 && debts.length === 0 && incomes.length === 0 && (
        <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-4">
          <p className="font-serif italic text-sm text-[var(--ink-3)] leading-relaxed">
            We hebben geen bezittingen, schulden of inkomen kunnen extraheren. Ga terug en typ
            de bedragen handmatig in.
          </p>
        </div>
      )}

      {/* Submit error */}
      {submitError && (
        <div role="alert" className="border border-[var(--border-ed)] border-l-4 border-l-[var(--negative)] bg-[var(--paper)] p-3">
          <p className="text-[10px] font-mono uppercase tracking-[0.10em] text-[var(--ink-3)] mb-1">
            Opslaan mislukt
          </p>
          <p className="font-serif italic text-sm text-[var(--ink-2)] leading-relaxed">
            {submitError}
          </p>
        </div>
      )}

      {/* Action-bar — sticky bottom voor mobile */}
      <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-[var(--paper)]/95 backdrop-blur-sm border-t border-[var(--border-ed)] flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="min-h-[44px] px-3 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors disabled:opacity-60"
        >
          Annuleren
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!allReviewed || submitting || totalActiveCount === 0}
          className="min-h-[44px] inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium text-white transition-colors bg-[var(--color-kern-600)] hover:bg-[var(--color-kern-700)] active:bg-[var(--color-kern-800)] disabled:bg-[var(--ink-4)] disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-kern-500)]"
        >
          {submitting ? (
            'Bezig...'
          ) : !allReviewed ? (
            <span>Bevestig alle rijen</span>
          ) : (
            <span>
              Bevestig {totalActiveCount} {totalActiveCount === 1 ? 'item' : 'items'}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

// ── Sub: RadioPill ────────────────────────────────────────────────

function RadioPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1.5 text-xs font-medium border transition-colors ${
        active
          ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
          : 'bg-transparent text-[var(--ink-3)] border-[var(--border-ed)] hover:border-[var(--ink-3)]'
      }`}
      aria-pressed={active}
    >
      {active && <Check className="h-3 w-3" aria-hidden="true" />}
      {children}
    </button>
  )
}
