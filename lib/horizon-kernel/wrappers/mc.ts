/**
 * Horizon-kernel · wrapper **Monte-Carlo** — port van de VBA-macro
 * `RunMonteCarlo` (Module1, `docs/horizon-oracle/vba.txt`) + de MC-tab-formules.
 *
 * `RunMonteCarlo` zet MC!B5=1 (MC-modus aan), wist MC!B14:B1013 en draait
 * `n = MC!B1` runs: per run `i` zet het MC!B11=i, herberekent het hele model en
 * schrijft MC!B(13+i) = MC!B8 (het 1/0-slaagcriterium van die run). Daarna
 * MC!B5=0, MC!B11=1. De slaagkans is MC!B4 = `AVERAGE(B14:B1013)`.
 *
 * ### Wat MC!B8 precies is (geverifieerd via openpyxl)
 * `MC!B8` = de model≥doel-toets per eindstrategie, geëvalueerd op de **live**
 * FIRE-leeftijd (P!B16 — NIET opnieuw gezocht per run) met de MC-verstoorde
 * rendementen:
 *  - **deplete**: Prognose!J@eindleeftijd ≥ 0                → identiek aan `gap ≥ 0`
 *  - **legacy**: (B54="Ja"?I:J)@eind ≥ B53·(1+B14)^(B35−B7) → identiek aan `gap ≥ 0`
 *  - **perpetual**: J@eind ≥ J@FIRE·(1+B14)^(B35−B16)        → identiek aan `gap ≥ 0`
 *  - **pensioen**: ROUND(P!B16,2) ≥ ES!C15 (AOW)             → losstaand criterium
 *
 * Voor alle niet-pensioen-strategieën is B8 dus exact `computeGap(...) ≥ 0` (met
 * dezelfde I/J-meetlatkeuze als de solver). Voor pensioen is B8 alleen `B16 ≥ AOW`;
 * omdat de live B16 bij pensioen kortsluit naar de AOW-leeftijd, is B8 daar altijd 1.
 *
 * ### De verstoring via een input-transform (tabellen onaangeraakt)
 * De MC-ruis raakt alleen het Bez-rendement van **investeringspotten** (bens!F=1):
 * `eff = basis + P!B43 + MC!B10 + MC!<col>12`. `tables/bez.ts` rekent al met
 * `eff = investering ? rendement + shift : rendement`. De wrapper bakt daarom per
 * run de gedeelde schok (MC!B10) én de per-pot-ruis (MC!<col>12) in `rendement`
 * van elke investeringspot; `onzekerheid.shift` (=P!B43) blijft staan. De tabellen
 * blijven ongewijzigd — de verstoring loopt puur over het invoer-pad. (Een scalar
 * `shift` kan de per-pot-ruis niet dragen; daarom het per-pot rendement-overschrijf
 * op de invoer, conform de opdracht.)
 *
 * De live FIRE-leeftijd komt uit `solveFire` (de VBA draait vóór RunMonteCarlo
 * BepaalFIRE, die P!B16 op de echte solver-uitkomst zet — mét pensioen-kortsluiting).
 *
 * ### De percentielband (additief, buiten het oracle)
 * Elke run is een VOLLEDIGE `runKernelProjection` op de live FIRE-leeftijd — dus
 * inclusief overgang, onttrekking, AOW, pensioen en woonstrategie. Naast het
 * 1/0-criterium bewaart de wrapper daarom per run de netto-vermogensreeks
 * (Prognose!I) op de jaar-blokranden uit `jaarrand.ts`, en levert daaruit
 * p10/p25/p50/p75/p90 per leeftijd. Die band is de marktcheck op het HELE plan en
 * ligt per constructie op dezelfde leeftijdsas en dezelfde grondslag als de
 * hoofdlijn van de Toekomst-grafiek.
 *
 * `band` en `sustainProbability` zijn AFGELEIDE, EXTRA velden: `outcomes` en
 * `successProbability` blijven cel-exact het Excel-oracle (`test/horizon-oracle/
 * parity-mc.test.ts` toetst uitsluitend die twee). Bak hier dus nooit een
 * afwijking van MC!B8 in — voeg een afgeleid veld toe.
 *
 * Pure module: geen fs/Supabase/Date.now/Math.random.
 */

