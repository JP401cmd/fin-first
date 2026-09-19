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
 *   low  = mean − |mean| × z × spread
 *   high = mean + |mean| × z × spread
 *
 * GEEN klem op nul (B-053, 19 sep 2026). De band volgt het teken van de lijn:
 * een negatief netto vermogen (tekort-lening ná depletie — de kernel rekent
 * bewust door, "geen halt-op-nul") krijgt een band rond die negatieve waarde,
 * met `low ≤ mid ≤ high` behouden via |mean|. Tot dit besluit werd alléén de
 * onderkant op `Math.max(0, …)` geklemd, waardoor de band bij een negatieve
 * lijn omkeerde (low = 0 > mid > high) en "op nul bleef hangen" terwijl de
 * lijn eronder zakte. Onder de default P40–P60 blijft de factor over elke
 * planhorizon < 1 (0,2533 × 0,15 × √65 ≈ 0,31), dus een positieve lijn krijgt
 * ook zonder klem nooit een negatieve onderrand.
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
    const halfWidth = Math.abs(row.endPortfolio) * factor
    return {
      age: row.age,
      low: row.endPortfolio - halfWidth,
      mid: row.endPortfolio,
      high: row.endPortfolio + halfWidth,
    }
  })
}
