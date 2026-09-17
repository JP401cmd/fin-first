'use client'

import { useState, type ReactNode } from 'react'
import { Lock, Sparkles } from 'lucide-react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'
import { StrategyTile } from './strategy-tile'
import { AiConsentFacts } from '@/components/app/ai-consent-facts'
import { postAiConsent } from '@/lib/ai/consent-client'
import type { AiConsentDecision } from '@/lib/ai/consent'
import {
  AI_CONSENT_INTRO,
  AI_CONSENT_OPTIONS,
  AI_CONSENT_PANEL_SOURCE,
  AI_CONSENT_PANEL_SUB,
  AI_CONSENT_QUESTION,
  aiFeaturesLostWithoutConsent,
} from '@/lib/ai/privacy-facts'

/**
 * Eerste onboarding-stap — "Fin en je gegevens" (ADR 0155, kaart UR3-16).
 *
 * Cloud-AI draait pas na een expliciete, gelogde keuze. Deze stap stelt die
 * vraag vóór de eerste inhoudelijke vraag, met twee gelijkwaardige tegels (geen
 * voorselectie) en de feiten eronder. "Verder" blijft uit tot er gekozen is en
 * schrijft de keuze via `POST /api/consent/ai` (source `onboarding`); pas na een
 * geslaagde schrijfactie gaat de flow door. Geen localStorage: of er al gekozen
 * is, weet alleen de server (`profiles.ai_consent_at`). Wie deze stap via een
 * hersteld concept overslaat, krijgt de keuze-overlay in de app-shell.
 *
 * Alle kopij komt uit `lib/ai/privacy-facts.ts` — dezelfde bron als de overlay
 * en /mijn/privacy. Geen `dataNote`: dit scherm ís de gegevensuitleg. Geen
 * romeins cijfer: de stap deelt de voortgangsgroep met Profiel maar is geen
 * eigen categorie. Geen `onBack`: dit is de eerste stap.
 */
export interface OnboardingAiKeuzeProps {
  onNext: () => void
  currentStep?: number
  totalSteps?: number
}

const DECISIONS: readonly AiConsentDecision[] = ['granted', 'withdrawn']

const ICONS: Record<AiConsentDecision, ReactNode> = {
  granted: <Sparkles className="h-4 w-4" strokeWidth={2} />,
  withdrawn: <Lock className="h-4 w-4" strokeWidth={2} />,
}

export function OnboardingAiKeuze({ onNext, currentStep = 1, totalSteps = 8 }: OnboardingAiKeuzeProps) {
  const [decision, setDecision] = useState<AiConsentDecision | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleNext() {
    if (!decision || saving) return
    setSaving(true)
    setError(null)
    const result = await postAiConsent(decision, 'onboarding')
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onNext()
  }

  return (
    <OnboardingShell
      kicker="Fin en je gegevens"
      title={AI_CONSENT_QUESTION}
      deck={AI_CONSENT_INTRO}
      factsPanel={
        <FactsPanel
          stat={String(aiFeaturesLostWithoutConsent().length)}
          sub={AI_CONSENT_PANEL_SUB}
          source={AI_CONSENT_PANEL_SOURCE}
        />
      }
      currentStep={currentStep}
      totalSteps={totalSteps}
      footer={
        <button
          type="button"
          onClick={handleNext}
          disabled={!decision || saving}
          className="w-full min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Opslaan…' : 'Verder'}
        </button>
      }
    >
      <div className="space-y-6">
        {error && (
          <div className="border border-negative/30 bg-negative-bg px-4 py-3" role="alert">
            <p className="text-sm font-medium text-negative">{error}</p>
          </div>
        )}

        <div role="group" aria-label={AI_CONSENT_QUESTION} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DECISIONS.map((d) => {
            const opt = AI_CONSENT_OPTIONS[d]
            return (
              <StrategyTile
                key={d}
                icon={ICONS[d]}
                label={opt.keuze}
                sublabel={`${opt.effect} ${opt.waarom}`}
                active={decision === d}
                onClick={() => {
                  setDecision(d)
                  setError(null)
                }}
              />
            )
          })}
        </div>

        <AiConsentFacts headingLevel="h2" />
      </div>
    </OnboardingShell>
  )
}
