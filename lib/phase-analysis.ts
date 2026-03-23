/**
 * Phase-specific financial analysis — pure calculation functions for
 * gifting (opbouw), housing sale (onttrekking), end-of-life planning,
 * transition gap analysis, and early retirement estimation.
 *
 * Pure functions, geen Supabase dependency.
 */

import {
  berekenErfbelasting,
  berekenSchenkbelasting,
  NL_AOW_MONTHLY,
} from '@/lib/horizon-data'
import { BOX3_DRAG } from '@/lib/constants'
import type { SimCashflow } from '@/lib/fire-simulation'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'

// ── Schenking Constants ─────────────────────────────────────────────────────

/** Nederlandse schenkingsvrijstellingen 2025/2026 (Belastingdienst). */
export const NL_SCHENKING_VRIJSTELLING = {
  /** Jaarlijkse vrijstelling per kind */
  jaarlijksKind: 6_633,
  /** Jaarlijkse vrijstelling overige ontvangers */
  jaarlijksOverig: 2_658,
  /** Eenmalig verhoogde vrijstelling kind 18-40 (eigen woning afgeschaft per 2024) */
  eenmaligVerhoogd: 31_813,
} as const

// ── 1. Giften / Schenking Calculator (Phase 1 — Opbouw) ────────────────────

export interface SchenkingPlan {
  relatieOntvanger: 'kind' | 'overig'
  bedragPerJaar: number
  aantalOntvangers: number
  aantalJaren: number
  startAge: number
  /** Gebruik eenmalig verhoogde vrijstelling (alleen voor 'kind', 18-40 jaar) */
  gebruikEenmaligVerhoogd?: boolean
}

export interface SchenkingAnalysis {
  totaalGeschonken: number
  totaalVrijgesteld: number
  totaalSchenkbelasting: number
  totaalNettoOntvangen: number
  jaarlijksOverzicht: {
    jaar: number
    age: number
    bedragPerOntvanger: number
    vrijstellingPerOntvanger: number
    belastingPerOntvanger: number
    totaalDitJaar: number
  }[]
  /** FIRE impact: geschat aantal maanden vertraging door schenking */
  fireImpactMaanden: number
  /** Jaarlijkse Box 3 besparing door lager vermogen */
  box3Besparing: number
  /** Veilig schenkbedrag dat FIRE niet significant vertraagt */
  veiligBedrag: number
}

/**
 * Analyseer een schenkingsplan: belastingdruk, FIRE-impact en Box 3 besparing.
 *
 * Berekent per jaar de vrijstelling en schenkbelasting via `berekenSchenkbelasting`,
 * inclusief optioneel eenmalig verhoogde vrijstelling in jaar 1 (alleen kinderen).
 */
