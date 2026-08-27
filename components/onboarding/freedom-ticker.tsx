'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Meelopende vrijheidstijd-teller voor de onboarding.
 *
 * Waarom een context en geen prop: de teller hoort vanaf de eerste bezitting
 * op ELK volgend scherm te staan, maar de negen stap-componenten roepen
 * `OnboardingShell` zélf aan. Een prop zou door alle negen heen geregen moeten
 * worden (en bij elke nieuwe stap opnieuw vergeten kunnen worden). De
 * orchestrator berekent de waarde één keer en zet 'm hier neer; de shell
 * consumeert 'm. Nieuwe stappen krijgen de teller daarmee gratis.
 *
 * De waarde is bewust een kant-en-klare STRING (of `null`): de berekening en
 * alle guards wonen in `lib/freedom-ticker.ts`, deze laag beslist niets.
 * `null` = niets tonen — dat is de normale toestand tot de eerste bezitting.
 */
const FreedomTickerContext = createContext<string | null>(null)

export function OnboardingFreedomTickerProvider({
  label,
  children,
}: {
  /** Korte vrijheidstijd, bv. "1j 3m 16d". `null` ⇒ teller verbergen. */
  label: string | null
  children: ReactNode
}) {
  return (
    <FreedomTickerContext.Provider value={label}>{children}</FreedomTickerContext.Provider>
  )
}

/** Huidige tellerwaarde, of `null` buiten een provider / vóór de eerste bezitting. */
export function useOnboardingFreedomTicker(): string | null {
  return useContext(FreedomTickerContext)
}

/**
 * Tellerregel in de sticky kop. Spiegelt de publieke `/check`-teller in woord
 * ("Al vrijgekocht") en vorm (mono, tabular-nums, module-accent) zodat de
 * ingelogde onboarding niet een tweede taal spreekt voor hetzelfde getal.
 *
 * `aria-live="polite"` zodat een schermlezer de groei meldt zonder de invoer
 * te onderbreken.
 */
export function OnboardingFreedomTickerRow({ label }: { label: string }) {
  return (
    <div
      className="flex items-baseline justify-end gap-2 pb-1.5"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
        Al vrijgekocht
      </span>
      <span className="font-mono text-xs font-medium tabular-nums text-[var(--module-active-700)]">
        {label}
      </span>
    </div>
  )
}
