/**
 * Confidence-band approximator voor netto-vermogen-projectie.
 *
 * Plan F-4 (Tier-3 #22): "Confidence-band om projectie-lijn (Monte
 * Carlo onder de motorkap, percentielen als zachte gradient-band)."
 *
 * MVP-implementatie: GEEN echte Monte Carlo — gebruikt een log-normale
 * approximatie met σ × √t (cumulatieve volatiliteit groeit met tijd).
 * Voor MVP-overzicht voldoet dit; voor exacte risico-analyse zit de
 * echte Monte Carlo elders in horizon-engine.
 *
 * Formule (z-score bepaalt de percentielen):
 *   spread(year_idx) = sigma × √year_idx
 *   low  = mean × (1 − z × spread)
 *   high = mean × (1 + z × spread)
 *
 * Default percentielen: **P40–P60** (z ≈ 0.2533) — een smalle band die
 * de kern van de verwachting toont zonder de grafiek te domineren. De
 * /overzicht-grafiek gebruikt deze default; bredere banden (P10–P90,
 * z = 1.28) blijven beschikbaar via de `zScore`-parameter.
 *
 * Default sigma = 0.15 (typisch voor wereldwijde gespreide aandelen-
 * portefeuille). Voor cash-zware portefeuilles is dit te hoog — maar
 * MVP-chart toont liever een conservatieve bandbreedte dan een te
 * smalle.
 */

export const DEFAULT_VOLATILITY = 0.15
/** z-score voor het 60e/40e percentiel — smalle kern-band. */
export const Z_SCORE_P40_P60 = 0.2533
/** z-score voor het 90e/10e percentiel — brede band (legacy default). */
export const Z_SCORE_P10_P90 = 1.28

export interface ConfidenceBandPoint {
  age: number
  low: number
  mid: number
  high: number
}

export function computeConfidenceBand(
  simRows: { age: number; endPortfolio: number }[],
  sigma: number = DEFAULT_VOLATILITY,
  zScore: number = Z_SCORE_P40_P60,
): ConfidenceBandPoint[] {
  if (simRows.length === 0) return []
  return simRows.map((row, idx) => {
    const yearsFromNow = idx
    const spread = sigma * Math.sqrt(yearsFromNow)
    const factor = zScore * spread
    return {
      age: row.age,
      low: Math.max(0, row.endPortfolio * (1 - factor)),
      mid: row.endPortfolio,
      high: row.endPortfolio * (1 + factor),
    }
  })
}