export function analyzeSchenkingPlan(
  plan: SchenkingPlan,
  context: {
    currentPortfolio: number
    yearlyExpenses: number
    annualSavings: number
    expectedReturn: number
    inflationRate: number
    currentAge: number
    fireAge: number | null
  },
): SchenkingAnalysis {
  const {
    relatieOntvanger,
    bedragPerJaar,
    aantalOntvangers,
    aantalJaren,
    startAge,
    gebruikEenmaligVerhoogd = false,
  } = plan

  const jaarlijkseVrijstelling = relatieOntvanger === 'kind'
    ? NL_SCHENKING_VRIJSTELLING.jaarlijksKind
    : NL_SCHENKING_VRIJSTELLING.jaarlijksOverig

  let totaalGeschonken = 0
  let totaalVrijgesteld = 0
  let totaalSchenkbelasting = 0
  const jaarlijksOverzicht: SchenkingAnalysis['jaarlijksOverzicht'] = []

  for (let i = 0; i < aantalJaren; i++) {
    const age = startAge + i

    // In year 1, optionally add eenmalig verhoogde vrijstelling (only for children)
    const extraVrijstelling =
      i === 0 && gebruikEenmaligVerhoogd && relatieOntvanger === 'kind'
        ? NL_SCHENKING_VRIJSTELLING.eenmaligVerhoogd
        : 0

    // Total exemption this year per recipient
    const vrijstellingDitJaar = jaarlijkseVrijstelling + extraVrijstelling

    // Use existing berekenSchenkbelasting for the belastbaar amount
    // NOTE: berekenSchenkbelasting applies its own vrijstelling internally,
    // so we pass the full amount and let it handle the standard exemption.
    // For the eenmalig verhoogd, we adjust by reducing the taxable base manually.
    let belastingPerOntvanger = 0
    if (extraVrijstelling > 0) {
      // Manual calculation: deduct both standard + eenmalig vrijstelling
      const belastbaar = Math.max(0, bedragPerJaar - vrijstellingDitJaar)
      if (belastbaar > 0) {
        // Apply tax rates for the relatie type using berekenSchenkbelasting
        // on the excess amount (pass as if from 'overig' to avoid double vrijstelling,
        // then manually apply the correct rates via the standard function)
        const taxResult = berekenSchenkbelasting(belastbaar + jaarlijkseVrijstelling, relatieOntvanger)
        // The function deducts its own standard vrijstelling, so the effective taxable
        // amount equals belastbaar — which is what we want
        belastingPerOntvanger = taxResult.belasting
      }
    } else {
      const taxResult = berekenSchenkbelasting(bedragPerJaar, relatieOntvanger)
      belastingPerOntvanger = taxResult.belasting
    }

    const totaalDitJaar = bedragPerJaar * aantalOntvangers
    const vrijgesteldDitJaar = Math.min(bedragPerJaar, vrijstellingDitJaar) * aantalOntvangers
    const belastingDitJaar = belastingPerOntvanger * aantalOntvangers

    totaalGeschonken += totaalDitJaar
    totaalVrijgesteld += vrijgesteldDitJaar
    totaalSchenkbelasting += belastingDitJaar

    jaarlijksOverzicht.push({
      jaar: i + 1,
      age,
      bedragPerOntvanger: Math.round(bedragPerJaar),
      vrijstellingPerOntvanger: Math.round(Math.min(bedragPerJaar, vrijstellingDitJaar)),
      belastingPerOntvanger: Math.round(belastingPerOntvanger),
      totaalDitJaar: Math.round(totaalDitJaar),
    })
  }

  const totaalNettoOntvangen = totaalGeschonken - totaalSchenkbelasting

  // FIRE impact: gifted amount reduces portfolio, estimate delay via savings replacement
  const fireImpactMaanden = context.annualSavings > 0
    ? Math.round((totaalGeschonken / context.annualSavings) * 12)
    : 0

  // Box 3 savings: lower portfolio means less Box 3 tax each year
  const box3Besparing = Math.round(totaalGeschonken * BOX3_DRAG)

  // Safe gifting amount: gift half your annual savings spread across recipients
  const veiligBedrag = aantalOntvangers > 0
    ? Math.round((context.annualSavings * 0.5) / aantalOntvangers)
    : 0

  return {
    totaalGeschonken: Math.round(totaalGeschonken),
    totaalVrijgesteld: Math.round(totaalVrijgesteld),
    totaalSchenkbelasting: Math.round(totaalSchenkbelasting),
    totaalNettoOntvangen: Math.round(totaalNettoOntvangen),
    jaarlijksOverzicht,
    fireImpactMaanden,
    box3Besparing,
    veiligBedrag,
  }
}

// ── 2. Huis Verkopen Analyse (Phase 3 — Onttrekking) ───────────────────────

export interface HuisVerkopenInput {
  woningWaarde: number
  hypotheekResterend: number
  maandlastHypotheek: number
  /** Jaarlijkse woningwaardestijging (decimaal, bijv. 0.03 voor 3%) */
  woningWaardeGroei: number
  /** Maandelijks OZB + VvE + onderhoud */
  maandlastOverig: number
  verwachteHuur: number
  /** Verkoopkosten als fractie (bijv. 0.04 voor 4%) */
  verkoopkostenPct: number
  horizonJaren: number
}

