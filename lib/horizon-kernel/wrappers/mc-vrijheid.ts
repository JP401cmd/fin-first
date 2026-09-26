/**
 * Horizon-kernel · **drie vrijheidsleeftijden uit de marktcheck** (spec toekomst-drie-
 * katernen §7.6): "als het tegenzit 55 · in het midden 52 · als het meezit 49".
 *
 * ## Wat het getal is
 * Per percentiel de vrijheidsleeftijd van één verstoord marktverloop, opgelost met
 * `solveFire` — dezelfde bisectie en hetzelfde haalbaarheidscriterium
 * (`isToereikend`) als het live kerngetal. De bridge maakt van `solveFire` het live
 * getal met `fireReachable = status !== 'unreachable_within_horizon'`; hier geldt
 * dezelfde regel: onbereikbaar binnen de horizon ⇒ `null`, nooit "oneindig" en nooit
 * de horizon-parkeerstand.
 *
 * ## De methode: de percentiel-run oplossen, niet elke run (gemeten keuze)
 * Twee kandidaten:
 *  (a) elke verstoorde run oplossen en p25/p50/p75 van de leeftijden nemen —
 *      exact, maar n × ~12 engine-runs (bisectie op maandbasis): bij n = 200 ≈ 13×
 *      de huidige marktcheck;
 *  (b) de runs rangschikken op hun gap P!B38 op de live FIRE-leeftijd (het
 *      criterium waarop de solver bisecteert; `MonteCarloResult.rangGap`, al
 *      doorgerekend) en alleen de drie runs op de percentielrang oplossen — 3 × ~12
 *      engine-runs extra op ~225.
 * Gekozen: (b). Gemeten op 26 sep 2026 (esbuild-bundle van de kern in een Node-
 * `worker_thread`, n = 200, zes app-persona's: deplete, deplete + pensioen/spaar,
 * perpetual, legacy, krap, σ 0,25):
 *  - engine-runs per marktcheck: band 211 + marge 14 = 225; (b) +34 (≈ +15%);
 *    (a) +2.316 (≈ +1.030%). De bisectie-probes slaan de Ont-herberekening over,
 *    dus +15% is een bovengrens.
 *  - wandtijd (mediaan van 5, afwisselend): 1,8–4,0 s → 2,2–6,2 s voor (b), met
 *    ±25% meetruis door de gedeelde machine; (a) kostte 19–52 s extra.
 *  - uitkomst: (b) = (a) op alle zes persona's, tot op de maand. De gap-rang
 *    volgde de leeftijdsvolgorde zonder één inversie (0 op 199 per persona).
 * `mc-vrijheid.test.ts` pint die gelijkheid op een kleinere n. De rang volgt
 * dezelfde nearest-rank-ordestatistiek als de band (`percentielIndex`), zodat
 * "als het tegenzit" dezelfde rang is als de onderrand p25 van de getekende band.
 *
 * ## Grondslag van de richting
 * Lage gap = weinig vermogen op de eindleeftijd t.o.v. het doel = het marktverloop
 * zat tegen ⇒ LATERE vrijheidsleeftijd. Tegenzit = rang p25 (van onder), meezit =
 * rang p75. Omdat de rang een benadering van de leeftijdsvolgorde is (een pot die
 * pas laat meebeweegt kan de volgorde per run doorbreken), worden de drie leeftijden
 * na het oplossen monotoon gezet: een kwantielfunctie is niet-dalend, dus de uitvoer
 * garandeert tegenzit ≥ midden ≥ meezit (onbereikbaar telt als "later dan elke
 * leeftijd"). Dat is een herordening van drie gemeten leeftijden, geen nieuwe som.
 *
 * ## Vast stopmoment ⇒ `null`
 * Onder een stop-anker (ADR 0129 D3) of de oracle-pensioen-kortsluiting is de
 * FIRE-leeftijd van elke run per definitie de ankerleeftijd; "als het tegenzit 60 ·
 * in het midden 60 · als het meezit 60" zegt niets. De marktgevoeligheid van een
 * vast plan draagt de rendement-marge al (`rendement-marge.ts`, gemeten op het
 * anker). Een dekking per percentiel zou een NIEUWE metriek met eigen kopij zijn;
 * die bouwen we niet stil mee.
 *
 * Pure module: geen fs/Supabase/Date.now/Math.random. De runs zijn deterministisch
 * (sin-hash-ruis op run-index), dus de uitkomst is reproduceerbaar.
 */

