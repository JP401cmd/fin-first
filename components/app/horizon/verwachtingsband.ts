/**
 * Verwachtingsband — de twee randen van de "waarschijnlijk ben je vrij tussen X en Y"-zin
 * op de Vrijheidsas (/toekomst), en de `laatst`-input van `computeStopMarge`.
 *
 * ## Consume, don't recompute
 * Puur afgeleid uit een ál gedraaide run (hoofdlijn of scenario): één aanroep van
 * `buildScenarioPathsFromSim` (sim-chart.tsx — de enige home van de ±0,02-variantenband,
 * `SCENARIO_VARIANTS`) levert `[pessimist, baseline, optimist]`; wij nemen daar de twee
 * randen uit. GEEN extra kernel-run, geen tweede formule.
 *   - `laatstFireAge`  = pessimist (Voorzichtig, rendement −0,02) → index 0
 *   - `vroegstFireAge` = optimist  (Optimistisch, rendement +0,02) → index 2
 *
 * ## Grondslag (ADR 0034 — I vs. J): het pad is INCL. eigen woning
 * De rijen die de band aftast dragen `SimRow.endPortfolio`, en dat is via
 * `toSimRow` (`endPortfolio: row.netWorth`) het TOTALE netto vermogen — inclusief de
 * eigen woning. De drempel moet dus op diezelfde grondslag liggen:
 * `requiredFireNetWorth` (Prognose!I@FIRE, incl. woning), NIET `requiredFirePortfolio`
 * (Prognose!J@FIRE, liquide/excl. woning).
 *
 * Onder woningstrategie "meerekenen" geldt J == I (`fire-basis-invariant.test.ts`) → daar
 * is de keuze byte-identiek. Onder élke andere strategie (uitsluiten/verkoop/opeethypotheek)
 * is I > J met precies de overwaarde, en kruiste het incl.-woning-pad de liquide drempel
 * die overwaarde te vroeg — waardoor `vroegst`/`laatst` jaren vóór de verwachte
 * FIRE-leeftijd uitkwamen en de marge-zone in `stop-marge.ts` vrijwel altijd "stevig" werd.
 *
 * Terugval op `requiredFirePortfolio` blijft bestaan voor resultaten die het (optionele)
 * incl.-woning-doel niet dragen — stub-/mock-/preview-`SimResult`s. Het echte kernel-pad
 * vult het altijd, en dan geldt I ≥ J.
 */

import type { SimResult } from '@/lib/fire-simulation'
import { buildScenarioPathsFromSim } from './sim-chart'

/** De twee randen van de verwachtingsband; `null` = die variant haalt het doel nooit. */
export interface Verwachtingsband {
  /** FIRE-leeftijd van de OPTIMISTISCHE variant (+0,02) — de vroege rand. */
  vroegstFireAge: number | null
  /** FIRE-leeftijd van de VOORZICHTIGE variant (−0,02) — de late rand (`laatst`). */
  laatstFireAge: number | null
}

/** Lege band (geen rijen / geen bruikbaar doel) — gedeelde, bevroren identiteit. */
export const LEGE_VERWACHTINGSBAND: Verwachtingsband = Object.freeze({
  vroegstFireAge: null,
  laatstFireAge: null,
})

/**
 * De velden die de band uit een run nodig heeft. Bewust een `Pick` op `SimResult` zodat
 * zowel de hoofdrun als de scenario-run (beide `SimResult`) er zonder cast in passen.
 */
export type VerwachtingsbandBron = Pick<SimResult, 'rows' | 'requiredFirePortfolio'> &
  Partial<Pick<SimResult, 'requiredFireNetWorth'>>

/**
 * Het FIRE-doel op de grondslag van de RIJEN (netto vermogen incl. eigen woning):
 * `requiredFireNetWorth` (I@FIRE), met `requiredFirePortfolio` (J@FIRE) als terugval
 * wanneer het incl.-woning-doel ontbreekt of degenereert (0/negatief/niet-eindig).
 */
export function resolveVerwachtingsbandDoel(sim: VerwachtingsbandBron | null | undefined): number {
  const inclWoning = sim?.requiredFireNetWorth
  if (inclWoning != null && Number.isFinite(inclWoning) && inclWoning > 0) return inclWoning
  const liquide = sim?.requiredFirePortfolio
  return liquide != null && Number.isFinite(liquide) ? liquide : 0
}

/**
 * Leid beide randen van de verwachtingsband af uit één run — ÉÉN aanroep van
 * `buildScenarioPathsFromSim` voor beide (voorheen twee identieke aanroepen in twee memo's).
 * Geen rijen of geen positief doel ⇒ lege band.
 */
export function computeVerwachtingsband(
  sim: VerwachtingsbandBron | null | undefined,
  grossReturn: number,
): Verwachtingsband {
  const rows = sim?.rows ?? []
  const fireDoel = resolveVerwachtingsbandDoel(sim)
  if (rows.length === 0 || !(fireDoel > 0)) return LEGE_VERWACHTINGSBAND
  // [pessimist, baseline, optimist] — zie SCENARIO_VARIANTS in sim-chart.tsx.
  const paths = buildScenarioPathsFromSim(rows, grossReturn, fireDoel)
  return {
    laatstFireAge: paths[0]?.fireAge ?? null,
    vroegstFireAge: paths[2]?.fireAge ?? null,
  }
}