export interface HuisVerkopenResult {
  behouden: {
    totaleCumulatieveKosten: number
    woningWaardeNaHorizon: number
    hypotheekResterendNaHorizon: number
    nettoPositie: number
  }
  verkopen: {
    nettoVerkoopopbrengst: number
    totaleCumulatieveHuur: number
    beleggingswaarde: number
    nettoPositie: number
  }
  /** Positief = verkopen is voordeliger; negatief = behouden is voordeliger */
  verschil: number
  aanbeveling: 'behouden' | 'verkopen' | 'gelijk'
  /** Maandelijkse huur waarbij beide scenario's gelijk uitkomen */
  breakevenHuur: number
  jaarlijkseVergelijking: {
    jaar: number
    behouden: number
    verkopen: number
    verschil: number
  }[]
}

/**
 * Vergelijk woning behouden vs. verkopen over een horizon.
 *
 * Behouden: woning stijgt in waarde, kosten lopen door.
 * Verkopen: opbrengst belegd (minus Box 3 drag), huur betalen (geïndexeerd).
 */
export function analyzeHuisVerkopen(
  input: HuisVerkopenInput,
  investmentReturn: number,
  inflationRate: number,
): HuisVerkopenResult {
  const core = computeHuisVerkopenCore(input, investmentReturn, inflationRate)

  // Breakeven huur: binary search for monthly rent where scenarios are equal
  const breakevenHuur = findBreakevenHuur(input, investmentReturn, inflationRate)

  return { ...core, breakevenHuur }
}

/** Core computation without breakeven search (avoids recursion). */
function computeHuisVerkopenCore(
  input: HuisVerkopenInput,
  investmentReturn: number,
  inflationRate: number,
): Omit<HuisVerkopenResult, 'breakevenHuur'> {
  const {
    woningWaarde,
    hypotheekResterend,
    maandlastHypotheek,
    woningWaardeGroei,
    maandlastOverig,
    verwachteHuur,
    verkoopkostenPct,
    horizonJaren,
  } = input

  // ── Behouden scenario ──────────────────────────────────────

  let cumulatieveKostenBehouden = 0
  let woningWaardeHuidig = woningWaarde
  const hypotheekAflossingPerJaar = horizonJaren > 0
    ? hypotheekResterend / Math.max(horizonJaren, 1)
    : 0
  let hypotheekBalans = hypotheekResterend

  const jaarlijkseVergelijking: HuisVerkopenResult['jaarlijkseVergelijking'] = []

  // ── Verkopen scenario ──────────────────────────────────────

  const nettoVerkoopopbrengst = Math.round(woningWaarde * (1 - verkoopkostenPct) - hypotheekResterend)
  let beleggingsWaarde = Math.max(0, nettoVerkoopopbrengst)
  let cumulatieveHuur = 0
  const netReturn = investmentReturn - BOX3_DRAG

  for (let jaar = 1; jaar <= horizonJaren; jaar++) {
    woningWaardeHuidig *= (1 + woningWaardeGroei)
    const jaarlijkseKosten = (maandlastHypotheek + maandlastOverig) * 12
    cumulatieveKostenBehouden += jaarlijkseKosten
    hypotheekBalans = Math.max(0, hypotheekBalans - hypotheekAflossingPerJaar)

    const nettoBehouden = Math.round(woningWaardeHuidig - hypotheekBalans - cumulatieveKostenBehouden)

    beleggingsWaarde *= (1 + netReturn)
    const jaarHuur = verwachteHuur * 12 * Math.pow(1 + inflationRate, jaar - 1)
    cumulatieveHuur += jaarHuur
    beleggingsWaarde -= jaarHuur

    const nettoVerkopen = Math.round(beleggingsWaarde)

    jaarlijkseVergelijking.push({
      jaar,
      behouden: nettoBehouden,
      verkopen: nettoVerkopen,
      verschil: Math.round(nettoVerkopen - nettoBehouden),
    })
  }

  const behouden = {
    totaleCumulatieveKosten: Math.round(cumulatieveKostenBehouden),
    woningWaardeNaHorizon: Math.round(woningWaardeHuidig),
    hypotheekResterendNaHorizon: Math.round(hypotheekBalans),
    nettoPositie: Math.round(woningWaardeHuidig - hypotheekBalans - cumulatieveKostenBehouden),
  }

  const verkopen = {
    nettoVerkoopopbrengst,
    totaleCumulatieveHuur: Math.round(cumulatieveHuur),
    beleggingswaarde: Math.round(beleggingsWaarde),
    nettoPositie: Math.round(beleggingsWaarde),
  }

  const verschil = verkopen.nettoPositie - behouden.nettoPositie

  const aanbeveling: HuisVerkopenResult['aanbeveling'] =
    verschil > 10_000 ? 'verkopen' : verschil < -10_000 ? 'behouden' : 'gelijk'

  return {
    behouden,
    verkopen,
    verschil: Math.round(verschil),
    aanbeveling,
    jaarlijkseVergelijking,
  }
}

