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
 *  - Besteedbaar inkomen naar leeftijd — CBS Materiële welvaart in Nederland 2024,
 *    tabel 2.4.1: GESTANDAARDISEERD (equivalentie-gecorrigeerd) besteedbaar inkomen,
 *    GEMIDDELD, naar leeftijd van de hoofdkostwinner. NB: gestandaardiseerd = herrekend
 *    naar een alleenstaande (equivalentiefactor 1,0); het ruwe huishoudinkomen leiden we
 *    af via de CBS-equivalentiefactoren (zie HOUSEHOLD_ADJUST.*.income).
 *  - Spaarquote — INDICATIEF, o.b.v. CBS/DNB huishoudspaarquote (gemodelleerd, niet
 *    per cohort gepubliceerd in de app-definitie spaarquote = sparen/inkomen).
 *  - Huishoudtype-correctie inkomen — CBS-equivalentiefactoren (Budgetonderzoek 2015,
 *    toegepast vanaf verslagjaar 2018): ruw huishoudinkomen = gestandaardiseerd × factor.
 *  - Huishoudtype-correctie vermogen — GEMODELLEERD: CBS publiceert geen vermogen per
 *    leeftijd × huishoudtype-kruistabel, dus passen we een transparante, CBS-gegronde
 *    factor toe (afgeleid van de vermogensverschillen tussen huishoudtypen). De
 *    methodologie-callout en de UI ("Geraamde referentie (CBS-basis)") maken dit expliciet.
 */

import type { AgeBandKey, HouseholdKey } from './cohort'
import type { BenchmarkSource } from '@/lib/benchmark-report-data'

export const SOURCE_CBS_VERMOGEN: BenchmarkSource = {
  label: 'CBS — Vermogen van huishoudens (Materiële welvaart 2024)',
  year: 2024,
  note: 'Mediaan en gemiddeld vermogen naar leeftijd van de hoofdkostwinner (cijfers over 2023).',
}

export const SOURCE_CBS_INKOMEN: BenchmarkSource = {
  label: 'CBS — Besteedbaar inkomen (Materiële welvaart 2024)',
  year: 2024,
  note: 'Gestandaardiseerd (equivalentie-gecorrigeerd) gemiddeld besteedbaar inkomen naar leeftijd; '
    + 'het huishoudtype-inkomen is afgeleid via de CBS-equivalentiefactoren (geraamde referentie).',
}

export const SOURCE_SPAARQUOTE: BenchmarkSource = {
  label: 'CBS/DNB — huishoudspaarquote (indicatief)',
  year: 2024,
  note: 'Gemodelleerde referentie-spaarquote per leeftijd; niet per cohort gepubliceerd.',
}

export const SOURCE_HOUSEHOLD_ADJUST: BenchmarkSource = {
  label: 'Huishoudtype-correctie (geraamd, CBS-basis)',
  year: 2024,
  note: 'Inkomen via CBS-equivalentiefactoren (ruw = gestandaardiseerd × factor); vermogen via een '
    + 'gemodelleerde, CBS-gegronde factor — er bestaat geen gepubliceerde leeftijd × huishoudtype-kruistabel.',
}

/** Per leeftijdsband: CBS-mediaan/gemiddeld netto vermogen + gestandaardiseerd inkomen. */
interface AgeReferenceRow {
  netWorthMedian: number
  netWorthMean: number
  /**
   * GESTANDAARDISEERD (equivalentie-gecorrigeerd) GEMIDDELD besteedbaar inkomen per jaar
   * — d.w.z. herrekend naar een alleenstaande (equivalentiefactor 1,0). Het ruwe
   * huishoudinkomen volgt door dit te vermenigvuldigen met de equivalentiefactor in
   * HOUSEHOLD_ADJUST.*.income. Het veld heet historisch `incomeMedian`, maar de waarde
   * is een GEMIDDELDE (CBS publiceert het gestandaardiseerde inkomen per leeftijd als
   * gemiddelde, niet als mediaan — tabel 2.4.1, Materiële welvaart 2024).
   */
  incomeMedian: number
  /** Indicatieve referentie-spaarquote (% van inkomen). */
  savingsRatePct: number
}

const AGE_REFERENCE: Record<AgeBandKey, AgeReferenceRow> = {
  // CBS Materiële welvaart 2024 — vermogen (mediaan/gemiddeld) & gestandaardiseerd
  // gemiddeld besteedbaar inkomen (tabel 2.4.1; ~5% boven de cijfers over 2022 i.v.m.
  // latere vintage). `incomeMedian` is hier het GESTANDAARDISEERDE inkomen (factor 1,0).
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
 * Huishoudtype-correctie op de leeftijdscijfers.
 *
 * INKOMEN (`income`) = CBS-equivalentiefactor. De leeftijdsbasis is GESTANDAARDISEERD
 * inkomen (herrekend naar een alleenstaande, factor 1,0); het ruwe huishoudinkomen volgt
 * door te vermenigvuldigen met de equivalentiefactor. Bron: CBS-equivalentiefactoren
 * (Budgetonderzoek 2015, toegepast vanaf verslagjaar 2018):
 *   - alleenstaande               1,00  (per definitie de standaardisatiebasis)
 *   - paar zonder kinderen        1,40
 *   - paar + 1 kind 1,69 · + 2 kinderen 1,91 · + 3 kinderen 2,09
 * `gezin_jong` (paar met jonge kinderen) → 1,75: gemodelleerd tussen 1-kind (1,69) en
 * 2-kinderen (1,91), omdat jonge gezinnen gemiddeld minder/jongere kinderen tellen.
 * `gezin_tiener` (paar met oudere kinderen) → 1,91: CBS-factor voor paar + 2 kinderen.
 * Reconciliatie 35–45-band: alleenstaand €39.000, paar €54.600 (CBS ruw paar ≈ €51.800),
 * gezin €68.250–74.490 (CBS ruw paar-met-kinderen ≈ €73.600). ✓
 *
 * VERMOGEN (`netWorth`) = GEMODELLEERDE factor (geen CBS leeftijd × huishoudtype-kruistabel).
 * CBS-mediaan vermogen per huishoudtype 2022: alleenstaand €18k, paar-zonder €252k,
 * paar-met €238k, eenoudergezin €16k (alleenstaand €18k vs meerpersoons €218k). De ruwe
 * all-ages-verhoudingen (single ≈ 0,13×, paar ≈ 1,9×) zijn te extreem om op één
 * leeftijdsband toe te passen — ze vermengen leeftijds- en huishoudeffecten (jonge
 * alleenstaanden drukken €18k; oudere paren tillen €252k op). We modereren richting het
 * midden, met behoud van de leeftijdsgradient in de basis. De alleenstaand-factor (0,35)
 * geeft 35–45 ≈ €42.035 — fors lager dan de oude 0,55 (€66.055) en ruim boven de
 * all-ages-single-mediaan €18k (terecht: 35–45 is werkzame, vermogensopbouwende leeftijd).
 */
const HOUSEHOLD_ADJUST: Record<HouseholdKey, { netWorth: number; income: number }> = {
  alleenstaand: { netWorth: 0.35, income: 1.00 },
  paar: { netWorth: 1.45, income: 1.40 },
  gezin_jong: { netWorth: 1.25, income: 1.75 },
  gezin_tiener: { netWorth: 1.55, income: 1.91 },
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
