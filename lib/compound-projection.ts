/**
 * Compound interest projection — pure functies voor "moment of
 * realization"-visualisaties.
 *
 * Plan-context: T-4 (Tier-3 #24) "Dramatic visualization voor enkele
 * kerntips: bv. 'Deze 0.5% extra beheerkosten kosten je €X over Y jaar'".
 * Inspiratie uit plan §2.6 Empower's fee-analyzer.
 *
 * Twee scenarios berekenen — een rustige (spaarrente 0.5%) en een
 * groeiende (belegd 7%). Het verschil is de "dramatische" reveal.
 */

/**
 * Bereken de eindwaarde van een eenmalig bedrag + maandelijkse
 * inleg over N jaar bij gegeven jaarrendement.
 *
 * Formules (annualized compounding, einde-van-jaar inleg):
 *   FV_lump      = principal × (1 + r)^years
 *   FV_monthly   = monthly × 12 × ((1 + r)^years − 1) / r
 *   FV_total     = FV_lump + FV_monthly
 *
 * Voor r=0 vermijden we deling door nul met een lineaire formule.
 */
export function projectCompound(
  principal: number,
  monthlyContribution: number,
  years: number,
  annualRate: number,
): number {
  if (years <= 0) return principal
  if (annualRate === 0) {
    return principal + monthlyContribution * 12 * years
  }
  const growthFactor = Math.pow(1 + annualRate, years)
  const fvLump = principal * growthFactor
  const fvMonthly =
    (monthlyContribution * 12 * (growthFactor - 1)) / annualRate
  return Math.round(fvLump + fvMonthly)
}

/**
 * Verschil tussen twee scenarios (bv. spaargeld vs beleggen).
 * Returnt nominaal verschil + relatieve groei van het beste pad.
 */
export interface CompoundComparison {
  conservative: number
  ambitious: number
  difference: number
  multiplier: number
  /** Cap: ambitious geeft "geen verschil" wanneer < 5% boven conservative. */
  hasDramaticDelta: boolean
}

export function compareCompound(input: {
  principal: number
  monthlyContribution: number
  years: number
  conservativeRate: number
  ambitiousRate: number
}): CompoundComparison {
  const cons = projectCompound(
    input.principal,
    input.monthlyContribution,
    input.years,
    input.conservativeRate,
  )
  const amb = projectCompound(
    input.principal,
    input.monthlyContribution,
    input.years,
    input.ambitiousRate,
  )
  const difference = amb - cons
  const multiplier = cons > 0 ? amb / cons : 0
  return {
    conservative: cons,
    ambitious: amb,
    difference,
    multiplier,
    hasDramaticDelta: cons > 0 && multiplier >= 1.05,
  }
}