/**
 * Binary search voor de maandelijkse huurprijs waarbij verkopen en behouden
 * na de horizon hetzelfde netto resultaat opleveren.
 */
function findBreakevenHuur(
  input: HuisVerkopenInput,
  investmentReturn: number,
  inflationRate: number,
): number {
  let lo = 0
  let hi = input.maandlastHypotheek + input.maandlastOverig + 5000
  const MAX_ITERATIONS = 50
  const TOLERANCE = 1

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const mid = (lo + hi) / 2
    const testInput = { ...input, verwachteHuur: mid }
    const result = computeHuisVerkopenCore(testInput, investmentReturn, inflationRate)

    if (Math.abs(result.verschil) < TOLERANCE) return Math.round(mid)
    if (result.verschil > 0) {
      lo = mid
    } else {
      hi = mid
    }
  }

  return Math.round((lo + hi) / 2)
}

// ── 3. End-of-Life Analysis (Phase 3) ──────────────────────────────────────

export interface EndOfLifeInput {
  rows: UnifiedProjectionRow[]
  strategy: 'perpetual' | 'legacy' | 'deplete' | 'pensioen'
  endAge: number
  /** Erfgenamen: relatie tot erflater + fractie van de nalatenschap */
  erfgenamen?: { relatie: 'kind' | 'partner' | 'overig'; fractie: number }[]
  hasPartner?: boolean
  partnerAowBedrag?: number
  nabestaandenPensioen?: number
  /** Base inflation rate (e.g. 0.02 for 2%) for inflation sensitivity analysis */
  inflationRate?: number
  /** Current age (for inflation sensitivity: years until endAge) */
  currentAge?: number
}

export interface EndOfLifeAnalysis {
  eindVermogen: number
  gevoeligheid: {
    label: string
    leeftijd: number
    eindVermogen: number
    erfbelastingTotaal: number
    nettoNalatenschap: number
  }[]
  erfenisIndicatie: {
    brutoBedrag: number
    totaalBelasting: number
    nettoBedrag: number
    perErfgenaam: {
      relatie: string
      fractie: number
      bruto: number
      belasting: number
      netto: number
    }[]
  }
  partnerVoortzetting: {
    maandelijksBeschikbaar: number
    jaarlijksBeschikbaar: number
    toereikend: boolean
    tekort: number
  } | null
  /** Inflation sensitivity: how different inflation rates affect real end portfolio */
  inflatieGevoeligheid: {
    label: string
    inflatie: number // e.g. 0.015, 0.02, 0.025
    reëelEindVermogen: number
    verschil: number // difference from base scenario
  }[] | null
}

/**
 * Analyseer het einde van de simulatie: eindvermogen, erfbelasting,
 * gevoeligheid voor levensduur, en partnervoortzetting.
 */
