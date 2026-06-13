/**
 * strategy-preview — berekent de vrijheidsleeftijd (FIRE-leeftijd) voor een set
 * life events, zodat de strategie-bewerk-modals live kunnen tonen hoe een
 * wijziging je vrijheidsleeftijd verschuift (X → Y jaar).
 *
 * Cutover (C4, ADR 0016): de baseline draagt nu de VOLLEDIGE
 * `UnifiedProjectionInput` (per-asset/per-schuld, zoals de Tijdas-grafiek) i.p.v.
 * een lossy scalar `portfolio = totalAssets − totalDebts`, en draait door de
 * flag-bewuste engine-selector (`runSelectedProjection`). Daardoor matchen de
 * AOW/Pensioen-previews per constructie de v2-grafiek voor v2-gebruikers (en
 * blijven ze v1 wanneer de flag uit staat). De server (gebeurtenissen/page.tsx)
 * bouwt de input via de gedeelde `buildHorizonInput` — één assemblagepad.
 */

import { lifeEventsToCashflows } from '@/lib/fire-simulation'
import {
  toSimResult,
  type UnifiedProjectionInput,
} from '@/lib/unified-projection'
import { runSelectedProjection } from '@/lib/horizon-engine/select'
import type { HorizonStrategyOptions } from '@/lib/horizon-engine/strategies'
import type { LifeEvent } from '@/lib/horizon-data'

export interface PreviewBaseline {
  /**
   * Volledig samengestelde projectie-input (assets/debts/strategie/withdrawal/…),
   * IDENTIEK aan wat de Tijdas-grafiek voedt — gebouwd via `buildHorizonInput`.
   * De `cashflows` worden per preview-aanroep vervangen door de doorgegeven events.
   */
  input: UnifiedProjectionInput
  /** Of de gebruiker de v2-grootboek-engine draait (`isHorizonV2Enabled`). */
  useV2: boolean
  /** Pot-regel-afgeleide engine-opties (alleen relevant voor v2; undefined = defaults). */
  strategyOptions?: Partial<HorizonStrategyOptions>
  /**
   * Pensioen-modus: de fractionele AOW-leeftijd (= getoonde vrijheidsleeftijd,
   * gelijk aan de hook). Wanneer gezet, retourneert de preview deze waarde i.p.v.
   * het binary-search-resultaat — net als `useHorizonFireSim`/de grafiek.
   */
  pensioenFireAgeFractional?: number | null
}

/** Fractionele vrijheidsleeftijd voor de gegeven events (null = onbereikbaar). */
export function previewFireAge(baseline: PreviewBaseline, events: LifeEvent[]): number | null {
  const input: UnifiedProjectionInput = {
    ...baseline.input,
    cashflows: lifeEventsToCashflows(events),
  }
  const sim = toSimResult(runSelectedProjection(input, baseline.useV2, baseline.strategyOptions))
  // Pensioen: getoonde vrijheidsleeftijd = AOW-leeftijd (gelijk aan de grafiek),
  // niet het binary-search-minimum.
  if (baseline.pensioenFireAgeFractional != null) return baseline.pensioenFireAgeFractional
  return sim.fireAgeFractional
}

export interface FreedomShift {
  /** Vrijheidsleeftijd zonder de wijziging. */
  baselineAge: number | null
  /** Vrijheidsleeftijd mét de wijziging. */
  draftAge: number | null
  /** Verschil in maanden (negatief = eerder vrij). null als één van beide onbereikbaar. */
  deltaMonths: number | null
}

/**
 * Bereken de verschuiving van de vrijheidsleeftijd door één bewerkt/toegevoegd
 * event. `otherEvents` = alle huidige events behalve de bewerkte; `draftEvent`
 * = de concept-versie (of weglaten om het effect van verwijderen te tonen).
 */
export function computeFreedomShift(
  baseline: PreviewBaseline,
  otherEvents: LifeEvent[],
  draftEvent: LifeEvent | null,
): FreedomShift {
  const baselineAge = previewFireAge(baseline, otherEvents)
  const draftAge = previewFireAge(
    baseline,
    draftEvent ? [...otherEvents, draftEvent] : otherEvents,
  )
  const deltaMonths =
    baselineAge != null && draftAge != null
      ? Math.round((draftAge - baselineAge) * 12)
      : null
  return { baselineAge, draftAge, deltaMonths }
}
