/**
 * housing-preview — kernel-native eigen-woning-scenario-preview voor de strategie-modal
 * (`components/identity/instellingen/housing-strategy-section.tsx`).
 *
 * (FASE 6 stap 5A — kernel-only.) De preview toont per (concept-)woonstrategie het
 * trigger-moment, de kernbedragen en de nieuwe vrijheidsleeftijd. Sinds de v2-verwijdering
 * is er nog maar één motor: woning-strategieën zijn kernel-NATIVE (de adapter mapt
 * `housing_strategy_config` → kernel-woning-params). Per scenario overschrijven we dat veld
 * op de rauwe profiel-rij en draaien we de convergentie-router
 * (`computeConvergentieProjection`) — dezelfde motor als de /toekomst-hoofdgrafiek.
 *
 * ## Coherentie / degradatie
 * De aanroepende sectie draait beide scenario-kaarten (concept + opgeslagen) door dezelfde
 * helper met dezelfde bundel → altijd dezelfde motor. Zonder rauwe kernel-context (of bij
 * een kern-fout) levert de helper een lege scenario-uitkomst — de sectie toont dan zijn
 * bestaande lege staat.
 *
 * Pure functie — geen React/Supabase/Date.now; client- én server-bruikbaar.
 */

import type { HousingStrategyConfig } from '@/lib/housing-strategy'
import { computeConvergentieProjection } from '@/lib/horizon-kernel/convergentie-router'
import { applyKernelHousingSaleToEvents } from '@/lib/horizon/kernel-display-events'
import type { HousingPreviewData, HousingScenarioResult } from '@/lib/housing-trigger'

/** Lege scenario-uitkomst bij ontbrekende context of een kern-fout. */
const EMPTY_SCENARIO: HousingScenarioResult = {
  events: [],
  depletion: null,
  fireAgeFractional: null,
  fireReachable: false,
}

/**
 * Draait deze preview-bundel? Sinds kernel-only volstaat een aanwezige rauwe kernel-context
 * (zonder context kan de kernel-invoer niet worden samengesteld).
 */
export function isHousingPreviewKernelEnabled(preview: HousingPreviewData): boolean {
  return preview.kernelRawContext != null
}

/**
 * Draai het volledige scenario voor één (concept-)strategie-config via de horizon-kernel
 * met een `housing_strategy_config`-override in de rauwe context. Levert het
 * `HousingScenarioResult`-contract; bij ontbrekende context of een kern-fout: leeg.
 */
export function runHousingScenarioPreview(
  config: HousingStrategyConfig,
  preview: HousingPreviewData,
): HousingScenarioResult {
  const raw = preview.kernelRawContext
  if (!raw) return EMPTY_SCENARIO

  const outcome = computeConvergentieProjection({
    // Profiel-override: de woning-mapping loopt native via housing_strategy_config.
    rawContext: {
      ...raw,
      profile: { ...raw.profile, housing_strategy_config: config },
    },
  })

  if (!outcome.ok) return EMPTY_SCENARIO

  return {
    // Verkoopleeftijd op de KERNEL-waarheid: hergebruikt exact de marker-helper van de
    // hoofdgrafiek (`applyKernelHousingSaleToEvents`). Met een lege basis-array levert die
    // één kernel-afgeleid verkoop-event op `kernelHousingSale.age` (downsize mét verkoop)
    // of niets (geen verkoop / opeethypotheek) — nooit een stale trigger-leeftijd.
    events: applyKernelHousingSaleToEvents([], outcome.kernelHousingSale ?? null),
    // De kernel levert geen `SimulatedDepletionResult`; het "Waarom dit moment?"-label
    // valt op de kernel-tak terug op de neutrale variant.
    depletion: null,
    fireAgeFractional: outcome.result.fireAgeFractional,
    fireReachable: outcome.result.fireReachable,
  }
}
