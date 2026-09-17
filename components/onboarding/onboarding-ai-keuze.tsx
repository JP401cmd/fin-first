'use client'

import { useState } from 'react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'
import { BetaAddonChoice } from '@/components/app/beta-addon/beta-addon-choice'
import { postBetaAddon } from '@/lib/beta-addons-client'
import { BETA_ADDON_COPY, BETA_SELF_SERVE_ADDONS } from '@/lib/beta-addons'
import { postAiConsent } from '@/lib/ai/consent-client'
import {
  AI_CONSENT_PANEL_SOURCE,
  AI_CONSENT_PANEL_SUB,
  aiFeaturesLostWithoutConsent,
} from '@/lib/ai/privacy-facts'

/**
 * Eerste onboarding-stap — "Fin en je gegevens" (ADR 0155, aangevuld door ADR 0157).
 *
 * Eén schakelaar "Fin gebruiken" met de beta-uitleg: straks een abonnement, nu een
 * eigen keuze. De schakelaar start uit (geen voorselectie). De privacyverklaring
 * klapt pas open als hij aan gaat — dezelfde body (`BetaAddonChoice`) als de popup
 * in de app.
 *
 * "Verder" legt de keuze vast vóór de flow doorgaat:
 *   - aan → `POST /api/beta/addon` (source `onboarding`): eerst de toestemming,
 *     dan de AI-add-on;
 *   - uit → dezelfde route met `active: false`: de add-on eraf (ook een eerder
 *     in deze onboarding of door beheer gezette) en een vastgelegde "nee".
 * Geen localStorage: de server is de bron.
 */
export interface OnboardingAiKeuzeProps {
  onNext: () => void
  currentStep?: number
  totalSteps?: number
}

const COPY = BETA_ADDON_COPY.ai

export function OnboardingAiKeuze({ onNext, currentStep = 1, totalSteps = 8 }: OnboardingAiKeuzeProps) {
  const [on, setOn] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleNext() {
    if (saving) return
    setSaving(true)
    setError(null)
    // Beta gesloten: dan is dit weer alleen de toestemmingsvraag (ADR 0155); de
    // add-on komt via het abonnement.
    const result = BETA_SELF_SERVE_ADDONS
      ? await postBetaAddon('ai', on, 'onboarding')
      : await postAiConsent(on ? 'granted' : 'withdrawn', 'onboarding')
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
      title={COPY.titel}
      deck="Fin is de AI in TriFinity: hij vertaalt je cijfers naar vrijheidstijd, schrijft je briefing en beantwoordt je vragen."
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
          disabled={saving}
          className="w-full min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Opslaan…' : on ? 'Verder met AI' : 'Verder zonder AI'}
        </button>
      }
    >
      <div className="space-y-6">
        {error && (
          <div className="border border-negative/30 bg-negative-bg px-4 py-3" role="alert">
            <p className="text-sm font-medium text-negative">{error}</p>
          </div>
        )}
        <BetaAddonChoice
          tier="ai"
          on={on}
          onChange={(next) => {
            setOn(next)
            setError(null)
          }}
          disabled={saving}
          headingLevel="h2"
          confirmLabel="Verder met AI"
        />
      </div>
    </OnboardingShell>
  )
}
