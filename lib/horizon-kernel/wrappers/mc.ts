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
 * Pure module: geen fs/Supabase/Date.now/Math.random.
 */

import { runKernelProjection } from '../engine'
import { solveFire } from '../solver'
import { computeEs, type EsRow } from '../tables/es'
import type { KernelInput } from '../types'
import { computeGap } from '../gap'
import { potIdiosyncraticNoise, sharedMarketShock } from './noise'

/** Uitkomst van een Monte-Carlo-run over `n` deterministische runs. */
export interface MonteCarloResult {
  /** Per run het 1/0-slaagcriterium (MC!B14 … MC!B(13+n)). */
  readonly outcomes: readonly number[]
  /** MC!B4 — slaagkans = gemiddelde van de outcomes (`NaN` als n = 0). */
  readonly successProbability: number
  /** Aantal runs (n = MC!B1). */
  readonly runs: number
  /** Aantal engine-runs (solver + n perturbaties) — voor rapportage. */
  readonly engineRuns: number
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
    const proj = runKernelProjection(perturbed, { fireAge: liveFireAge })
    outcomes.push(successCriterion(input, es, proj, liveFireAge))
  }

  const successProbability =
    outcomes.length === 0 ? Number.NaN : outcomes.reduce((sum, v) => sum + v, 0) / outcomes.length

  return { outcomes, successProbability, runs: n, engineRuns }
}
