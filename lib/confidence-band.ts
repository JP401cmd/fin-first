/**
 * Confidence-band approximator voor netto-vermogen-projectie.
 *
 * Plan F-4 (Tier-3 #22): "Confidence-band om projectie-lijn (Monte
 * Carlo onder de motorkap, P10-P50-P90 als zachte gradient-band)."
 *
 * MVP-implementatie: GEEN echte Monte Carlo — gebruikt een log-normale
 * approximatie met σ × √t (cumulatieve volatiliteit groeit met tijd).
 * Voor MVP-overzicht voldoet dit; voor exacte risico-analyse zit de
 * echte Monte Carlo elders in horizon-engine.
 *
 * Formule (z-score voor P10/P90 = ±1.28):
 *   spread(year_idx) = sigma × √year_idx
 *   p10 = mean × (1 − 1.28 × spread)
 *   p90 = mean × (1 + 1.28 × spread)
 *
 * Default sigma = 0.15 (typisch voor wereldwijde gespreide aandelen-
 * portefeuille). Voor cash-zware portefeuilles is dit te hoog — maar
 * MVP-chart toont liever een conservatieve bandbreedte dan een te
 * smalle.
 */

export const DEFAULT_VOLATILITY = 0.15
const Z_SCORE_P10_P90 = 1.28

export interface ConfidenceBandPoint {
  age: number
  p10: number
  p50: number
  p90: number
}

export function computeConfidenceBand(
  simRows: { age: number; endPortfolio: number }[],
  sigma: number = DEFAULT_VOLATILITY,
): ConfidenceBandPoint[] {
  if (simRows.length === 0) return []
  return simRows.map((row, idx) => {
    const yearsFromNow = idx
    const spread = sigma * Math.sqrt(yearsFromNow)
    const factor = Z_SCORE_P10_P90 * spread
    return {
      age: row.age,
      p10: Math.max(0, row.endPortfolio * (1 - factor)),
      p50: row.endPortfolio,
      p90: row.endPortfolio * (1 + factor),
    }
  })
}
