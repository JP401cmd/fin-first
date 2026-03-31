'use client'

import { useState } from 'react'
import { WillDots } from '@/components/app/will-dots'
import { SpeechBubble } from './speech-bubble'
import { StepProgress } from './step-progress'
import type { ExtractionResult } from '@/lib/ai/extract-financial-data'

// Re-export the type so the orchestrator can import it from this module
export type { ExtractionResult } from '@/lib/ai/extract-financial-data'

// ── Type labels ────────────────────────────────────────────────────

const ASSET_TYPE_LABELS: Record<string, string> = {
  cash: 'Contant',
  savings: 'Spaargeld',
  investment: 'Belegging',
  retirement: 'Pensioen',
  eigen_huis: 'Eigen huis',
  real_estate: 'Vastgoed',
  crypto: 'Crypto',
  vehicle: 'Voertuig',
  physical: 'Fysiek bezit',
  other: 'Overig',
}

const DEBT_TYPE_LABELS: Record<string, string> = {
  mortgage: 'Hypotheek',
  personal_loan: 'Persoonlijke lening',
  student_loan: 'Studieschuld',
  car_loan: 'Autolening',
  credit_card: 'Creditcard',
  revolving_credit: 'Doorlopend krediet',
  payment_plan: 'Betalingsregeling',
  belastingschuld: 'Belastingschuld',
  familielening: 'Familielening',
  other: 'Overig',
}

// ── Component ──────────────────────────────────────────────────────

