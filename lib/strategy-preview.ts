/**
 * strategy-preview — berekent de vrijheidsleeftijd (FIRE-leeftijd) voor een set
 * life events, zodat de strategie-bewerk-modals live kunnen tonen hoe een
 * wijziging je vrijheidsleeftijd verschuift (X → Y jaar).
 *
 * Spiegelt bewust het bestaande impact-patroon uit
 * `components/app/horizon/event-pane-view.tsx`: plain runSimulation met
 * portfolio = totalAssets − totalDebts. Baseline en draft via dezelfde functie
 * → een intern consistent verschil.
 */

import { runSimulation, lifeEventsToCashflows } from '@/lib/fire-simulation'
import type { LifeEvent } from '@/lib/horizon-data'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'

export interface PreviewBaseline {
  currentAge: number
  endAge: number
  /** totalAssets − totalDebts (zelfde als EventPaneView). */
  portfolio: number
  yearlyExpenses: number
  annualSavings: number
  grossReturn: number
  inflation: number
  fireStrategy: FireStrategyConfig
  withdrawalStrategy: WithdrawalStrategyConfig
}

/** Fractionele vrijheidsleeftijd voor de gegeven events (null = onbereikbaar). */
export function previewFireAge(baseline: PreviewBaseline, events: LifeEvent[]): number | null {
  const sim = runSimulation(
    baseline.currentAge,
    baseline.endAge,
    baseline.portfolio,
    baseline.yearlyExpenses,
    baseline.annualSavings,
    baseline.grossReturn,
    'nl_box3',
    baseline.inflation,
    lifeEventsToCashflows(events),
    baseline.fireStrategy,
    baseline.withdrawalStrategy,
  )
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
