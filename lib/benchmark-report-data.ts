/**
 * Benchmark-rapportage — typecontract voor `/rapportages/benchmark`.
 *
 * Zet de canonieke gebruikerscijfers (uit `loadDashboardData` — gezondheidsscore,
 * vrijheidsleeftijd, spaarquote, netto vermogen, geschat jaarinkomen) af tegen een
 * vergelijkbare doelgroep op basis van **officiële NL-statistiek** (CBS/Nibud/DNB,
 * cohort = leeftijd × huishoudtype) plus een **wereld**-reality-check.
 *
 * Twee soorten referentie, expliciet gelabeld (`tier`):
 *  - `measured`  — direct uit gepubliceerde statistiek (bv. CBS-mediaan vermogen per leeftijd).
 *  - `modelled`  — afgeleid via de app-eigen rekenmotoren op cohort-mediane invoer
 *                  (gezondheidsscore + vrijheidsleeftijd; zie lib/benchmark/reference-peer.ts).
 *
 * Géén data van andere gebruikers — privacy-veilig, geen cross-user reads.
 */

export type BenchmarkTier = 'measured' | 'modelled'

/** Bronverwijzing met jaartal — getoond in de methodologie-callout. */
export interface BenchmarkSource {
  /** Korte bronnaam, bv. "CBS — Vermogen van huishoudens". */
  label: string
  /** Publicatiejaar van de gebruikte cijfers. */
  year: number
  /** Optionele nuance, bv. "indicatieve correctie voor huishoudtype". */
  note?: string
}

export type BenchmarkUnit = 'score' | 'age' | 'pct' | 'eur'

/** Eén parameter-vergelijking: jij vs. de doelgroep. */
export interface BenchmarkMetric {
  key: 'health' | 'fire_age' | 'savings_rate' | 'net_worth' | 'income'
  label: string
  unit: BenchmarkUnit
  /** Jouw waarde; `null` = onvoldoende gegevens om te tonen. */
  userValue: number | null
  /** Referentie (cohort-mediaan of gemodelleerde peer); `null` = niet beschikbaar. */
  referenceValue: number | null
  /** Optionele tweede marker: het NL-gemiddelde (CBS) voor vermogen/inkomen. */
  referenceMean?: number | null
  /** Is hoger beter? Bepaalt kleur/duiding (bij leeftijd is láger beter). */
  higherIsBetter: boolean
  /** Gemeten cijfer of gemodelleerde peer. */
  tier: BenchmarkTier
  /** Vrijheidstijd-duiding van het verschil, indien zinvol (bv. vermogen/inkomen). */
  deltaFreedom?: string | null
  /** Korte redactionele duiding van waar je staat. */
  caption: string
  /**
   * Langere, klikbare toelichting (wat betekent de mediaan/het gemiddelde, hoe is
   * de referentie tot stand gekomen). Getoond in de detail-sheet bij klik op het cijfer.
   */
  explanation: string
  /**
   * Presentatie-hint voor een verdelingscurve (log-normaal, gecentreerd op `mode`).
   * Alleen gezet voor continue verdelingen (vermogen/inkomen).
   */
  curve?: { mode: number; max: number; spread: number }
  source: BenchmarkSource
}

/**
 * Speelse perspectief-vergelijking: jouw vermogen tegenover dat van Elon Musk.
 * Ter relativering — vermogen op wereldschaal is bijna onvoorstelbaar ongelijk.
 */
export interface MuskComparison {
  userNetWorth: number | null
  muskNetWorth: number
  /** Hoeveel keer rijker Musk is (muskNetWorth / userNetWorth), of `null`. */
  ratio: number | null
  /** Redactionele duiding ("Musk is X miljoen keer zo rijk"). */
  caption: string
  /** Vrijheidstijd-omrekening: Musks vermogen uitgedrukt in jaren vrijheid. */
  freedomFraming: string | null
  source: BenchmarkSource
}

/** Eén wereld-percentiel (inkomen of vermogen). */
export interface GlobalRank {
  value: number | null
  /** "Je zit bij de rijkste X% wereldwijd" — `topPercent` = X. `null` = onbekend. */
  topPercent: number | null
  caption: string
}

/** De "reality check" tegen de wereldbevolking. */
export interface GlobalRealityCheck {
  income: GlobalRank | null
  wealth: GlobalRank | null
  source: BenchmarkSource
}

/** Afbakening van de doelgroep (cohort). */
export interface BenchmarkCohortInfo {
  ageBandLabel: string | null
  householdLabel: string | null
  /** Volledig genoeg om een cohort te bepalen (leeftijd + huishoudtype bekend). */
  complete: boolean
  /** Welke profielvelden ontbreken (voor de CTA naar /mijn/profiel). */
  missing: string[]
}

export interface BenchmarkReportData {
  generatedAt: string
  displayName: string | null
  cohort: BenchmarkCohortInfo
  metrics: BenchmarkMetric[]
  global: GlobalRealityCheck
  /** Speelse "jij vs. Musk"-gimmick (null als vermogen onbekend). */
  musk: MuskComparison | null
  /** Alle gebruikte bronnen, voor de methodologie-callout. */
  sources: BenchmarkSource[]
}
