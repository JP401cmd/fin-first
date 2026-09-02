/**
 * Horizon-kernel — runway-lezer: "als ik vandaag stop met werken, in welke maand
 * raakt mijn liquide vermogen op?" (ADR 0126, PR B — motor-laag).
 *
 * Domein-zuiver: leest uitsluitend Prognose!J (`nettoLiquide`) uit een voltooide
 * projectie; kent geen app-type, geen Supabase, geen Date.now. De projectie komt
 * uit `evaluateFireAt(input, input.startLeeftijd, { guardrailsAnker })` — FIRE-maand
 * 0 — via het gedeelde geforceerde-stop-recept (`buildForcedStopSolve`,
 * lib/horizon/scenario-presets.ts); de duiding tot een `RunwayResult` woont in
 * lib/horizon/runway.ts. Deze module levert alleen het MAANDNUMMER.
 *
 * ── Waarom een AANHOUD-regel ────────────────────────────────────────────────
 * Bij uitputting stopt de kernel niet: hij leent via de tekort-lening (S-slot met rol
 * `tekortLening`) en J daalt door — óf herstelt, bv. wanneer een huisverkoop
 * ("wanneer nodig") één maand later liquide oplevert, of wanneer de AOW jaren later
 * de onttrekking dekt. Een bruggetje van één maand is geen einde van de runway; een
 * dip die pas jaren later door AOW wordt gered is dat wél ("dan moet je lenen").
 *
 * De grens is DEZELFDE als die van de tekort-melding (`detectDeficitLoanFromRows`,
 * lib/horizon/deficit-loan-display.ts): een episode die bewezen herstelt binnen
 * `MAX_TRANSIENT_SPAN_YEARS` is een liquiditeitsbrug; alles wat langer aanhoudt — of
 * aan het horizon-einde nog openstaat — telt. Eén constante, één home: híer, want de
 * app-laag mag de kernel importeren en niet omgekeerd (de kernel gebruikt intern
 * uitsluitend relatieve imports). `deficit-loan-display.ts` importeert 'm vanaf hier.
 *
 * ── Rekenregel ──────────────────────────────────────────────────────────────
 * Een maand m ∈ [0, lastInHorizonMonth] is UITGEPUT als `round(J(m)) ≤ 0` (hele
 * euro's: float-ruis van ±€0,40 rond nul telt als nul, zoals de €1-materialiteits-
 * gate van de tekort-melding). Aaneengesloten uitgeputte maanden vormen een
 * EPISODE [first, last]. Een episode is TRANSIENT wanneer ze bewezen herstelt (er
 * volgt een in-horizon maand met J > 0) én `last − first ≤ MAX_TRANSIENT_SPAN_MONTHS`
 * — de maand-vertaling van "span ≤ 1 jaar" uit de tekort-melding, dus ten hoogste
 * dertien opeenvolgende uitgeputte maanden. Elke andere episode is AANHOUDEND, en
 * `depletionMonth` is de `first` van de eerste aanhoudende episode. Geen zo'n
 * episode ⇒ `null` (J blijft — op bruggetjes na — positief tot de horizon).
 */

import type { KernelRunSummary } from './engine'

/**
 * Een liquiditeitsdip die binnen dit aantal jaar volledig herstelt is een
 * ZELFHERSTELLEND bruggetje (huisverkoop-transitie), geen einde van de runway en
 * geen staande tekort-schuld. Zie `deficit-loan-display.ts` voor de kalibratie
 * (= 1, niet 0: marge voor een brug die een jaargrens overspant; bewust
 * magnitude-blind — elk tekort dat binnen ~1 jaar zelfherstelt is per definitie
 * een liquiditeitsbrug).
 */
export const MAX_TRANSIENT_SPAN_YEARS = 1

/** Dezelfde grens in kernel-maanden (12 per jaar; de kernel kent geen kalender). */
export const MAX_TRANSIENT_SPAN_MONTHS = MAX_TRANSIENT_SPAN_YEARS * 12

/**
 * Wat `depletionMonth` van een projectie nodig heeft. `KernelProjection` past hier
 * structureel op (Prognose-rijen voorbij de horizon dragen geen `nettoLiquide`;
 * `summary.lastInHorizonMonth` begrenst de lezing tot leeftijd ≤ 100).
 */
export interface RunwayProjectionView {
  readonly prognose: readonly {
    readonly beyondHorizon: boolean
    readonly nettoLiquide?: number
  }[]
  readonly summary: Pick<KernelRunSummary, 'lastInHorizonMonth'>
}

/** Prognose!J(m) als getal, of `null` voorbij de horizon / zonder rij. */
function nettoLiquideAt(proj: RunwayProjectionView, m: number): number | null {
  const row = proj.prognose[m]
  if (row === undefined || row.beyondHorizon || row.nettoLiquide === undefined) return null
  return row.nettoLiquide
}

/** `round(J(m)) ≤ 0` — de uitputtingsgate op hele euro's. */
function isDepleted(proj: RunwayProjectionView, m: number): boolean {
  const j = nettoLiquideAt(proj, m)
  if (j === null) return false
  return Math.round(j) <= 0
}

/**
 * De eerste AANHOUDENDE uitputtingsmaand van het liquide vermogen (Prognose!J),
 * of `null` wanneer J — op zelfherstellende bruggetjes na — positief blijft tot en
 * met `lastInHorizonMonth`. Zie de module-kop voor de rekenregel.
 *
 * Maand 0 = de eerste projectiemaand (nu). `depletionMonth === 0` betekent dat de
 * gebruiker vandaag al zonder liquide vermogen zit ('deficit' in de duiding), tenzij
 * die maand-0-dip zelf een bruggetje is.
 */
export function depletionMonth(proj: RunwayProjectionView): number | null {
  const last = Math.min(proj.summary.lastInHorizonMonth, proj.prognose.length - 1)
  let m = 0
  while (m <= last) {
    if (!isDepleted(proj, m)) {
      m += 1
      continue
    }
    // Episode [first, lastDepleted] van aaneengesloten uitgeputte maanden.
    const first = m
    let lastDepleted = m
    while (lastDepleted + 1 <= last && isDepleted(proj, lastDepleted + 1)) lastDepleted += 1
    // Herstelt ze bewezen (er volgt nog een in-horizon maand, en die is per
    // constructie niet uitgeput) én kort genoeg ⇒ bruggetje, verder zoeken.
    const clears = lastDepleted < last
    const transient = clears && lastDepleted - first <= MAX_TRANSIENT_SPAN_MONTHS
    if (!transient) return first
    m = lastDepleted + 1
  }
  return null
}
