/**
 * Box 3 tax calculations for individual holdings.
 *
 * Calculates the estimated annual Box 3 tax per holding based on
 * the current Dutch forfaitaire rendementsheffing. Holdings are
 * classified as 'belegging' (investment) which uses the forfait
 * beleggingen rate.
 *
 * The heffingsvrij vermogen (tax-free allowance) is distributed
 * proportionally across holdings based on their share of total
 * portfolio value.
 */

import { BOX3_PARAMS, type TaxYear } from './box3-data'

export type HoldingBox3Info = {
  /** Holding value used for calculation */
  holdingValue: number
  /** Share of total portfolio (0-1) */
  portfolioShare: number
  /** Allocated heffingsvrij vermogen for this holding */
  allocatedExemption: number
  /** Taxable value after exemption allocation */
  taxableValue: number
  /** Fictief rendement rate applied */
  forfaitRate: number
  /** Fictief rendement amount */
  forfaitRendement: number
  /** Box 3 tarief */
  tarief: number
  /** Estimated annual box 3 tax for this holding */
  annualTax: number
  /** Effective tax rate on holding value */
  effectiveRate: number
}

/**
 * Calculate Box 3 tax impact for a single holding.
 *
 * @param holdingValue - Current value of this holding
 * @param totalPortfolioValue - Total value of ALL box 3 assets (for proportional exemption)
 * @param hasPartner - Whether the user has a fiscal partner (doubles exemption)
 * @param year - Tax year (default: 2026)
 */
export function calculateHoldingBox3(
  holdingValue: number,
  totalPortfolioValue: number,
  hasPartner: boolean = false,
  year: TaxYear = 2026,
): HoldingBox3Info {
  const params = BOX3_PARAMS[year] || BOX3_PARAMS[2026]

  const heffingsvrij = hasPartner ? params.heffingsvrijPartner : params.heffingsvrijSingle
  const portfolioShare = totalPortfolioValue > 0 ? holdingValue / totalPortfolioValue : 0

  // Distribute heffingsvrij proportionally across holdings
  const allocatedExemption = Math.min(holdingValue, heffingsvrij * portfolioShare)
  const taxableValue = Math.max(0, holdingValue - allocatedExemption)

  // Holdings are classified as beleggingen (not spaargeld)
  const forfaitRate = params.forfaitBeleggingen
  const forfaitRendement = taxableValue * forfaitRate
  const tarief = params.tarief
  const annualTax = forfaitRendement * tarief
  const effectiveRate = holdingValue > 0 ? annualTax / holdingValue : 0

  return {
    holdingValue,
    portfolioShare,
    allocatedExemption,
    taxableValue,
    forfaitRate,
    forfaitRendement,
    tarief,
    annualTax,
    effectiveRate,
  }
}

/**
 * Calculate Box 3 tax for an array of holdings (for portfolio overview).
 * Returns per-holding breakdowns and totals.
 */
export function calculatePortfolioBox3(
  holdings: Array<{ id: string; value: number }>,
  hasPartner: boolean = false,
  year: TaxYear = 2026,
): {
  holdings: Array<{ id: string } & HoldingBox3Info>
  totalTax: number
  totalValue: number
  totalExemption: number
  effectiveRate: number
} {
  const totalValue = holdings.reduce((sum, h) => sum + h.value, 0)

  const results = holdings.map(h => ({
    id: h.id,
    ...calculateHoldingBox3(h.value, totalValue, hasPartner, year),
  }))

  const totalTax = results.reduce((sum, r) => sum + r.annualTax, 0)
  const totalExemption = results.reduce((sum, r) => sum + r.allocatedExemption, 0)
  const effectiveRate = totalValue > 0 ? totalTax / totalValue : 0

  return { holdings: results, totalTax, totalValue, totalExemption, effectiveRate }
}