export function analyzeEndOfLife(input: EndOfLifeInput): EndOfLifeAnalysis {
  const {
    rows,
    endAge,
    erfgenamen = [{ relatie: 'kind' as const, fractie: 1.0 }],
    hasPartner = false,
    partnerAowBedrag,
    nabestaandenPensioen = 0,
    inflationRate,
    currentAge,
  } = input

  // Find the row closest to endAge
  const endRow = findRowAtAge(rows, endAge)
  const eindVermogen = endRow ? Math.round(endRow.netWorth) : 0

  // Gevoeligheid: compute for endAge-5, endAge, endAge+5
  const gevoeligheid = computeGevoeligheid(rows, endAge, erfgenamen)

  // Erfenis indicatie at endAge
  const erfenisIndicatie = computeErfenisIndicatie(eindVermogen, erfgenamen)

  // Partner voortzetting
  const partnerVoortzetting = hasPartner
    ? computePartnerVoortzetting(partnerAowBedrag, nabestaandenPensioen, rows, endAge)
    : null

  // Inflatie-gevoeligheid: effect van ±0.5% inflatie op reëel eindvermogen
  const inflatieGevoeligheid = inflationRate != null && currentAge != null
    ? computeInflatieGevoeligheid(eindVermogen, inflationRate, currentAge, endAge)
    : null

  return {
    eindVermogen,
    gevoeligheid,
    erfenisIndicatie,
    partnerVoortzetting,
    inflatieGevoeligheid,
  }
}

/** Vind de projectierij die het dichtst bij een bepaalde leeftijd ligt. */
function findRowAtAge(rows: UnifiedProjectionRow[], targetAge: number): UnifiedProjectionRow | null {
  if (rows.length === 0) return null

  // Exact match first
  const exact = rows.find(r => r.age === targetAge)
  if (exact) return exact

  // Closest match
  let closest = rows[0]
  let minDiff = Math.abs(rows[0].age - targetAge)
  for (const row of rows) {
    const diff = Math.abs(row.age - targetAge)
    if (diff < minDiff) {
      closest = row
      minDiff = diff
    }
  }
  return closest
}

/**
 * Gevoeligheidsanalyse: wat als je 5 jaar eerder/later overlijdt?
 * Voor leeftijden voorbij de laatste projectierij wordt het vermogen
 * geëxtrapoleerd op basis van de laatste bekende onttrekking en rendement.
 */
function computeGevoeligheid(
  rows: UnifiedProjectionRow[],
  endAge: number,
  erfgenamen: { relatie: 'kind' | 'partner' | 'overig'; fractie: number }[],
): EndOfLifeAnalysis['gevoeligheid'] {
  const scenarios = [
    { label: '5 jaar eerder', leeftijd: endAge - 5 },
    { label: 'Verwacht', leeftijd: endAge },
    { label: '5 jaar later', leeftijd: endAge + 5 },
  ]

  const lastRow = rows.length > 0 ? rows[rows.length - 1] : null

  return scenarios.map(({ label, leeftijd }) => {
    let vermogen: number

    const row = findRowAtAge(rows, leeftijd)
    if (row && row.age === leeftijd) {
      vermogen = row.netWorth
    } else if (lastRow && leeftijd > lastRow.age) {
      // Extrapolate: assume last row's growth rate and withdrawal continue
      const extraYears = leeftijd - lastRow.age
      const lastGrowthRate = lastRow.totalGrowth !== 0 && lastRow.startNetWorth !== 0
        ? lastRow.totalGrowth / lastRow.startNetWorth
        : 0
      const lastWithdrawal = lastRow.withdrawal
      let projected = lastRow.netWorth
      for (let y = 0; y < extraYears; y++) {
        projected = projected * (1 + lastGrowthRate) - lastWithdrawal
      }
      vermogen = Math.max(0, projected)
    } else {
      // Earlier than available rows — use closest
      vermogen = row ? row.netWorth : 0
    }

    vermogen = Math.round(vermogen)

    // Compute erfbelasting for this scenario
    let erfbelastingTotaal = 0
    for (const erf of erfgenamen) {
      const brutoAandeel = vermogen * erf.fractie
      const result = berekenErfbelasting(brutoAandeel, erf.relatie)
      erfbelastingTotaal += result.totaalBelasting
    }

    return {
      label,
      leeftijd,
      eindVermogen: vermogen,
      erfbelastingTotaal: Math.round(erfbelastingTotaal),
      nettoNalatenschap: Math.round(vermogen - erfbelastingTotaal),
    }
  })
}

