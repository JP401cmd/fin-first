/**
 * Gecureerde NL-referentiestatistiek voor de benchmark (cohort = leeftijd × huishoudtype).
 *
 * ⚠️ Dit zijn EXTERNE statistieken ter vergelijking — GEEN app-rekenconstanten. De
 * kerngetallen van de gebruiker komen onverkort uit de canonieke motoren
 * (`loadDashboardData`); deze module levert alléén de doelgroep-referentie.
 *
 * BRONNEN (met jaartal — actualiseer hier centraal):
 *  - Netto vermogen naar leeftijd hoofdkostwinner — CBS "Vermogen van huishoudens",
 *    Materiële welvaart in Nederland 2024 (mediaan + gemiddeld; cijfers over 2023).
 *  - Besteedbaar huishoudinkomen naar leeftijd — CBS, 2024 (mediaan per huishouden).
 *  - Spaarquote — INDICATIEF, o.b.v. CBS/DNB huishoudspaarquote (gemodelleerd, niet
 *    per cohort gepubliceerd in de app-definitie spaarquote = sparen/inkomen).
 *  - Huishoudtype-correctie — INDICATIEF/gemodelleerd: de CBS-leeftijdstabel is niet
 *    fijnmazig per huishoudtype beschikbaar, dus we passen een transparante factor toe.
 *    De methodologie-callout vermeldt dit expliciet.
 */

import type { AgeBandKey, HouseholdKey } from './cohort'
import type { BenchmarkSource } from '@/lib/benchmark-report-data'

export const SOURCE_CBS_VERMOGEN: BenchmarkSource = {
  label: 'CBS — Vermogen van huishoudens (Materiële welvaart 2024)',
  year: 2024,
  note: 'Mediaan en gemiddeld vermogen naar leeftijd van de hoofdkostwinner (cijfers over 2023).',
}

export const SOURCE_CBS_INKOMEN: BenchmarkSource = {
  label: 'CBS — Besteedbaar inkomen van huishoudens',
  year: 2024,
  note: 'Mediaan besteedbaar huishoudinkomen naar leeftijd.',
}

export const SOURCE_SPAARQUOTE: BenchmarkSource = {
  label: 'CBS/DNB — huishoudspaarquote (indicatief)',
  year: 2024,
  note: 'Gemodelleerde referentie-spaarquote per leeftijd; niet per cohort gepubliceerd.',
}

export const SOURCE_HOUSEHOLD_ADJUST: BenchmarkSource = {
  label: 'Huishoudtype-correctie (indicatief)',
  year: 2024,
  note: 'Transparante factor op de CBS-leeftijdscijfers omdat de tabel niet fijnmazig per huishoudtype beschikbaar is.',
}

/** Per leeftijdsband: CBS-mediaan/gemiddeld netto vermogen + mediaan besteedbaar inkomen. */
interface AgeReferenceRow {
  netWorthMedian: number
  netWorthMean: number
  /** Mediaan besteedbaar huishoudinkomen per jaar. */
  incomeMedian: number
  /** Indicatieve referentie-spaarquote (% van inkomen). */
  savingsRatePct: number
}

const AGE_REFERENCE: Record<AgeBandKey, AgeReferenceRow> = {
  // CBS Materiële welvaart 2024 — vermogen (mediaan/gemiddeld) & besteedbaar inkomen (mediaan).
  tot25: { netWorthMedian: 300, netWorthMean: 24_900, incomeMedian: 17_000, savingsRatePct: 6 },
  '25-35': { netWorthMedian: 13_500, netWorthMean: 95_900, incomeMedian: 36_900, savingsRatePct: 9 },
  '35-45': { netWorthMedian: 120_100, netWorthMean: 246_400, incomeMedian: 39_000, savingsRatePct: 11 },
  '45-55': { netWorthMedian: 187_400, netWorthMean: 395_000, incomeMedian: 42_300, savingsRatePct: 13 },
  '55-65': { netWorthMedian: 250_200, netWorthMean: 487_000, incomeMedian: 42_200, savingsRatePct: 15 },
  '65-75': { netWorthMedian: 276_900, netWorthMean: 450_800, incomeMedian: 34_800, savingsRatePct: 6 },
  // 75+ — CBS 75-85-band (dominante groep) gebruikt voor vermogen; inkomen 75+.
  '75plus': { netWorthMedian: 265_300, netWorthMean: 417_900, incomeMedian: 29_200, savingsRatePct: 3 },
}

/**
 * Indicatieve huishoudtype-correctie op de leeftijdsmedianen (gemodelleerd).
 * Alleenstaanden hebben lagere huishoudtotalen, paren/gezinnen hogere. Transparant
 * en bewust conservatief; de methodologie-callout maakt dit expliciet.
 */
const HOUSEHOLD_ADJUST: Record<HouseholdKey, { netWorth: number; income: number }> = {
  alleenstaand: { netWorth: 0.55, income: 0.62 },
  paar: { netWorth: 1.30, income: 1.28 },
  gezin_jong: { netWorth: 1.05, income: 1.22 },
  gezin_tiener: { netWorth: 1.20, income: 1.34 },
}

export interface CohortReference {
  netWorthMedian: number
  netWorthMean: number
  incomeMedian: number
  savingsRatePct: number
  /** Of er een (gemodelleerde) huishoudtype-correctie is toegepast. */
  householdAdjusted: boolean
}

/**
 * Referentiewaarden voor een cohort. Leeftijd is verplicht (CBS-as); huishoudtype
 * is optioneel — zonder huishoudtype tonen we de pure leeftijdscijfers.
 */
export function getCohortReference(
  ageBand: AgeBandKey,
  household: HouseholdKey | null,
): CohortReference {
  const base = AGE_REFERENCE[ageBand]
  const adj = household ? HOUSEHOLD_ADJUST[household] : null

  return {
    netWorthMedian: Math.round(base.netWorthMedian * (adj?.netWorth ?? 1)),
    netWorthMean: Math.round(base.netWorthMean * (adj?.netWorth ?? 1)),
    incomeMedian: Math.round(base.incomeMedian * (adj?.income ?? 1)),
    savingsRatePct: base.savingsRatePct,
    householdAdjusted: adj != null,
  }
}
