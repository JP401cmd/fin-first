/**
 * strategy-preview — berekent de vrijheidsleeftijd (FIRE-leeftijd) voor een set life
 * events, zodat de strategie-bewerk-modals live kunnen tonen hoe een wijziging je
 * vrijheidsleeftijd verschuift (X → Y jaar).
 *
 * (FASE 6 stap 5A — kernel-only.) De preview routeert via dezelfde
 * `computeConvergentieProjection` als de hoofdgrafiek-hook — previews en grafiek spreken per
 * constructie dezelfde motor (de horizon-kernel). De baseline draagt een rauwe kernel-context
 * (mínus de per-aanroep-events); de solver resolvet pensioen/AOW zélf. Zonder bruikbare
 * context (of bij een kern-fout) levert de preview `null`.
 */

import {
  toSimResult,
  type UnifiedProjectionResult,
} from '@/lib/unified-projection'
import {
  computeConvergentieProjection,
  type ConvergentieRawContext,
} from '@/lib/horizon-kernel/convergentie-router'
import type { LifeEvent } from '@/lib/horizon-data'

/**
 * Rauwe kernel-context voor de preview-baseline — de convergentie-context mínus de
 * per-aanroep-variabele `lifeEvents` (dat is precies wat de preview varieert; ze worden per
 * aanroep geïnjecteerd). `yearlyExpenses` blijft in de context (constant per baseline).
 */
export type PreviewKernelRawContext = Omit<ConvergentieRawContext, 'lifeEvents'>

export interface PreviewBaseline {
  /** Rauwe kernel-context (profiel/assets/debts/aow/jaaruitgaven); de events komen per aanroep. */
  rawContext: PreviewKernelRawContext
}

/** Draai de convergentie-projectie voor de gegeven events; `null` bij een kern-fout. */
function runPreview(baseline: PreviewBaseline, events: LifeEvent[]): UnifiedProjectionResult | null {
  const outcome = computeConvergentieProjection({
    rawContext: { ...baseline.rawContext, lifeEvents: events },
  })
  return outcome.ok ? outcome.result : null
}

/** Fractionele vrijheidsleeftijd voor de gegeven events (null = onbereikbaar / kern-fout). */
export function previewFireAge(baseline: PreviewBaseline, events: LifeEvent[]): number | null {
  const result = runPreview(baseline, events)
  if (!result) return null
  // De kernel resolvet pensioen/AOW zélf → lees fireAgeFractional direct uit de solve.
  return toSimResult(result).fireAgeFractional
}

/** Volledig `UnifiedProjectionResult` voor de gegeven events (null = kern-fout). */
export function previewProjection(
  baseline: PreviewBaseline,
  events: LifeEvent[],
): UnifiedProjectionResult | null {
  return runPreview(baseline, events)
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
 * Bereken de verschuiving van de vrijheidsleeftijd door één bewerkt/toegevoegd event.
 * `otherEvents` = alle huidige events behalve de bewerkte; `draftEvent` = de concept-versie
 * (of weglaten om het effect van verwijderen te tonen).
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
