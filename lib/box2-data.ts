/**
 * Box 2 aanmerkelijk belang belasting — pure calculation engine.
 *
 * Box 2 belast inkomen uit aanmerkelijk belang (≥5% deelneming):
 * - Dividend uit deelnemingen
 * - Vervreemdingswinst (verkoop aandelen)
 *
 * Tarief 2025/2026: 24,5% in de eerste schijf, daarboven 31%
 * (het toptarief is per 2025 verlaagd van 33% naar 31%).
 * Eerste-schijfgrens: 2025 €67.804 (partner €135.608),
 * 2026 €68.843 (partner €137.686 — fiscaal partner verdubbelt de grens).
 *
 * Pure functions, no Supabase dependency. Follows the pattern of box3-data.ts.
 */

import type { TaxYear } from './box3-data'
export type { TaxYear } from './box3-data'

// ── Types ────────────────────────────────────────────────────

export interface Box2Params {
  tariefLaag: number    // 24,5%
  tariefHoog: number    // 31% (toptarief per 2025 verlaagd van 33%)
  grens: number         // eerste-schijfgrens (single)
  grensPartner: number  // eerste-schijfgrens met fiscaal partner (verdubbeld)
}

export interface Box2Deelneming {
  name: string
  annual_dividend: number
  disposal_gain: number  // vervreemdingswinst
}

export interface Box2Input {
  deelnemingen: Box2Deelneming[]
  year: TaxYear
  hasPartner: boolean
  dailyExpenses: number  // for freedom-days calculation
  dgaLeningenTotal?: number  // totaal DGA-leningen (vorderingen subtype dga_lening)
}

export interface Box2PerDeelneming {
  name: string
  dividend: number
  disposalGain: number
  totalIncome: number
  shareOfTotal: number  // percentage of total Box 2 income
}

export interface Box2Result {
  year: TaxYear
  hasPartner: boolean
  params: Box2Params

  // Per-deelneming breakdown
  perDeelneming: Box2PerDeelneming[]

  // Totals
  totalDividend: number
  totalDisposalGain: number
  totalIncome: number

  // Tax calculation
  taxLow: number       // belasting tegen laag tarief
  taxHigh: number      // belasting tegen hoog tarief
  totalTax: number
  effectiveRate: number // effectief tarief (0–1)

  // Wet excessief lenen DGA
  dgaLeningenTotal: number       // totaal uitstaande DGA-leningen
  dgaLeningenDrempel: number     // drempel (€500.000)
  dgaLeningenExcess: number      // bovenmatig deel
  dgaExcessTax: number           // extra belasting op bovenmatig deel
  totalTaxInclDga: number        // totalTax + dgaExcessTax

  // Freedom metric
  freedomDays: number
  dailyExpenses: number
}

// ── Constants ────────────────────────────────────────────────

export const BOX2_PARAMS: Record<TaxYear, Box2Params> = {
  2025: {
    tariefLaag: 0.245,
    tariefHoog: 0.31,
    grens: 67_804,
    grensPartner: 135_608,
  },
  2026: {
    tariefLaag: 0.245,
    tariefHoog: 0.31,
    grens: 68_843,
    grensPartner: 137_686,
  },
}

/** Wet excessief lenen bij eigen vennootschap — drempel */
export const DGA_LENING_DREMPEL = 500_000

export const BOX2_TOOLTIPS: Record<string, string> = {
  box2: 'Box 2 belast inkomen uit aanmerkelijk belang — dividend en verkoopwinst van deelnemingen (≥5%).',
  aanmerkelijkBelang: 'Je hebt een aanmerkelijk belang als je (direct of indirect) 5% of meer van de aandelen bezit.',
  tariefStaffel: 'In de eerste schijf betaal je 24,5% (2026 tot €68.843; 2025 tot €67.804). Daarboven geldt 31% — het toptarief is per 2025 verlaagd van 33% naar 31%. Met fiscaal partner verdubbelt de eerste-schijfgrens (2026 €137.686).',
  dividend: 'Winstuitkering die je ontvangt van een BV of deelneming waarin je aanmerkelijk belang hebt.',
  vervreemdingswinst: 'Winst bij verkoop van je aandelen: verkoopprijs minus verkrijgingsprijs.',
  fiscaalPartner: 'Met een fiscaal partner verdubbelt de eerste-schijfgrens voor het lage tarief (2026 naar €137.686, 2025 €135.608).',
  wetExcessiefLenen: 'De Wet excessief lenen bij eigen vennootschap belast leningen boven €500.000 van je BV als fictief regulier voordeel in Box 2. Het bovenmatige deel wordt belast tegen Box 2 tarieven.',
}

