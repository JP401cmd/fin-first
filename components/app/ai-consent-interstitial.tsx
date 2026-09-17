'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { AiConsentFacts } from '@/components/app/ai-consent-facts'
import { postAiConsent } from '@/lib/ai/consent-client'
import type { AiConsentDecision } from '@/lib/ai/consent'
import { AI_CONSENT_INTRO, AI_CONSENT_OPTIONS, AI_CONSENT_QUESTION } from '@/lib/ai/privacy-facts'

/**
 * AiConsentInterstitial — de eenmalige AI-keuze voor accounts zonder vastgelegde
 * keuze (ADR 0155, besluit 6/7). De server bepaalt `open`
 * (`profiles.ai_consent_at IS NULL`); er is geen localStorage-pad.
 *
 * Niet wegklikbaar: `lockedOpen` zet élke sluitroute uit (X, Escape, backdrop,
 * swipe-down, terug-knop) — één prop, zodat er geen halve vergrendeling kan
 * bestaan. De overlay verdwijnt alleen na een
 * geslaagde `POST /api/consent/ai` (source `interstitial`), waarna
 * `router.refresh()` de shell opnieuw laat renderen met de nieuwe stand.
 *
 * Twee gelijkwaardige knoppen in de sticky footer, elk met hun effect en
 * waarom eronder (gekoppeld via `aria-describedby`). Kopij en feiten komen uit
 * `lib/ai/privacy-facts.ts`, dezelfde bron als de onboarding-stap en
 * /mijn/privacy.
 */
export interface AiConsentInterstitialProps {
  open: boolean
}

const DECISIONS: readonly AiConsentDecision[] = ['granted', 'withdrawn']

const noop = () => {}

export function AiConsentInterstitial({ open }: AiConsentInterstitialProps) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)
  const [saving, setSaving] = useState<AiConsentDecision | null>(null)
  const [error, setError] = useState<string | null>(null)
  const idBase = useId()

  async function kies(decision: AiConsentDecision) {
    if (saving) return
    setSaving(decision)
    setError(null)
    const result = await postAiConsent(decision, 'interstitial')
    setSaving(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setDismissed(true)
    router.refresh()
  }

  const footer = (
    <div className="space-y-3">
      {error && (
        <div role="alert" className="border border-negative/30 bg-negative-bg px-3 py-2 text-sm text-negative">
          <p>{error}</p>
          {/* Herstelpad bij een storing: alleen ná een mislukte opslag. Zet
              enkel de UI-state — er wordt niets weggeschreven, de vraag komt bij
              de volgende load terug. Verzwakt de poort niet: de handhaving is
              `ai_enabled` server-side, niet deze overlay. */}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="mt-1.5 text-xs font-medium underline underline-offset-2 text-[var(--ink-2)] hover:text-[var(--ink)]"
          >
            Later kiezen
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3">
        {DECISIONS.map((d) => {
          const opt = AI_CONSENT_OPTIONS[d]
          const effectId = `${idBase}-${d}-effect`
          return (
            <div key={d}>
              <button
                type="button"
                onClick={() => kies(d)}
                disabled={saving !== null}
                aria-describedby={effectId}
                className="w-full min-h-11 border border-[var(--ink)] bg-[var(--paper)] px-4 py-2.5 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving === d ? 'Opslaan…' : opt.keuze}
              </button>
              <p
                id={effectId}
                className="mt-1 text-[11.5px] leading-snug text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {opt.effect} {opt.waarom}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <ShellOverlay
      kind="confirm"
      open={open && !dismissed}
      onClose={noop}
      lockedOpen
      title={AI_CONSENT_QUESTION}
      footer={footer}
    >
      <div className="space-y-4 px-5 py-4">
        <p
          className="border-l-2 border-[var(--module-active-500)] pl-3 text-[14px] italic leading-snug text-[var(--ink-2)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          {AI_CONSENT_INTRO}
        </p>
        <AiConsentFacts headingLevel="h4" />
      </div>
    </ShellOverlay>
  )
}
