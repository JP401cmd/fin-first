'use client'

import { useId } from 'react'
import { AiConsentFacts } from '@/components/app/ai-consent-facts'
import { AI_CONSENT_INTRO } from '@/lib/ai/privacy-facts'
import { BETA_ADDON_COPY, betaAddonNotice, type BetaAddonTier } from '@/lib/beta-addons'

/**
 * BetaAddonChoice — de body van de beta-keuze (ADR 0157), één keer in JSX voor
 * twee hosts: de popup in de app (`BetaAddonDialog`) en de onboardingstap.
 *
 * Opbouw: "straks een abonnement, nu een keuze" · de schakelaar (geen
 * voorselectie: start uit) · wat aan of uit betekent (effect · waarom). Bij AI
 * klapt de privacyverklaring (`AiConsentFacts`, dezelfde bron als ADR 0155) pas
 * open zodra de schakelaar aan staat — wie AI niet wil, hoeft die niet te lezen;
 * wie hem wel aanzet, ziet waarvoor hij toestemming geeft vóór hij bevestigt.
 *
 * Gecontroleerd: de host houdt `on` bij en beslist wat bevestigen doet.
 */
export interface BetaAddonChoiceProps {
  tier: BetaAddonTier
  on: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  /** Koppenniveau van de privacyfeiten: h2 in de onboarding, h4 in de popup. */
  headingLevel?: 'h2' | 'h4'
  /** De knop waarmee de host bevestigt; standaard de popupknop. */
  confirmLabel?: string
}

const SERIF = 'var(--font-source-serif, Georgia, serif)'

export function BetaAddonChoice({ tier, on, onChange, disabled = false, headingLevel = 'h4', confirmLabel }: BetaAddonChoiceProps) {
  const copy = BETA_ADDON_COPY[tier]
  const labelId = useId()
  const effectId = useId()
  const uitleg = on ? copy.aan : copy.uit

  return (
    <div className="space-y-4">
      <p
        className="border-l-2 border-[var(--module-active-500)] pl-3 text-[14px] italic leading-snug text-[var(--ink-2)]"
        style={{ fontFamily: SERIF }}
      >
        <span className="mr-1.5 not-italic font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
          Beta
        </span>
        {betaAddonNotice(tier)}
      </p>

      <div className="flex items-center justify-between gap-4 border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3">
        <span id={labelId} className="text-sm font-medium text-[var(--ink)]">
          {copy.schakelaar}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={labelId}
          aria-describedby={effectId}
          disabled={disabled}
          onClick={() => onChange(!on)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50 ${
            on ? 'bg-[var(--module-active-600)]' : 'bg-[var(--border-md)]'
          }`}
        >
          <span
            aria-hidden
            className={`inline-block h-4 w-4 rounded-full bg-[var(--paper)] shadow-sm transition-transform duration-200 ${
              on ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <p id={effectId} className="text-[13px] leading-snug text-[var(--ink-2)]" style={{ fontFamily: SERIF }}>
        {uitleg.effect} {uitleg.waarom}
      </p>

      {tier === 'ai' && on && (
        <div className="space-y-3">
          <p className="text-[13px] leading-snug text-[var(--ink-2)]" style={{ fontFamily: SERIF }}>
            {AI_CONSENT_INTRO}
          </p>
          <AiConsentFacts headingLevel={headingLevel} />
          <p className="text-[12px] italic leading-snug text-[var(--ink-3)]" style={{ fontFamily: SERIF }}>
            Met “{confirmLabel ?? copy.bevestig}” geef je Fin toestemming voor wat hierboven staat.
          </p>
        </div>
      )}
    </div>
  )
}