// ── Core Calculation ─────────────────────────────────────────

export function calculateBox2(input: Box2Input): Box2Result {
  const params = BOX2_PARAMS[input.year]

  // Per-deelneming breakdown
  let totalDividend = 0
  let totalDisposalGain = 0

  const perDeelneming: Box2PerDeelneming[] = input.deelnemingen.map(d => {
    const dividend = Math.max(0, d.annual_dividend)
    const disposalGain = d.disposal_gain // can be negative (loss)
    const totalIncome = dividend + disposalGain

    totalDividend += dividend
    totalDisposalGain += disposalGain

    return {
      name: d.name,
      dividend,
      disposalGain,
      totalIncome,
      shareOfTotal: 0, // calculated after totals
    }
  })

  const totalIncome = Math.max(0, totalDividend + totalDisposalGain)

  // Update share percentages
  for (const pd of perDeelneming) {
    pd.shareOfTotal = totalIncome > 0 ? pd.totalIncome / totalIncome : 0
  }

  // Apply bracket tax (staffeltarief)
  const grens = input.hasPartner ? params.grensPartner : params.grens

  let taxLow: number
  let taxHigh: number

  if (totalIncome <= grens) {
    taxLow = totalIncome * params.tariefLaag
    taxHigh = 0
  } else {
    taxLow = grens * params.tariefLaag
    taxHigh = (totalIncome - grens) * params.tariefHoog
  }

  const baseTax = Math.round((taxLow + taxHigh) * 100) / 100

  // Wet excessief lenen DGA — bovenmatig deel als fictief regulier voordeel
  const dgaLeningenTotal = input.dgaLeningenTotal ?? 0
  const dgaLeningenExcess = Math.max(0, dgaLeningenTotal - DGA_LENING_DREMPEL)

  // Het bovenmatige deel wordt belast tegen Box 2 tarieven (staffel)
  let dgaExcessTax = 0
  if (dgaLeningenExcess > 0) {
    // Fictief regulier voordeel adds to Box 2 income — apply bracket tax on excess
    const totalIncomeWithDga = totalIncome + dgaLeningenExcess
    const grensForDga = input.hasPartner ? params.grensPartner : params.grens

    let fullTaxLow: number
    let fullTaxHigh: number
    if (totalIncomeWithDga <= grensForDga) {
      fullTaxLow = totalIncomeWithDga * params.tariefLaag
      fullTaxHigh = 0
    } else {
      fullTaxLow = grensForDga * params.tariefLaag
      fullTaxHigh = (totalIncomeWithDga - grensForDga) * params.tariefHoog
    }
    const fullTax = Math.round((fullTaxLow + fullTaxHigh) * 100) / 100
    dgaExcessTax = Math.round((fullTax - baseTax) * 100) / 100
  }

  const totalTax = baseTax
  const totalTaxInclDga = Math.round((baseTax + dgaExcessTax) * 100) / 100
  const effectiveRate = totalIncome > 0 ? totalTax / totalIncome : 0

  // Freedom metric (including DGA excess tax)
  const freedomDays = input.dailyExpenses > 0
    ? Math.round(totalTaxInclDga / input.dailyExpenses)
    : 0

  return {
    year: input.year,
    hasPartner: input.hasPartner,
    params,
    perDeelneming,
    totalDividend,
    totalDisposalGain,
    totalIncome,
    taxLow: Math.round(taxLow * 100) / 100,
    taxHigh: Math.round(taxHigh * 100) / 100,
    totalTax,
    effectiveRate,
    dgaLeningenTotal,
    dgaLeningenDrempel: DGA_LENING_DREMPEL,
    dgaLeningenExcess,
    dgaExcessTax,
    totalTaxInclDga,
    freedomDays,
    dailyExpenses: input.dailyExpenses,
  }
}