import { runKernelProjection } from '../engine'
import { solveFire } from '../solver'
import { computeEs, type EsRow } from '../tables/es'
import type { KernelInput } from '../types'
import { computeGap } from '../gap'
import { nettoVermogenPerLeeftijd } from '../jaarrand'
import { potIdiosyncraticNoise, sharedMarketShock } from './noise'

/**
 * Percentielband over de MC-runs, op de grondslag **netto vermogen** (Prognose!I,
 * nominaal) — dezelfde grootheid als `SimRow.endPortfolio`, dus dezelfde als de
 * hoofdlijn van de Toekomst-grafiek. NOOIT mengen met de liquide/besteedbare
 * grondslag (Prognose!J).
 *
 * Elke reeks is geïndexeerd op leeftijds-offset vanaf `startAge`: index `i` hoort
 * bij leeftijd `startAge + i` (index 0 = de beginstand van vandaag, identiek in
 * alle runs — de band begint dus als één punt en waaiert daarna uit).
 */
export interface MonteCarloBand {
  /** Leeftijd bij index 0 = `round(input.startLeeftijd)` — de as van de hoofdlijn. */
  readonly startAge: number
  readonly p10: readonly number[]
  readonly p25: readonly number[]
  readonly p50: readonly number[]
  readonly p75: readonly number[]
  readonly p90: readonly number[]
}

/** Uitkomst van een Monte-Carlo-run over `n` deterministische runs. */
export interface MonteCarloResult {
  /** Per run het 1/0-slaagcriterium (MC!B14 … MC!B(13+n)). */
  readonly outcomes: readonly number[]
  /** MC!B4 — slaagkans = gemiddelde van de outcomes (`NaN` als n = 0). */
  readonly successProbability: number
  /**
   * Kans dat het plan het volhoudt = het deel van de runs met `gap ≥ 0` (P!B38:
   * modelwaarde op de eindleeftijd ≥ het doelbedrag van de eindstrategie).
   *
   * Voor deplete/legacy/perpetual is dit per constructie IDENTIEK aan
   * `successProbability` — daar ís MC!B8 die toets. Het verschilt alleen bij de
   * **pensioen**-eindstrategie: MC!B8 toetst daar `B16 ≥ AOW`, wat door de
   * pensioen-kortsluiting in de solver altijd 1 is (oracle-getrouw, maar als
   * getal betekenisloos). Dit veld past dáár de inhoudelijke toets toe
   * (Prognose!J op de eindleeftijd ≥ 0), zodat een oppervlak dat "kans dat je
   * geld het volhoudt" belooft dat ook waarmaakt.
   *
   * BEWUST een AFGELEID, EXTRA veld: `outcomes` en `successProbability` blijven
   * byte-identiek aan het Excel-oracle (parity-suite raakt dit veld niet).
   * `NaN` als n = 0.
   */
  readonly sustainProbability: number
  /**
   * P!B16 — de live FIRE-leeftijd waarop élke run is geëvalueerd (uit `solveFire`,
   * mét pensioen-kortsluiting). Doorgegeven zodat consumenten kunnen zien of er
   * binnen de horizon überhaupt een onttrekkingsfase ís: ligt deze op of voorbij
   * de eindleeftijd, dan toetst de gap niets en is een slaagkans betekenisloos.
   */
  readonly liveFireAge: number
  /** Aantal runs (n = MC!B1). */
  readonly runs: number
  /** Aantal engine-runs (solver + n perturbaties) — voor rapportage. */
  readonly engineRuns: number
  /** Per-leeftijd percentielband over de runs (grondslag: netto vermogen). */
  readonly band: MonteCarloBand
}

/**
 * Percentiel via nearest-rank op de oplopend gesorteerde reeks:
 * `waarden[clamp(floor(n·q), 0, n−1)]`. Bewust dezelfde ordestatistiek als de
 * band die de grafiek altijd al tekende (geen interpolatie), zodat de visuele
 * betekenis van p10…p90 niet verandert — alleen de motor eronder.
 */
function percentiel(gesorteerd: readonly number[], q: number): number {
  if (gesorteerd.length === 0) return 0
  const idx = Math.min(Math.max(Math.floor(gesorteerd.length * q), 0), gesorteerd.length - 1)
  return gesorteerd[idx]
}