/**
 * Inflatie-gevoeligheidsanalyse: wat als de inflatie 0.5% hoger/lager is?
 *
 * Het nominale eindvermogen uit de simulatie is berekend met de basis-inflatie.
 * Bij een andere inflatie zou de reële koopkracht van datzelfde nominale bedrag
 * anders zijn. We berekenen het reële eindvermogen door de koopkracht-erosie
 * aan te passen over de jaren tot endAge.
 *
 * Formule: reëelVermogen = nominaalVermogen × (1 + baseInflatie)^n / (1 + scenarioInflatie)^n
 * Dit geeft de koopkracht in huidige euro's onder het scenario-inflatietarief.
 */
function computeInflatieGevoeligheid(
  nominaalEindVermogen: number,
  baseInflation: number,
  currentAge: number,
  endAge: number,
): EndOfLifeAnalysis['inflatieGevoeligheid'] {
  const yearsUntilEnd = Math.max(0, endAge - currentAge)
  if (yearsUntilEnd === 0) return null

  const DELTA = 0.005 // ±0.5%
  const scenarios = [
    { label: `Inflatie ${((baseInflation - DELTA) * 100).toFixed(1)}%`, inflatie: baseInflation - DELTA },
    { label: `Inflatie ${(baseInflation * 100).toFixed(1)}% (basis)`, inflatie: baseInflation },
    { label: `Inflatie ${((baseInflation + DELTA) * 100).toFixed(1)}%`, inflatie: baseInflation + DELTA },
  ]

  // Reëel eindvermogen bij basis-inflatie (reference point)
  const baseReëel = Math.round(nominaalEindVermogen / Math.pow(1 + baseInflation, yearsUntilEnd))

  return scenarios.map(({ label, inflatie }) => {
    const reëelEindVermogen = Math.round(nominaalEindVermogen / Math.pow(1 + inflatie, yearsUntilEnd))
    return {
      label,
      inflatie,
      reëelEindVermogen,
      verschil: reëelEindVermogen - baseReëel,
    }
  })
}

/** Bereken erfbelasting verdeling over erfgenamen. */
function computeErfenisIndicatie(
  eindVermogen: number,
  erfgenamen: { relatie: 'kind' | 'partner' | 'overig'; fractie: number }[],
): EndOfLifeAnalysis['erfenisIndicatie'] {
  let totaalBelasting = 0
  const perErfgenaam = erfgenamen.map(erf => {
    const bruto = Math.round(eindVermogen * erf.fractie)
    const result = berekenErfbelasting(bruto, erf.relatie)
    totaalBelasting += result.totaalBelasting
    return {
      relatie: erf.relatie,
      fractie: erf.fractie,
      bruto,
      belasting: Math.round(result.totaalBelasting),
      netto: Math.round(result.netto),
    }
  })

  return {
    brutoBedrag: Math.round(eindVermogen),
    totaalBelasting: Math.round(totaalBelasting),
    nettoBedrag: Math.round(eindVermogen - totaalBelasting),
    perErfgenaam,
  }
}

/**
 * Bereken of de partner financieel kan voortleven na overlijden.
 * Inkomen = AOW + nabestaandenpensioen. Vergelijk met huidige uitgaven.
 */
function computePartnerVoortzetting(
  partnerAowBedrag: number | undefined,
  nabestaandenPensioen: number,
  rows: UnifiedProjectionRow[],
  endAge: number,
): EndOfLifeAnalysis['partnerVoortzetting'] {
  // AOW: use provided amount, or default to single AOW (partner becomes single after death)
  const aowMaandelijks = partnerAowBedrag ?? NL_AOW_MONTHLY

  const maandelijksBeschikbaar = Math.round(aowMaandelijks + nabestaandenPensioen)
  const jaarlijksBeschikbaar = maandelijksBeschikbaar * 12

  // Estimate partner's expenses: use the withdrawal at endAge as proxy,
  // or fall back to the gross expenses from the last available row.
  // Partners typically need ~70% of household expenses when single.
  const endRow = findRowAtAge(rows, endAge)
  const jaarlijkseUitgaven = endRow
    ? Math.round((endRow.withdrawal > 0 ? endRow.withdrawal : endRow.grossIncome) * 0.7)
    : 0

  const tekort = Math.max(0, jaarlijkseUitgaven - jaarlijksBeschikbaar)

  return {
    maandelijksBeschikbaar,
    jaarlijksBeschikbaar,
    toereikend: tekort === 0,
    tekort: Math.round(tekort),
  }
}

