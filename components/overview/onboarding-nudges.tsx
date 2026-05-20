'use client'

import Link from 'next/link'
import { Check, ArrowRight, X, Sparkles } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import {
  computeOrchestratorState,
  type OrchestratorStepKey,
} from '@/lib/onboarding-orchestrator'

/**
 * OnboardingNudges — coach-checklist op /overzicht hero.
 *
 * Rendering wordt aangedreven door `lib/onboarding-orchestrator` (plan
 * §6.7 state-machine). De pure functie beslist welke stappen unlocked
 * zijn en wat de volgende nudge is; deze component vertaalt dat naar
 * de UI inclusief per-stap-dismiss-knopjes.
 *
 * Vier stappen:
 *  1. Geboortejaar invullen
 *  2. Eerste rekening toevoegen
 *  3. Eerste doel formuleren
 *  4. Weekly briefing openen (verschijnt pas na ≥ 7 dagen)
 *
 * Per-stap-dismiss via localStorage-set `tf-onboarding-dismissed-keys`
 * (vervangt het oude globale `tf-onboarding-dismissed`). Hele kaart
 * verdwijnt zodra alle stappen completed of dismissed zijn.
 */

const DISMISS_KEYS_STORAGE = 'tf-onboarding-dismissed-keys'

function readDismissed(): Set<OrchestratorStepKey> {
  try {
    const raw = localStorage.getItem(DISMISS_KEYS_STORAGE)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed as OrchestratorStepKey[])
  } catch {
    return new Set()
  }
}

function persistDismissed(set: Set<OrchestratorStepKey>): void {
  try {
    localStorage.setItem(DISMISS_KEYS_STORAGE, JSON.stringify([...set]))
  } catch {
    // localStorage unavailable — silent no-op
  }
}

export function OnboardingNudges({
  hasDob,
  hasAssets,
  hasGoals,
  accountAgeDays = 0,
}: {
  hasDob: boolean
  hasAssets: boolean
  hasGoals: boolean
  /** Dagen sinds account-aanmaak. Default 0 — caller mag overslaan
   *  als account-age niet beschikbaar is; orchestrator gedraagt zich
   *  dan alsof de gebruiker net is begonnen. */
  accountAgeDays?: number
}) {
  // SSR-safe hydration — render niets totdat localStorage-read voltooid.
  const [dismissed, setDismissed] = useState<Set<OrchestratorStepKey> | null>(null)

  useEffect(() => {
    setDismissed(readDismissed())
  }, [])

  const handleDismiss = useCallback((key: OrchestratorStepKey) => {
    setDismissed((prev) => {
      const next = new Set(prev ?? [])
      next.add(key)
      persistDismissed(next)
      return next
    })
  }, [])

  if (dismissed === null) return null

  const state = computeOrchestratorState({
    hasDob,
    hasAssets,
    hasGoals,
    accountAgeDays,
    dismissedKeys: dismissed,
  })

  // Verberg de kaart wanneer er geen open stap meer is (alles completed
  // of dismissed). Houdt rust voor de niveau-A-gebruiker zodra hij/zij
  // door de journey heen is.
  const visibleSteps = state.steps.filter(
    (s) => s.unlocked && !s.completed && !s.dismissed,
  )
  if (visibleSteps.length === 0) return null

  const totalRelevantSteps = state.steps.filter((s) => s.unlocked).length
  const completedOrDismissed = state.steps.filter(
    (s) => s.unlocked && (s.completed || s.dismissed),
  ).length

  return (
    <section
      aria-label="Onboarding voortgang"
      className="mt-4 mb-6 rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50/40 to-stone-50 p-4 sm:p-5"
    >
      <header className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-violet-700">
            Aan de slag · {completedOrDismissed}/{totalRelevantSteps} voltooid
          </div>
          <h2 className="font-serif text-base sm:text-lg text-[var(--ink)] mt-0.5">
            {state.currentStage === 'tips'
              ? 'Klaar voor je eerste briefing'
              : 'Drie stappen voor een compleet overzicht'}
          </h2>
        </div>
      </header>

      <ol className="space-y-2">
        {state.steps
          .filter((s) => s.unlocked && !s.completed && !s.dismissed)
          .map((step) => (
            <li
              key={step.key}
              data-testid={`nudge-step-${step.key}`}
              className="flex items-center gap-3 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 transition-all"
            >
              <span
                className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-violet-100 text-violet-700 shrink-0"
                aria-hidden="true"
              >
                {step.key === 'open-briefing' ? (
                  <Sparkles className="w-3.5 h-3.5" />
                ) : (
                  <span className="text-xs font-bold">
                    {state.steps.findIndex((x) => x.key === step.key) + 1}
                  </span>
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[var(--ink)]">
                  {step.label}
                </div>
                <p className="text-[11px] leading-snug mt-0.5 text-[var(--ink-3)]">
                  {step.description}
                </p>
              </div>
              <Link
                href={step.ctaHref}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:underline shrink-0"
              >
                {step.ctaLabel}
                <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </Link>
              <button
                type="button"
                onClick={() => handleDismiss(step.key)}
                aria-label={`Stap '${step.label}' overslaan`}
                className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[var(--ink-3)] hover:bg-[var(--subtle)] transition-colors shrink-0"
              >
                <X className="w-3 h-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        {/* Completed-stappen tonen we visueel doorgestreept als context,
            zodat de gebruiker progressie ziet zonder dat dit ruimte
            voor de actie-rij steelt. */}
        {state.steps
          .filter((s) => s.unlocked && s.completed)
          .map((step) => (
            <li
              key={step.key}
              data-testid={`nudge-step-${step.key}-done`}
              className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3"
            >
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500 text-white shrink-0">
                <Check className="w-4 h-4" aria-hidden="true" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-emerald-800 line-through decoration-emerald-300">
                  {step.label}
                </div>
              </div>
            </li>
          ))}
      </ol>
    </section>
  )
}
