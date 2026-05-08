'use client'

/**
 * AangifteImportPane — orchestrator slide-in pane voor de aangifte-import.
 *
 * Wikkelt de drie stappen (choose / pdf-upload / manual-wizard / review) in
 * `<ShellOverlay kind="pane">` zodat de driewegregel (CLAUDE.md) wordt
 * gerespecteerd: op desktop (≥lg) een slide-in pane van rechts, op mobile
 * een full-height bottom-sheet als fallback (tot Fase 0.5 stack-push).
 *
 * State-machine:
 *   'choose'      → user picks PDF or manual
 *   'pdf'         → UploadStep
 *   'manual'      → ManualWizard
 *   'review'      → ReviewStep (post-extraction)
 *   'submitting'  → review-step interne loading; pane blijft open
 *   'done'        → success-toast, pane sluit, return naar parent
 *
 * Twee modes:
 *   - 'onboarding-collect' — geeft items terug via `onCollect`, maakt zelf
 *     niets aan in de DB. Gebruikt door de bezittingen-stap in onboarding.
 *   - 'direct-import' — POST naar /api/onboarding/aangifte-import. Gebruikt
 *     door empty-state op /core/assets en /identity/koppelingen.
 *
 * Cancellation:
 *   - Esc / X / backdrop / browser-back sluiten de pane (handled via
 *     ShellOverlay's `onClose`).
 *   - Tussentijds parsen / submitten: state.parsing/submitting laat de
 *     onderliggende components hun eigen loading-UI tonen; de close-knop
 *     blijft actief zodat de gebruiker kan annuleren.
 */

import { useCallback, useState } from 'react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { PrivacyNotice } from '@/components/aangifte/privacy-notice'
import { UploadStep } from '@/components/aangifte/upload-step'
import { ManualWizard } from '@/components/aangifte/manual-wizard'
import { ReviewStep, type ReviewMode } from '@/components/aangifte/review-step'
import type {
  AangifteExtractionResult,
  AangifteAssetReviewItem,
  AangifteDebtReviewItem,
  AangifteProfileUpdates,
} from '@/lib/aangifte/types'

export type AangifteImportPaneMode = ReviewMode

type Step = 'choose' | 'pdf' | 'manual' | 'review' | 'done'

export interface AangifteCollectedPayload {
  assets: AangifteAssetReviewItem[]
  debts: AangifteDebtReviewItem[]
  profileUpdates: AangifteProfileUpdates
  taxYear: number
  peildatum: string
}

export interface AangifteImportPaneProps {
  open: boolean
  onClose: () => void
  mode: AangifteImportPaneMode
  /**
   * Alleen voor `mode='onboarding-collect'`. Wordt aangeroepen met de
   * bevestigde items zodat de parent ze in zijn state kan opnemen.
   */
  onCollect?: (payload: AangifteCollectedPayload) => void
  /**
   * Alleen voor `mode='direct-import'`. Optioneel — als afwezig sluit de
   * pane na succes en laat de parent de cache invalideren.
   */
  onImported?: (payload: { assetIds: string[]; debtIds: string[] }) => void
  /** Default tax-year voor de pickers. Default: huidige jaar - 1. */
  fallbackTaxYear?: number
}

export function AangifteImportPane({
  open,
  onClose,
  mode,
  onCollect,
  onImported,
  fallbackTaxYear,
}: AangifteImportPaneProps) {
  const [step, setStep] = useState<Step>('choose')
  const [extraction, setExtraction] = useState<AangifteExtractionResult | null>(null)
  // Bewaar welke invoerroute (PDF of handmatig) de gebruiker koos zodat
  // back-navigatie vanaf de review-stap terugkeert naar dezelfde plek
  // — zonder dit zou een PDF-gebruiker abrupt op de manual-wizard belanden.
  const [previousInputStep, setPreviousInputStep] = useState<'pdf' | 'manual'>('manual')

  /** Reset state bij sluiten zodat een tweede open in een schone choose-stap landt. */
  const handleClose = useCallback(() => {
    onClose()
    // Reset na 300ms zodat de exit-animatie zonder content-flicker speelt.
    window.setTimeout(() => {
      setStep('choose')
      setExtraction(null)
    }, 300)
  }, [onClose])

  const handleExtracted = useCallback((result: AangifteExtractionResult) => {
    setExtraction(result)
    setStep('review')
  }, [])

  const handleReviewSuccess = useCallback(
    (payload: {
      assetIds: string[]
      debtIds: string[]
      collected?: {
        assets: AangifteAssetReviewItem[]
        debts: AangifteDebtReviewItem[]
        profileUpdates: AangifteProfileUpdates
      }
    }) => {
      if (mode === 'onboarding-collect' && payload.collected && extraction) {
        onCollect?.({
          assets: payload.collected.assets,
          debts: payload.collected.debts,
          profileUpdates: payload.collected.profileUpdates,
          taxYear: extraction.tax_year,
          peildatum: extraction.peildatum,
        })
      } else if (mode === 'direct-import') {
        onImported?.({ assetIds: payload.assetIds, debtIds: payload.debtIds })
      }
      setStep('done')
      // Auto-close na korte success-flash zodat gebruiker visuele bevestiging krijgt.
      window.setTimeout(() => handleClose(), 600)
    },
    [mode, extraction, onCollect, onImported, handleClose],
  )

  // ── Title per stap (voor pane-header) ──────────────────────────

  const paneTitle =
    step === 'choose' ? 'Aangifte importeren'
    : step === 'pdf' ? 'PDF uploaden'
    : step === 'manual' ? 'Handmatig invoeren'
    : step === 'review' ? 'Controle'
    : 'Klaar'

  // Back-navigation per stap. Vanaf 'review' → terug naar de oorspronkelijke
  // invoerroute (`previousInputStep`) zodat de gebruiker daar landt waar
  // zij begon: PDF-uploaders gaan terug naar de drop-zone, manual-typers
  // naar de wizard.
  const handleBack = step === 'choose'
    ? undefined
    : step === 'review'
      ? () => setStep(previousInputStep)
      : () => setStep('choose')

  return (
    <ShellOverlay
      open={open}
      onClose={handleClose}
      onBack={handleBack}
      kind="pane"
      title={paneTitle}
    >
      {/* Outer padding wordt geleverd door SlideInPane (driewegregel — ui-ux skill).
          Behoud max-w + mx-auto voor leesbreedte-clamp van het wizard-formulier. */}
      <div className="pb-6 max-w-[640px] mx-auto">
        {step === 'choose' && (
          <ChooseStep
            onPickPdf={() => {
              setPreviousInputStep('pdf')
              setStep('pdf')
            }}
            onPickManual={() => {
              setPreviousInputStep('manual')
              setStep('manual')
            }}
            onCancel={handleClose}
          />
        )}

        {step === 'pdf' && (
          <UploadStep
            fallbackTaxYear={fallbackTaxYear}
            onExtracted={handleExtracted}
            onSwitchToManual={() => {
              setPreviousInputStep('manual')
              setStep('manual')
            }}
            onCancel={handleClose}
          />
        )}

        {step === 'manual' && (
          <ManualWizard
            fallbackTaxYear={fallbackTaxYear}
            onSubmit={handleExtracted}
            onCancel={handleClose}
            onSwitchToPdf={() => {
              setPreviousInputStep('pdf')
              setStep('pdf')
            }}
          />
        )}

        {step === 'review' && extraction && (
          <ReviewStep
            extraction={extraction}
            mode={mode}
            onSuccess={handleReviewSuccess}
            onCancel={handleClose}
          />
        )}

        {step === 'done' && <DoneStep />}
      </div>
    </ShellOverlay>
  )
}

