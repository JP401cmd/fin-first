'use client'

import { useCallback } from 'react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'
import { GOAL_CATALOG_ENTRIES } from '@/lib/goals/catalog'
import type { GoalSlug } from '@/lib/goals/types'

/**
 * Stap 1 — Doel.
 *
 * Vervangt de oude `OnboardingIntro` + `OnboardingGoal` (twee stappen → één).
 * Multi-select tiles voor de 6 outcome-georiënteerde doelen uit
 * `lib/goals/catalog.ts`. De gebruiker mag 1+ doelen kiezen; module-afleiding
 * gebeurt orchestrator-side door `GOAL_MODULE_PRESETS` van alle gekozen
 * goals te unioneren (zie plan §"Implementatie-stappen" punt 1).
 *
 * **News-only opt-out**: tekstlink rechtsonder de tiles roept `onNewsOnly`
 * aan — orchestrator schakelt dan over naar `activeModules: ['nieuws']` en
 * spring naar de `nieuws_only`-stap. Bewust geen ja/nee-tile-paar: news-only
 * is een uitzonderingspad, niet een gelijkwaardig alternatief.
 *
 * **Tile-style**: scherpe hoeken (krant-DNA), 2-koloms grid op desktop,
 * 1-kolom op mobile. Selected-state krijgt `bg-[var(--module-active-50)]`
 * + 2px module-streep boven (mini-artikel-blueprint accent). Touch-target
 * ≥44px via min-h-[64px] op de hele tile.
 *
 * **Facts-paneel**: vaste copy uit het plan (NIBUD-Geldcompas, 2024).
 */
export interface OnboardingDoelProps {
  selectedGoals: GoalSlug[]
  onChange: (goals: GoalSlug[]) => void
  onNext: () => void
  onBack?: () => void
  /** Opt-out naar news-only — orchestrator hanteert state-switch + navigation. */
  onNewsOnly: () => void
  /** 1-indexed stap-nummer voor de voortgangsbalk (default 1). */
  currentStep?: number
  totalSteps?: number
}

export function OnboardingDoel({
  selectedGoals,
  onChange,
  onNext,
  onBack,
  onNewsOnly,
  currentStep = 1,
  totalSteps = 5,
}: OnboardingDoelProps) {
  const hasSelection = selectedGoals.length > 0

  const toggleGoal = useCallback(
    (slug: GoalSlug) => {
      // Multi-select: toggle aan/uit. Volgorde behouden zodat de "primary"
      // goal (eerste in array) stabiel is voor `getGoalFirstWinPath`.
      if (selectedGoals.includes(slug)) {
        onChange(selectedGoals.filter((g) => g !== slug))
      } else {
        onChange([...selectedGoals, slug])
      }
    },
    [selectedGoals, onChange],
  )

  // Headline-em: italic Playfair op "mee" in --module-active-700. We bouwen
  // de inline-em hier zodat OnboardingShell de title-prop als ReactNode kan
  // ontvangen — geen string-split-trucs in de shell zelf.
  const headline = (
    <>
      Waar help ik je{' '}
      <em
        className="font-normal italic"
        style={{ color: 'var(--module-active-700)' }}
      >
        mee
      </em>
      ?
    </>
  )

  return (
    <OnboardingShell
      kicker="Doel"
      romanNum="i."
      title={headline}
      deck="Dit duurt ongeveer 4 minuten. Je antwoorden bepalen welke onderdelen je dashboard krijgt — je past alles later aan."
      factsPanel={
        <FactsPanel
          stat="68%"
          sub="van Nederlanders wil eerder stoppen met werken"
          source="NIBUD Geldcompas, 2024"
        />
      }
      currentStep={currentStep}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={
        <div className="flex w-full gap-3">
          <button
            type="button"
            onClick={onNext}
            disabled={!hasSelection}
            className="flex-1 min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Verder
          </button>
        </div>
      }
    >
      {/* Tile-grid: 1 col mobile, 2 cols desktop. Geen `rounded-*` (krant). */}
      <div
        role="group"
        aria-label="Kies één of meer doelen"
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        {GOAL_CATALOG_ENTRIES.map((goal) => {
          const isSelected = selectedGoals.includes(goal.slug)
          return (
            <button
              key={goal.slug}
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              onClick={() => toggleGoal(goal.slug)}
              className={`group relative min-h-[88px] border-2 p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] ${
                isSelected
                  ? 'border-[var(--module-active-500)] bg-[var(--module-active-50)]/60'
                  : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
              }`}
            >
              {/* Selected: 3px module-accent boven de tile (mini-artikel
                  blueprint). Niet als border-top maar als een absolute span
                  zodat de border-2 ringkleur intact blijft. */}
              {isSelected && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-[3px]"
                  style={{ background: 'var(--module-active-500)' }}
                />
              )}

              <div className="flex items-start gap-3">
                {/* Emoji als icoon — bewust, niet lucide. Catalog levert
                    emoji die ook in andere goal-UI's wordt gebruikt. */}
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center text-xl bg-[var(--subtle)]"
                >
                  {goal.emoji}
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-semibold leading-tight ${
                      isSelected ? 'text-[var(--module-active-700)]' : 'text-[var(--ink)]'
                    }`}
                  >
                    {goal.label}
                  </p>
                  <p
                    className="mt-1 text-xs italic leading-snug text-[var(--ink-3)]"
                    style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                  >
                    {goal.tagline}
                  </p>
                </div>

                {/* Checkmark rechtsboven bij selected — 5×5 square, geen ronde
                    checkbox (krant-stijl). */}
                <span
                  aria-hidden
                  className={`flex h-5 w-5 shrink-0 items-center justify-center border ${
                    isSelected
                      ? 'border-[var(--module-active-500)] bg-[var(--module-active-500)]'
                      : 'border-[var(--border-md)] bg-[var(--paper)]'
                  }`}
                >
                  {isSelected && (
                    <svg
                      className="h-3 w-3 text-[var(--paper)]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* News-only opt-out — bewust subtiel onder de tiles. Tekstlink, geen
          knop met box — die zou de tile-keuze verwarrend maken. */}
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onNewsOnly}
          className="text-xs underline-offset-4 italic text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Ik wil alleen het nieuws lezen &rarr;
        </button>
      </div>
    </OnboardingShell>
  )
}