/** Bouw de percentielband uit de per-run netto-vermogensreeksen. */
function buildBand(startAge: number, paden: readonly number[][]): MonteCarloBand {
  const lengte = paden.reduce((max, p) => Math.max(max, p.length), 0)
  const p10: number[] = []
  const p25: number[] = []
  const p50: number[] = []
  const p75: number[] = []
  const p90: number[] = []
  for (let i = 0; i < lengte; i++) {
    const kolom = paden.map((p) => p[i] ?? 0).sort((a, b) => a - b)
    p10.push(percentiel(kolom, 0.1))
    p25.push(percentiel(kolom, 0.25))
    p50.push(percentiel(kolom, 0.5))
    p75.push(percentiel(kolom, 0.75))
    p90.push(percentiel(kolom, 0.9))
  }
  return { startAge, p10, p25, p50, p75, p90 }
}

/**
 * MC!B8 — 1/0-slaagcriterium van een doorgerekende (verstoorde) stand op de live
 * FIRE-leeftijd. Niet-pensioen: `gap ≥ 0`; pensioen: `ROUND(B16,2) ≥ AOW`.
 */
function successCriterion(
  input: KernelInput,
  es: EsRow,
  proj: ReturnType<typeof runKernelProjection>,
  liveFireAge: number,
): number {
  if (es.interneCode === 'pensioen') {
    // ROUND(P!B16, 2) ≥ ES!C15 (AOW). Live B16 sluit kort naar AOW → altijd 1.
    return Math.round(liveFireAge * 100) / 100 >= es.pensioenleeftijd ? 1 : 0
  }
  return computeGap(input, es, proj, liveFireAge) >= 0 ? 1 : 0
}

/**
 * Draai de Monte-Carlo-simulatie: `n` deterministische runs met de sin-hash-ruis
 * op de investeringspotten, geëvalueerd op de live FIRE-leeftijd. Reproduceert
 * `RunMonteCarlo` (de bevroren MC!B14…-reeks) + de slaagkans MC!B4.
 */
export function runMonteCarlo(input: KernelInput): MonteCarloResult {
  const es = computeEs(input)
  const sigma = input.onzekerheid.mc.sigma // MC!B3
  const n = input.onzekerheid.mc.aantalRuns // MC!B1

  // Live FIRE-leeftijd (P!B16 na BepaalFIRE — mét pensioen-kortsluiting).
  const solved = solveFire(input)
  const liveFireAge = solved.fireAge
  let engineRuns = solved.engineRuns

  const outcomes: number[] = []
  const sustainOutcomes: number[] = []
  const paden: number[][] = []
  for (let i = 1; i <= n; i++) {
    const shock = sharedMarketShock(i, sigma) // MC!B10 (gedeeld over investeringspotten)
    // Bak MC!B10 + MC!<col>12 in het rendement van elke investeringspot; niet-
    // investeringspotten blijven ongemoeid. `onzekerheid.shift` (P!B43) blijft staan.
    const perturbed: KernelInput = {
      ...input,
      assetPotten: input.assetPotten.map((p) =>
        p.investering
          ? { ...p, rendement: p.rendement + shock + potIdiosyncraticNoise(i, p.slot, sigma) }
          : p,
      ),
    }
    engineRuns += 1
    // Eén VOLLEDIGE projectie op de LIVE FIRE-leeftijd: de run stopt op het
    // geplande moment en rekent daarna de onttrekking door (inclusief AOW,
    // pensioen, woonstrategie en grootboek). Daardoor volgt de band de hele
    // plan-curve — opbouw, overgang én afbouw — i.p.v. de opbouw door te zetten.
    const proj = runKernelProjection(perturbed, { fireAge: liveFireAge })
    outcomes.push(successCriterion(input, es, proj, liveFireAge))
    sustainOutcomes.push(computeGap(input, es, proj, liveFireAge) >= 0 ? 1 : 0)
    paden.push(nettoVermogenPerLeeftijd(perturbed, proj))
  }

  const gemiddelde = (xs: readonly number[]): number =>
    xs.length === 0 ? Number.NaN : xs.reduce((sum, v) => sum + v, 0) / xs.length

  return {
    outcomes,
    successProbability: gemiddelde(outcomes),
    sustainProbability: gemiddelde(sustainOutcomes),
    liveFireAge,
    runs: n,
    engineRuns,
    band: buildBand(Math.round(input.startLeeftijd), paden),
  }
}