// ── 4. Gap-analyse strategieën (Phase 2 — Overgang) ────────────────────────

export type OvergangStrategie = 'gelijkmatig' | 'afbouwend' | 'deeltijdwerk'

export interface OvergangStrategieResult {
  strategie: OvergangStrategie
  label: string
  description: string
  jaarlijkseOnttrekking: {
    age: number
    onttrekking: number
    deeltijdInkomen: number
    nettoOnttrekking: number
  }[]
  eindVermogenOvergang: number
  /** Of het portfolio de volledige transitieperiode overleeft */
  overleeft: boolean
}

/**
 * Vergelijk drie transitiestrategieën voor de overgang van opbouw naar onttrekking.
 *
 * - Gelijkmatig: vaste onttrekking elk jaar
 * - Afbouwend: hoog starten (1.2×), lineair afbouwen naar 0.8×
 * - Deeltijdwerk: lagere onttrekking door parttime inkomen
 */
export function compareOvergangStrategieen(
  startPortfolio: number,
  startAge: number,
  endAge: number,
  yearlyExpenses: number,
  expectedReturn: number,
  inflationRate: number,
  deeltijdInkomen?: number,
): OvergangStrategieResult[] {
  const years = endAge - startAge
  if (years <= 0) return []

  const netReturn = expectedReturn - BOX3_DRAG

  const strategies: {
    strategie: OvergangStrategie
    label: string
    description: string
    getWithdrawal: (yearIndex: number) => { onttrekking: number; deeltijdInkomen: number }
  }[] = [
    {
      strategie: 'gelijkmatig',
      label: 'Gelijkmatige onttrekking',
      description: 'Elk jaar hetzelfde bedrag onttrekken, geïndexeerd met inflatie.',
      getWithdrawal: (yearIndex: number) => ({
        onttrekking: yearlyExpenses * Math.pow(1 + inflationRate, yearIndex),
        deeltijdInkomen: 0,
      }),
    },
    {
      strategie: 'afbouwend',
      label: 'Afbouwende onttrekking',
      description: 'Start hoog (120%), bouw lineair af naar 80% — meer uitgeven in actieve jaren.',
      getWithdrawal: (yearIndex: number) => {
        // Linear interpolation: 1.2 at year 0 → 0.8 at last year
        const factor = years > 1
          ? 1.2 - (0.4 * yearIndex) / (years - 1)
          : 1.0
        return {
          onttrekking: yearlyExpenses * factor * Math.pow(1 + inflationRate, yearIndex),
          deeltijdInkomen: 0,
        }
      },
    },
    {
      strategie: 'deeltijdwerk',
      label: 'Deeltijd werken',
      description: 'Parttime inkomen verlaagt de onttrekking uit vermogen.',
      getWithdrawal: (yearIndex: number) => {
        const maandelijksInkomen = deeltijdInkomen ?? 0
        const jaarInkomen = maandelijksInkomen * 12 * Math.pow(1 + inflationRate, yearIndex)
        const expenses = yearlyExpenses * Math.pow(1 + inflationRate, yearIndex)
        return {
          onttrekking: expenses,
          deeltijdInkomen: jaarInkomen,
        }
      },
    },
  ]

  return strategies.map(({ strategie, label, description, getWithdrawal }) => {
    let portfolio = startPortfolio
    const jaarlijkseOnttrekking: OvergangStrategieResult['jaarlijkseOnttrekking'] = []
    let overleeft = true

    for (let i = 0; i < years; i++) {
      const age = startAge + i
      const { onttrekking, deeltijdInkomen: inkomen } = getWithdrawal(i)
      const nettoOnttrekking = Math.max(0, onttrekking - inkomen)

      // Portfolio grows, then withdrawal
      portfolio = portfolio * (1 + netReturn) - nettoOnttrekking

      if (portfolio < 0) {
        overleeft = false
        portfolio = 0
      }

      jaarlijkseOnttrekking.push({
        age,
        onttrekking: Math.round(onttrekking),
        deeltijdInkomen: Math.round(inkomen),
        nettoOnttrekking: Math.round(nettoOnttrekking),
      })
    }

    return {
      strategie,
      label,
      description,
      jaarlijkseOnttrekking,
      eindVermogenOvergang: Math.round(portfolio),
      overleeft,
    }
  })
}

