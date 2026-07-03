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
 *
 * FASE 6, stap 1 (kernel-pad): de baseline kan additief een kernel-context dragen
 * (`kernelEnabled` + `kernelRawContext`, vlag `horizon_kernel_convergentie`).
 * De preview routeert dan via dezelfde `computeConvergentieProjection` als de
 * hoofdgrafiek-hook — previews en grafiek spreken per constructie dezelfde motor.
 * Vlag uit (of context afwezig) → byte-identiek aan vandaag: de router draait
 * LETTERLIJK `runSelectedProjection(input, useV2, strategyOptions)`.
 */

import { lifeEventsToCashflows } from '@/lib/fire-simulation'
import {
  toSimResult,
  type UnifiedProjectionInput,
} from '@/lib/unified-projection'
import type { HorizonStrategyOptions } from '@/lib/horizon-engine/strategies'
import {
  computeConvergentieProjection,
  type ConvergentieRawContext,
} from '@/lib/horizon-kernel/convergentie-router'
import type { LifeEvent } from '@/lib/horizon-data'

/**
 * Rauwe kernel-context voor de preview-baseline — de convergentie-context mínus
 * de per-aanroep-variabelen: `lifeEvents` worden per preview-aanroep geïnjecteerd
 * (dat is precies wat de preview varieert) en `yearlyExpenses` komt uit de al
 * gebouwde `baseline.input` (zelfde grondslag als de hook meegeeft).
 */
export type PreviewKernelRawContext = Omit<
  ConvergentieRawContext,
  'lifeEvents' | 'yearlyExpenses'
>

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
   * Alleen van toepassing op de v2-tak: op de kernel-tak doet de solver de
   * AOW-kortsluiting zélf (spiegel van de hook, die het pensioen-post-processing-
   * blok op de kernel-tak overslaat).
   */
  pensioenFireAgeFractional?: number | null
  /**
   * FASE 6, stap 1 — vlag `horizon_kernel_convergentie` (dezelfde vlag-beslissing
   * als de hoofdgrafiek-hook op het oppervlak). Alleen een letterlijke `true`
   * (én een aanwezige `kernelRawContext`) laat de preview via de kernel lopen.
   */
  kernelEnabled?: boolean
  /** Rauwe kernel-context; afwezig → v2 (byte-identiek aan vandaag). */
  kernelRawContext?: PreviewKernelRawContext
}

/** Fractionele vrijheidsleeftijd voor de gegeven events (null = onbereikbaar). */
export function previewFireAge(baseline: PreviewBaseline, events: LifeEvent[]): number | null {
  const input: UnifiedProjectionInput = {
    ...baseline.input,
    cashflows: lifeEventsToCashflows(events),
  }
  // Dezelfde motorschakelaar als de hoofdgrafiek-hook: vlag uit → letterlijk
  // `runSelectedProjection(input, useV2, strategyOptions)` (byte-identiek);
  // vlag aan → kernel met de rauwe events van deze preview-aanroep.
  const kernelEnabled = baseline.kernelEnabled === true && !!baseline.kernelRawContext
  const outcome = computeConvergentieProjection({
    builtInput: input,
    strategyOptions: baseline.strategyOptions,
    v2FlagArg: baseline.useV2,
    kernelEnabled,
    rawContext: baseline.kernelRawContext
      ? {
          ...baseline.kernelRawContext,
          lifeEvents: events,
          yearlyExpenses: baseline.input.yearlyExpenses,
        }
      : undefined,
  })
  const sim = toSimResult(outcome.result)
  // Pensioen: getoonde vrijheidsleeftijd = AOW-leeftijd (gelijk aan de grafiek),
  // niet het binary-search-minimum. NIET op de kernel-tak — daar doet de solver
  // de AOW-kortsluiting zelf en toont de hook het kernel-resultaat direct.
  if (outcome.engine !== 'kernel' && baseline.pensioenFireAgeFractional != null) {
    return baseline.pensioenFireAgeFractional
  }
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
