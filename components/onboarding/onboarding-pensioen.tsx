'use client'

import { useState } from 'react'
import { Pencil, Upload } from 'lucide-react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'
import { PensionPdfUpload } from '@/components/app/horizon/pension-pdf-upload'
import { parseBedragInput } from './onboarding-inkomen'
import type { PensionParseResult } from '@/app/api/pension/parse/route'

/**
 * Stap — Pensioen (optioneel). Boldin-stijl: één vraag, drie uitwegen.
 *
 * "Heb je al pensioen opgebouwd?" met drie uitkomsten:
 *   (i)   Schatting — vrij bruto-maandbedrag (+ optioneel ingangsleeftijd).
 *   (ii)  Upload je mijnpensioen.nl-overzicht (JSON volledig client-side,
 *         PDF via de bestaande AI-route) — HERGEBRUIKT `PensionPdfUpload`.
 *   (iii) Overslaan ("kan altijd later nog") — als deferred field getrackt.
 *
 * Het scherm rapporteert alleen z'n keuze terug aan de orchestrator
 * (`PensionDraft`); de daadwerkelijke `life_events`-write gebeurt centraal bij
 * de eind-save (`applyPensionParseResult`), zodat het POST-contract en de
 * ownership-scoping (auth.uid()) ongewijzigd blijven.
 *
 * "Geld is opgeslagen tijd": pensioen is *vrijheid die later vanzelf binnenkomt*.
 */

export type PensionMode = 'estimate' | 'upload'

export interface PensionDraft {
  /** Gekozen pad — null tot de gebruiker iets selecteert. */
  mode: PensionMode | null
  /** Geschat bruto maandbedrag (raw invoerstring). */
  grossMonthly: string
  /** Optionele verwachte ingangsleeftijd (raw invoerstring). */
  startAge: string
  /** Resultaat van een JSON/PDF-upload — null wanneer (nog) niet geüpload. */
  parseResult: PensionParseResult | null
}

export const INITIAL_PENSION_DRAFT: PensionDraft = {
  mode: null,
  grossMonthly: '',
  startAge: '',
  parseResult: null,
}

export interface OnboardingPensioenProps {
  data: PensionDraft
  onChange: (data: PensionDraft) => void
  /** Woonsituatie voor de mijnpensioen.nl JSON-import (AOW-bedrag). */
  samenwonend: boolean
  onNext: () => void
  onBack: () => void
  /** "Kan altijd later nog" — wist de keuze en gaat door (deferred). */
  onSkip: () => void
  currentStep?: number
  totalSteps?: number
}

