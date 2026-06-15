/**
 * Gecureerde WERELD-referentie voor de "reality check": waar sta je qua inkomen en
 * vermogen wereldwijd? Ter perspectief — wat in Nederland gemiddeld voelt, is mondiaal
 * uitzonderlijk.
 *
 * ⚠️ Indicatief en koopkrachtgecorrigeerd (PPP). Bedragen in euro's; drempels zijn
 * afgerond — bedoeld voor duiding ("bij de rijkste X%"), niet voor precisie.
 *
 * BRONNEN:
 *  - Vermogen — UBS Global Wealth Report 2024 (mondiale vermogenspiramide; mediaan ≈ $8.6k,
 *    >$100k ≈ top ~12%, >$1M ≈ top ~1,5%).
 *  - Inkomen — World Inequality Database / "global income percentiles" (PPP): top 10% ≈
 *    $15k p.p. / ~$60k per huishouden, top 1% ≈ $60k p.p.
 */

import type { BenchmarkSource } from '@/lib/benchmark-report-data'

export const SOURCE_GLOBAL_WEALTH: BenchmarkSource = {
  label: 'UBS — Global Wealth Report',
  year: 2024,
  note: 'Mondiale vermogensverdeling (PPP, indicatief).',
}

export const SOURCE_GLOBAL_INCOME: BenchmarkSource = {
  label: 'World Inequality Database — mondiale inkomensverdeling',
  year: 2024,
  note: 'Koopkrachtgecorrigeerde (PPP) inkomenspercentielen, indicatief.',
}

/** Drempel (EUR) → je zit bij de rijkste `topPercent`% wereldwijd. Aflopend gesorteerd. */
interface PercentileThreshold {
  minEur: number
  topPercent: number
}

// Netto vermogen → mondiaal percentiel (UBS-piramide, EUR ≈ USD voor duiding).
const WEALTH_THRESHOLDS: PercentileThreshold[] = [
  { minEur: 850_000, topPercent: 1 },
  { minEur: 450_000, topPercent: 2 },
  { minEur: 230_000, topPercent: 5 },
  { minEur: 90_000, topPercent: 12 },
  { minEur: 35_000, topPercent: 25 },
  { minEur: 9_000, topPercent: 50 },
  { minEur: 1_000, topPercent: 70 },
]

// Jaar(huishoud)inkomen → mondiaal percentiel (PPP, indicatief).
const INCOME_THRESHOLDS: PercentileThreshold[] = [
  { minEur: 55_000, topPercent: 1 },
  { minEur: 35_000, topPercent: 3 },
  { minEur: 22_000, topPercent: 5 },
  { minEur: 14_000, topPercent: 10 },
  { minEur: 9_000, topPercent: 15 },
  { minEur: 5_000, topPercent: 30 },
]

function lookupTopPercent(value: number, table: PercentileThreshold[]): number | null {
  if (!Number.isFinite(value) || value <= 0) return null
  for (const row of table) {
    if (value >= row.minEur) return row.topPercent
  }
  return null // onder de laagste drempel → geen "top X%"-uitspraak
}

/** Bij de rijkste X% qua vermogen wereldwijd (of null als onbekend/onder drempel). */
export function wealthTopPercent(netWorthEur: number): number | null {
  return lookupTopPercent(netWorthEur, WEALTH_THRESHOLDS)
}

/** Bij de rijkste X% qua inkomen wereldwijd (of null als onbekend/onder drempel). */
export function incomeTopPercent(yearlyIncomeEur: number): number | null {
  return lookupTopPercent(yearlyIncomeEur, INCOME_THRESHOLDS)
}