// ── Sub-stappen ────────────────────────────────────────────────────

function ChooseStep({
  onPickPdf,
  onPickManual,
  onCancel,
}: {
  onPickPdf: () => void
  onPickManual: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-6">
      {/* Editorial header */}
      <div className="space-y-2">
        <p className="flex items-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
          <span
            className="inline-block w-7 h-px bg-[var(--color-kern-500)] mr-2.5 align-middle"
            aria-hidden="true"
          />
          Aangifte als startpunt
        </p>
        <h2 className="font-serif text-2xl text-[var(--ink)] leading-tight">
          Hoe wil je je gegevens{' '}
          <em className="font-serif italic font-normal text-[var(--color-kern-700)]">importeren</em>?
        </h2>
        <p className="font-serif italic text-sm text-[var(--ink-2)] leading-relaxed border-l-2 border-[var(--color-kern-500)] pl-3 max-w-[60ch]">
          Twee paden — kies wat het beste past. De PDF-route is sneller; handmatig invullen
          werkt altijd, ook zonder digitale aangifte.
        </p>
      </div>

      {/* Twee keuzekaarten — mobile-first stacked */}
      <div className="grid grid-cols-1 gap-3">
        <button
          type="button"
          onClick={onPickPdf}
          className="group text-left border border-[var(--border-ed)] bg-[var(--paper)] hover:bg-[var(--subtle)]/40 hover:border-[var(--color-kern-500)] transition-colors p-4 sm:p-5 space-y-2"
        >
          <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--color-kern-700)]">
            Optie A — Snel
          </p>
          <h3 className="font-serif text-lg text-[var(--ink)]">
            PDF van mijn aangifte uploaden
          </h3>
          <p className="font-serif italic text-sm text-[var(--ink-2)] leading-relaxed">
            Sleep hier het PDF-bestand — downloadbaar via Mijn Belastingdienst onder
            &ldquo;Kopie van aangifte&rdquo;. Wij lezen lokaal, server zien we alleen tekst.
          </p>
        </button>

        <button
          type="button"
          onClick={onPickManual}
          className="group text-left border border-[var(--border-ed)] bg-[var(--paper)] hover:bg-[var(--subtle)]/40 hover:border-[var(--color-kern-500)] transition-colors p-4 sm:p-5 space-y-2"
        >
          <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--ink-3)]">
            Optie B — Handmatig
          </p>
          <h3 className="font-serif text-lg text-[var(--ink)]">
            Ik typ de bedragen zelf
          </h3>
          <p className="font-serif italic text-sm text-[var(--ink-2)] leading-relaxed">
            Korte vragenlijst van ongeveer 12 velden — lukt in een minuut als je je
            aangifte erbij houdt. Geen PDF nodig.
          </p>
        </button>
      </div>

      {/* Privacy-notice — uitgevouwen, niet collapsable: belangrijk genoeg om altijd te zien */}
      <PrivacyNotice />

      {/* Cancel-only — geen primaire CTA, want de keuze gebeurt op de twee kaarten */}
      <div className="flex items-center justify-end pt-2 border-t border-[var(--border-ed)]">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] px-3 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
        >
          Annuleren
        </button>
      </div>
    </div>
  )
}

function DoneStep() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4 space-y-3 min-h-[320px]">
      <div
        className="flex h-12 w-12 items-center justify-center bg-[var(--color-kern-600)] text-[var(--paper)]"
        aria-hidden="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <p
        className="font-serif text-xl text-[var(--ink)]"
        role="status"
        aria-live="polite"
      >
        Items toegevoegd
      </p>
      <p className="font-serif italic text-sm text-[var(--ink-3)] max-w-[40ch] leading-relaxed">
        Werk straks de actuele saldo&apos;s nog even bij — het scherm sluit zo automatisch.
      </p>
    </div>
  )
}