export function OnboardingPensioen({
  data,
  onChange,
  samenwonend,
  onNext,
  onBack,
  onSkip,
  currentStep = 5,
  totalSteps = 7,
}: OnboardingPensioenProps) {
  const [error, setError] = useState<string | null>(null)

  function selectMode(mode: PensionMode) {
    setError(null)
    onChange({ ...data, mode })
  }

  // "Verder" is alleen zinvol wanneer er iets ingevuld/geüpload is; anders is
  // overslaan de natuurlijke actie. We blokkeren niet hard — een lege schatting
  // wordt bij save genegeerd.
  const hasEstimate =
    data.mode === 'estimate' && parseBedragInput(data.grossMonthly) > 0
  const hasUpload = data.mode === 'upload' && data.parseResult !== null
  const canContinue = hasEstimate || hasUpload

  const headline = (
    <>
      Heb je al{' '}
      <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
        pensioen
      </em>{' '}
      opgebouwd?
    </>
  )

  return (
    <OnboardingShell
      kicker="Pensioen"
      romanNum="v."
      title={headline}
      deck="Pensioen is vrijheid die later vanzelf binnenkomt. Geef een schatting, upload je overzicht, of sla over — je vult het altijd later aan."
      factsPanel={
        <FactsPanel
          stat="€1.300"
          sub="gemiddeld aanvullend pensioen per maand"
          source="Indicatief · DNB/CBS"
        />
      }
      currentStep={currentStep}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={
        <div className="flex w-full flex-col gap-2">
          <button
            type="button"
            onClick={onNext}
            disabled={!canContinue}
            className="w-full min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Verder
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="w-full min-h-11 text-xs italic text-[var(--ink-3)] underline-offset-4 transition-colors hover:text-[var(--ink-2)] hover:underline"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            Kan altijd later nog &rarr;
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Drie keuze-tegels. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ModeTile
            icon={<Pencil className="h-4 w-4" strokeWidth={2} />}
            label="Schat het zelf"
            sublabel="Een bruto bedrag per maand"
            active={data.mode === 'estimate'}
            onClick={() => selectMode('estimate')}
          />
          <ModeTile
            icon={<Upload className="h-4 w-4" strokeWidth={2} />}
            label="Upload je overzicht"
            sublabel="PDF of JSON van mijnpensioen.nl"
            active={data.mode === 'upload'}
            onClick={() => selectMode('upload')}
          />
        </div>

        {/* Schatting-pad. */}
        {data.mode === 'estimate' && (
          <div className="space-y-4 border-l-2 border-[var(--module-active-500)] pl-4">
            <div>
              <label
                htmlFor="ob-pension-gross"
                className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]"
              >
                Geschat bruto pensioen per maand{' '}
                <span className="text-xs font-normal italic text-[var(--ink-3)]">
                  (huidige waarde)
                </span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--ink-4)]">
                  &euro;
                </span>
                <input
                  id="ob-pension-gross"
                  type="text"
                  inputMode="decimal"
                  value={data.grossMonthly}
                  onChange={(e) =>
                    onChange({
                      ...data,
                      grossMonthly: e.target.value.replace(/[^0-9.,]/g, ''),
                    })
                  }
                  placeholder="0"
                  autoComplete="off"
                  className="w-full border border-[var(--border-ed)] bg-[var(--subtle)] py-2.5 pr-3 pl-7 font-mono text-base tabular-nums text-[var(--ink)] outline-none focus:border-[var(--module-active-500)] focus:ring-1 focus:ring-[var(--module-active-500)] sm:text-sm"
                />
              </div>
              <p
                className="mt-1 text-xs italic text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                De huidige waarde van wat je tot nu toe hebt opgebouwd —
                inclusief aanvullend werkpensioen. Grof mag — later aanpasbaar.
              </p>
            </div>

            <div>
              <label
                htmlFor="ob-pension-age"
                className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]"
              >
                Verwachte ingangsleeftijd{' '}
                <span className="text-xs font-normal italic text-[var(--ink-3)]">(optioneel)</span>
              </label>
              <input
                id="ob-pension-age"
                type="text"
                inputMode="numeric"
                value={data.startAge}
                onChange={(e) =>
                  onChange({ ...data, startAge: e.target.value.replace(/[^0-9]/g, '') })
                }
                placeholder="67"
                autoComplete="off"
                className="w-full border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5 font-mono text-base tabular-nums text-[var(--ink)] outline-none focus:border-[var(--module-active-500)] focus:ring-1 focus:ring-[var(--module-active-500)] sm:text-sm"
              />
            </div>
          </div>
        )}

        {/* Upload-pad — hergebruikt PensionPdfUpload (JSON client-side, PDF AI). */}
        {data.mode === 'upload' && (
          <div className="space-y-3 border-l-2 border-[var(--module-active-500)] pl-4">
            <p
              className="text-xs italic text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              Log in op mijnpensioen.nl, download je overzicht (PDF of JSON) en upload het hier.
            </p>
            <PensionPdfUpload
              samenwonend={samenwonend}
              onParseResult={(result) => {
                setError(null)
                onChange({ ...data, mode: 'upload', parseResult: result as PensionParseResult })
              }}
              onFileRemoved={() => onChange({ ...data, parseResult: null })}
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}
      </div>
    </OnboardingShell>
  )
}

// ── Subcomponent ───────────────────────────────────────────────────────

function ModeTile({
  icon,
  label,
  sublabel,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  sublabel: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group flex min-h-[88px] flex-col items-start gap-2 border-2 p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] ${
        active
          ? 'border-[var(--module-active-500)] bg-[var(--module-active-50)]/50'
          : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--module-active-400)] hover:bg-[var(--module-active-50)]/30'
      }`}
    >
      <span
        aria-hidden
        className="flex h-7 w-7 items-center justify-center text-[var(--module-active-700)]"
      >
        {icon}
      </span>
      <p
        className="font-serif text-[15px] leading-tight text-[var(--ink)] sm:text-base"
        style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
      >
        {label}
      </p>
      <p
        className="font-serif text-xs italic leading-snug text-[var(--ink-3)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        {sublabel}
      </p>
    </button>
  )
}