// ── 5. Eerder Stoppen Calculator (Phase 2) ─────────────────────────────────

export interface EerderStoppenResult {
  opties: {
    jarenEerder: number
    nieuwFireAge: number
    extraMaandelijksBesparen: number
    haalbaar: boolean
  }[]
}

/**
 * Bereken hoeveel extra je maandelijks moet sparen om N jaar eerder te stoppen.
 *
 * Gebruikt de sinking-fund formule (geen simulatie) voor performance —
 * deze functie wordt aangeroepen bij elke modal-open.
 *
 * r = expectedReturn - BOX3_DRAG - inflationRate (reëel rendement na belasting)
 * needed = yearlyExpenses / effectiveSWR
 * projected = currentPortfolio × (1+r)^years + annualSavings × ((1+r)^years - 1) / r
 * gap = needed - projected
 * extraAnnual = gap × r / ((1+r)^years - 1)  [sinking fund]
 */
export function berekenEerderStoppen(
  currentAge: number,
  currentFireAge: number,
  currentPortfolio: number,
  yearlyExpenses: number,
  currentAnnualSavings: number,
  expectedReturn: number,
  inflationRate: number,
  _cashflows: SimCashflow[],
  _strategyConfig: FireStrategyConfig,
  years?: number[],
): EerderStoppenResult {
  const targetYears = years ?? [1, 2, 3, 5]

  // Real return after Box 3 drag and inflation
  const r = expectedReturn - BOX3_DRAG - inflationRate

  // Effective SWR = real return (used to compute FIRE target, consistent with NL_SWR pattern)
  const effectiveSwr = Math.max(r, 0.001) // floor to avoid division by zero

  // Required portfolio at FIRE (perpetuele formule)
  const neededPortfolio = yearlyExpenses / effectiveSwr

  const opties = targetYears.map(n => {
    const nieuwFireAge = currentFireAge - n
    const yearsToTarget = nieuwFireAge - currentAge

    // If target age is in the past or at current age, it's not feasible
    if (yearsToTarget <= 0) {
      return {
        jarenEerder: n,
        nieuwFireAge,
        extraMaandelijksBesparen: 0,
        haalbaar: false,
      }
    }

    // Project current portfolio + savings forward to target age
    const growthFactor = Math.pow(1 + r, yearsToTarget)

    // FV of current portfolio
    const fvPortfolio = currentPortfolio * growthFactor

    // FV of annual savings annuity (payments at end of each year)
    const fvSavings = r > 0.0001
      ? currentAnnualSavings * (growthFactor - 1) / r
      : currentAnnualSavings * yearsToTarget

    const projectedPortfolio = fvPortfolio + fvSavings
    const gap = neededPortfolio - projectedPortfolio

    if (gap <= 0) {
      // Already projected to reach FIRE earlier — no extra savings needed
      return {
        jarenEerder: n,
        nieuwFireAge,
        extraMaandelijksBesparen: 0,
        haalbaar: true,
      }
    }

    // Sinking fund formula: extra annual payment to close the gap
    const extraAnnual = r > 0.0001
      ? gap * r / (growthFactor - 1)
      : gap / yearsToTarget

    const extraMonthly = Math.round(extraAnnual / 12)

    // Haalbaar: extra monthly savings must be less than current annual savings
    // (effectively: you can't more than double your savings rate)
    const haalbaar = extraAnnual < currentAnnualSavings

    return {
      jarenEerder: n,
      nieuwFireAge,
      extraMaandelijksBesparen: extraMonthly,
      haalbaar,
    }
  })

  return { opties }
}