export function OnboardingNieuwsOnly({
  description,
  onChange,
  onNext,
  onBack,
  extraction,
  onExtractionChange,
  profileContext,
}: {
  description: string
  onChange: (value: string) => void
  onNext: () => void
  onBack: () => void
  extraction: ExtractionResult | null
  onExtractionChange: (data: ExtractionResult | null) => void
  profileContext?: {
    age?: number
    householdType?: string
    monthlyIncome?: number
    monthlyExpenses?: number
  }
}) {
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Extraction API call ──────────────────────────────────────────

  async function handleExtract() {
    if (!description.trim()) return

    setExtracting(true)
    setError(null)

    try {
      const body: Record<string, unknown> = { text: description.trim() }
      if (profileContext?.age != null) body.age = profileContext.age
      if (profileContext?.householdType) body.householdType = profileContext.householdType
      if (profileContext?.monthlyIncome != null) body.monthlyIncome = profileContext.monthlyIncome
      if (profileContext?.monthlyExpenses != null) body.monthlyExpenses = profileContext.monthlyExpenses

      const res = await fetch('/api/onboarding/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Extractie mislukt')
      }

      const result: ExtractionResult = await res.json()
      onExtractionChange(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Onbekende fout bij analyse')
    } finally {
      setExtracting(false)
    }
  }

  // ── Mutation helpers for editable extraction results ──────────────

  function updateAssetValue(index: number, value: number) {
    if (!extraction) return
    const updated = [...extraction.assets]
    updated[index] = { ...updated[index], estimated_value: value }
    onExtractionChange({ ...extraction, assets: updated })
  }

  function removeAsset(index: number) {
    if (!extraction) return
    onExtractionChange({ ...extraction, assets: extraction.assets.filter((_, i) => i !== index) })
  }

  function updateDebtValue(index: number, value: number) {
    if (!extraction) return
    const updated = [...extraction.debts]
    updated[index] = { ...updated[index], estimated_balance: value }
    onExtractionChange({ ...extraction, debts: updated })
  }

  function removeDebt(index: number) {
    if (!extraction) return
    onExtractionChange({ ...extraction, debts: extraction.debts.filter((_, i) => i !== index) })
  }

  function updateLifeEventAge(index: number, age: number | null) {
    if (!extraction) return
    const updated = [...extraction.life_events]
    updated[index] = { ...updated[index], target_age: age }
    onExtractionChange({ ...extraction, life_events: updated })
  }

  function removeLifeEvent(index: number) {
    if (!extraction) return
    onExtractionChange({ ...extraction, life_events: extraction.life_events.filter((_, i) => i !== index) })
  }

  function updateIncomeEstimate(value: number | null) {
    if (!extraction) return
    onExtractionChange({ ...extraction, monthly_income_estimate: value })
  }

  function updateExpensesEstimate(value: number | null) {
    if (!extraction) return
    onExtractionChange({ ...extraction, monthly_expenses_estimate: value })
  }

  // ── Clear extraction to re-edit the description ──────────────────

  function handleReAnalyse() {
    onExtractionChange(null)
    setError(null)
  }

  // ── Derived state ────────────────────────────────────────────────

  const hasDescription = description.trim().length > 0
  const hasExtraction = extraction !== null
  const hasResults = hasExtraction && (
    extraction.assets.length > 0 ||
    extraction.debts.length > 0 ||
    extraction.life_events.length > 0 ||
    extraction.monthly_income_estimate != null ||
    extraction.monthly_expenses_estimate != null
  )

  return (
    <div className="pb-20 sm:pb-0">
      {/* Back button */}
      <button
        onClick={onBack}
        className="mb-6 flex min-h-[44px] items-center gap-1 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] active:text-[var(--ink)] transition-colors duration-150"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Terug
      </button>

      <div className="mb-8">
        <StepProgress currentPhase="instellen" subStep={{ current: 1, total: 1 }} />
      </div>

      <p className="label-editorial mb-2 text-[var(--ink-4)]">Nieuws</p>

      <div className="mb-6 sm:mb-8 flex items-start gap-3">
        <div className="shrink-0"><WillDots size={48} /></div>
        <SpeechBubble>
          {hasExtraction
            ? 'Controleer de gegevens hieronder. Je kunt waarden aanpassen of items verwijderen voordat je verdergaat.'
            : 'Je hebt gekozen voor gepersonaliseerd financieel nieuws. Om relevante berichten te vinden, helpt het als we iets weten over je financiële situatie.'}
        </SpeechBubble>
      </div>

      {/* ── Description input (always visible, but collapsed after extraction) ── */}
      {!hasExtraction && (
        <>
          <h2 className="mb-2 font-display text-lg font-bold tracking-[-0.02em] text-[var(--ink)]">
            Vertel iets over je financiële situatie
          </h2>
          <p className="mb-4 text-xs text-[var(--ink-4)]">
            Dit helpt ons om nieuws te vinden dat voor jou relevant is. Je kunt dit veld ook leeg laten.
          </p>

          <textarea
            value={description}
            onChange={(e) => onChange(e.target.value.slice(0, 500))}
            placeholder="Bijv. ik huur een woning, spaar voor een huis, heb een beleggingsrekening bij..."
            rows={5}
            className="w-full resize-none rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-[var(--border-md)] focus:outline-none"
            maxLength={500}
          />
          <p className="mt-1 text-right text-[10px] text-[var(--ink-4)]">{description.length}/500</p>

          {/* Tips */}
          <div className="mt-4 rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-3">
            <p className="mb-2 text-xs font-semibold text-[var(--ink-2)]">Tips voor een goede beschrijving:</p>
            <ul className="space-y-1 text-xs text-[var(--ink-3)]">
              <li>Beschrijf je woonsituatie (huur of koop)</li>
              <li>Noem je belangrijkste spaardoelen</li>
              <li>Heb je beleggingen of schulden?</li>
              <li>Wat is je levensfase? (starter, gezin, bijna pensioen)</li>
            </ul>
          </div>
        </>
      )}

      {/* ── Loading state ────────────────────────────────────────────── */}
      {extracting && (
        <div className="mt-6 flex flex-col items-center gap-3 py-8">
          <div className="animate-pulse">
            <WillDots size={48} />
          </div>
          <p className="text-sm text-[var(--ink-3)]">Gegevens worden geanalyseerd...</p>
        </div>
      )}

      {/* ── Error state ──────────────────────────────────────────────── */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* ── Extraction results ───────────────────────────────────────── */}
      {hasExtraction && !extracting && (
        <div className="mt-2 space-y-4">
          {/* Collapsed description summary + re-analyse button */}
          <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-[var(--ink-3)] line-clamp-2 flex-1">{description}</p>
              <button
                onClick={handleReAnalyse}
                className="shrink-0 text-xs font-medium text-wil-600 hover:text-wil-700 transition-colors"
              >
                Opnieuw
              </button>
            </div>
          </div>

          {/* Assets */}
          {extraction.assets.length > 0 && (
            <ReviewSection title="Bezittingen" count={extraction.assets.length}>
              {extraction.assets.map((asset, i) => (
                <ReviewItem
                  key={i}
                  name={asset.name}
                  label={ASSET_TYPE_LABELS[asset.asset_type] ?? asset.asset_type}
                  value={asset.estimated_value}
                  onValueChange={(v) => updateAssetValue(i, v)}
                  onDelete={() => removeAsset(i)}
                />
              ))}
            </ReviewSection>
          )}

          {/* Debts */}
          {extraction.debts.length > 0 && (
            <ReviewSection title="Schulden" count={extraction.debts.length}>
              {extraction.debts.map((debt, i) => (
                <ReviewItem
                  key={i}
                  name={debt.name}
                  label={DEBT_TYPE_LABELS[debt.debt_type] ?? debt.debt_type}
                  value={debt.estimated_balance}
                  onValueChange={(v) => updateDebtValue(i, v)}
                  onDelete={() => removeDebt(i)}
                />
              ))}
            </ReviewSection>
          )}

          {/* Life events */}
          {extraction.life_events.length > 0 && (
            <ReviewSection title="Levensgebeurtenissen" count={extraction.life_events.length}>
              {extraction.life_events.map((event, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 border-b border-[var(--border-ed)] px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[var(--ink)] truncate">{event.name}</p>
                    <p className="text-xs text-[var(--ink-3)]">{event.event_type}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-[var(--ink-4)]">leeftijd</span>
                    <input
                      type="number"
                      min={18}
                      max={120}
                      value={event.target_age ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        updateLifeEventAge(i, v === '' ? null : parseInt(v, 10))
                      }}
                      className="w-14 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 text-right font-mono text-sm tabular-nums text-[var(--ink)] focus:border-[var(--border-md)] focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => removeLifeEvent(i)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-4)] hover:bg-red-50 hover:text-red-500 transition-colors"
                    aria-label={`Verwijder ${event.name}`}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </ReviewSection>
          )}

          {/* Income / Expenses estimates */}
          {(extraction.monthly_income_estimate != null || extraction.monthly_expenses_estimate != null) && (
            <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
              <div className="border-b border-[var(--border-ed)] px-4 py-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                  Schattingen
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-4 px-4 py-3">
                <div>
                  <label className="mb-1 block text-xs text-[var(--ink-3)]">Inkomen /mnd</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-4)]">
                      &euro;
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={extraction.monthly_income_estimate ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        updateIncomeEstimate(v === '' ? null : parseInt(v, 10))
                      }}
                      className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] py-2 pl-7 pr-3 text-right font-mono text-sm tabular-nums text-[var(--ink)] focus:border-[var(--border-md)] focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--ink-3)]">Uitgaven /mnd</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-4)]">
                      &euro;
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={extraction.monthly_expenses_estimate ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        updateExpensesEstimate(v === '' ? null : parseInt(v, 10))
                      }}
                      className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] py-2 pl-7 pr-3 text-right font-mono text-sm tabular-nums text-[var(--ink)] focus:border-[var(--border-md)] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Empty extraction result */}
          {!hasResults && (
            <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-6 text-center">
              <p className="text-sm text-[var(--ink-3)]">
                Er zijn geen gestructureerde gegevens gevonden in je beschrijving. Je kunt gewoon verdergaan.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Sticky navigation ────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-10 flex gap-3 border-t border-[var(--border-ed)] bg-[var(--paper)]/95 px-4 pb-[env(safe-area-inset-bottom,12px)] pt-3 backdrop-blur-sm sm:static sm:mt-8 sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:backdrop-blur-none">
        <button
          onClick={onBack}
          className="flex-1 min-h-[44px] rounded-xl border border-[var(--border-ed)] px-4 py-3 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] active:bg-[var(--subtle)] transition-colors duration-150"
        >
          Terug
        </button>

        {/* Primary action depends on state */}
        {hasExtraction ? (
          // After extraction: "Verder" saves the reviewed data
          <button
            onClick={onNext}
            className="flex-1 min-h-[44px] rounded-xl bg-wil-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-wil-700 active:bg-wil-800"
          >
            Verder
          </button>
        ) : hasDescription ? (
          // With description but no extraction yet: "Analyseren" runs extraction
          <button
            onClick={handleExtract}
            disabled={extracting}
            className="flex-1 min-h-[44px] rounded-xl bg-wil-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-wil-700 active:bg-wil-800 disabled:opacity-60"
          >
            {extracting ? 'Analyseren...' : 'Analyseren'}
          </button>
        ) : (
          // No description: "Overslaan" goes straight to save
          <button
            onClick={onNext}
            className="flex-1 min-h-[44px] rounded-xl bg-wil-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-wil-700 active:bg-wil-800"
          >
            Overslaan
          </button>
        )}
      </div>
    </div>
  )
}

// ── Reusable sub-components ──────────────────────────────────────────

function ReviewSection({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
      <div className="border-b border-[var(--border-ed)] px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">
          {title}
          <span className="ml-1.5 font-normal">({count})</span>
        </h3>
      </div>
      <div>{children}</div>
    </div>
  )
}

function ReviewItem({
  name,
  label,
  value,
  onValueChange,
  onDelete,
}: {
  name: string
  label: string
  value: number
  onValueChange: (v: number) => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--border-ed)] px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[var(--ink)] truncate">{name}</p>
        <p className="text-xs text-[var(--ink-3)]">{label}</p>
      </div>
      <div className="relative shrink-0">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-4)]">
          &euro;
        </span>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onValueChange(parseInt(e.target.value, 10) || 0)}
          className="w-28 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] py-1.5 pl-6 pr-2 text-right font-mono text-sm tabular-nums text-[var(--ink)] focus:border-[var(--border-md)] focus:outline-none"
        />
      </div>
      <button
        onClick={onDelete}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-4)] hover:bg-red-50 hover:text-red-500 transition-colors"
        aria-label={`Verwijder ${name}`}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