import { solveFire } from '../solver'
import { MAX_AGE, type KernelInput } from '../types'
import { perturbInputForRun, percentielIndex, type MonteCarloResult } from './mc'

/**
 * Drie vrijheidsleeftijden (fractioneel, zoals `solveFire.fireAge`); per stand `null`
 * wanneer dat marktverloop de vrijheid binnen de horizon niet haalt.
 */
export interface MarktcheckVrijheidsleeftijden {
  /** Rang p25 van de uitkomst (lage gap) — de LAATSTE van de drie. */
  readonly tegenzit: number | null
  /** Rang p50. */
  readonly midden: number | null
  /** Rang p75 (hoge gap) — de VROEGSTE van de drie. */
  readonly meezit: number | null
}

/** De percentielrangen, gelijk aan de onder- en bovenrand van de getekende band (p25–p75). */
export const VRIJHEID_PERCENTIELEN = { tegenzit: 0.25, midden: 0.5, meezit: 0.75 } as const

/**
 * Los de percentiel-runs van een al gedraaide Monte-Carlo op.
 *
 * @param mcInput PRECIES de invoer die aan `runMonteCarlo` ging (incl. de
 *   marktcheck-σ en het begrensde aantal runs) — anders is run `i` hier een ándere
 *   run dan in de band.
 * @param mc het resultaat van `runMonteCarlo(mcInput)`.
 * @returns `null` bij een vast stopmoment of zonder runs.
 */
export function computeMarktcheckVrijheidsleeftijden(
  mcInput: KernelInput,
  mc: Pick<MonteCarloResult, 'rangGap' | 'vastStopLeeftijd'>,
): MarktcheckVrijheidsleeftijden | null {
  if (mc.vastStopLeeftijd !== null) return null
  const n = mc.rangGap.length
  if (n === 0) return null

  // Oplopend op gap, tie-break op run-index ⇒ deterministisch, ook bij gelijke gaps.
  const rang = mc.rangGap
    .map((gap, idx) => ({ gap, run: idx + 1 }))
    .sort((a, b) => a.gap - b.gap || a.run - b.run)
  const runOp = (q: number): number => rang[percentielIndex(n, q)].run

  const sigma = mcInput.onzekerheid.mc.sigma
  const cache = new Map<number, number | null>()
  const leeftijdVan = (run: number): number | null => {
    const bekend = cache.get(run)
    if (bekend !== undefined) return bekend
    const solved = solveFire(perturbInputForRun(mcInput, run, sigma))
    // Zelfde regels als het live kerngetal: de bridge (`fireReachable = status !==
    // 'unreachable_within_horizon'`) én de weergave-vangrail `guardFreedomAge`
    // (leeftijd ≥ HORIZON_PLAFOND_LEEFTIJD = kernel-MAX_AGE is geen vrijheidsleeftijd).
    // Die tweede regel is hier nodig, niet cosmetisch: bij perpetual is de horizon-
    // parkeerstand (FIRE = 100 = eindleeftijd) triviaal "toereikend" — doel en model
    // zijn dan dezelfde J@100, gap 0 — dus de status zegt `reached_at` terwijl het
    // marktverloop de vrijheid binnen de horizon níet haalt.
    const leeftijd =
      solved.status === 'unreachable_within_horizon' || solved.fireAge >= MAX_AGE
        ? null
        : solved.fireAge
    cache.set(run, leeftijd)
    return leeftijd
  }

  const ruw = [
    leeftijdVan(runOp(VRIJHEID_PERCENTIELEN.tegenzit)),
    leeftijdVan(runOp(VRIJHEID_PERCENTIELEN.midden)),
    leeftijdVan(runOp(VRIJHEID_PERCENTIELEN.meezit)),
  ]
  // Monotoon zetten: aflopend, onbereikbaar (null) = later dan elke leeftijd.
  const sleutel = (a: number | null): number => (a === null ? Number.POSITIVE_INFINITY : a)
  // Vergelijk zonder aftrekken: ∞ − ∞ = NaN zou de sortering ongedefinieerd maken.
  const [tegenzit, midden, meezit] = [...ruw].sort((a, b) => {
    const sa = sleutel(a)
    const sb = sleutel(b)
    return sa === sb ? 0 : sa < sb ? 1 : -1
  })
  return { tegenzit, midden, meezit }
}
