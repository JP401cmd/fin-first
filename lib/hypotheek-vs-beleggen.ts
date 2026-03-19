/**
 * Hypotheek vs. Beleggen — Vergelijkingsengine
 *
 * Vergelijkt twee scenario's voor extra geld:
 *   1. Extra aflossen op de hypotheek (rentebesparing, verlies HRA)
 *   2. Extra beleggen (compound growth, Box 3 belasting)
 *
 * Berekent breakeven-rendement, jaarlijkse vergelijking en FIRE-impact.
 */

import { BOX3_DRAG } from '@/lib/horizon-data'
import {
  amortizationSchedule,
  linearAmortization,
  interestOnlySchedule,
} from '@/lib/debt-data'
import { runSimulation, type SimCashflow } from '@/lib/fire-simulation'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RepaymentType = 'annuity' | 'linear' | 'interest_only'

export interface HvBParams {
  /** Maandelijks extra bedrag (€) */
  extraBedrag: number
  /** Huidige hypotheekbalans (€) */
  hypotheekBalance: number
  /** Jaarlijkse hypotheekrente (als percentage, bijv. 3.5 voor 3,5%) */
  rente: number
  /** Aflossingstype */
  repaymentType: RepaymentType
  /** Resterende looptijd in maanden */
  restLooptijd: number
  /** Is de rente fiscaal aftrekbaar? */
  isTaxDeductible: boolean
  /** Marginaal IB-tarief (bijv. 0.3697 of 0.4950) */
  marginaalTarief: number
  /** Verwacht bruto rendement op beleggingen (decimaal, bijv. 0.07) */
  verwachtRendement: number
  /** Verwachte inflatie (decimaal, bijv. 0.02) */
  inflatie: number
  /** Heeft partner (beïnvloedt Box 3 vrijstelling, niet meegenomen in v1) */
  hasPartner: boolean
  /** Vergelijkingshorizon in jaren */
  horizonJaren: number

  // ── Optioneel: voor FIRE-impact berekening ──
  /** Huidige leeftijd (nodig voor FIRE-impact) */
  currentAge?: number
  /** Huidige portfolio waarde (nodig voor FIRE-impact) */
  currentPortfolio?: number
  /** Jaarlijkse uitgaven (nodig voor FIRE-impact) */
  yearlyExpenses?: number
  /** Jaarlijkse besparingen (nodig voor FIRE-impact) */
  annualSavings?: number
  /** Bestaande cashflows voor simulatie */
  cashflows?: SimCashflow[]
}

export interface ScenarioResult {
  /** Totaal eindwaarde na horizon (€) */
  eindwaarde: number
  /** Totale netto winst/besparing over de horizon (€) */
  nettoVoordeel: number
}

export interface JaarVergelijking {
  jaar: number
  /** Cumulatief netto voordeel aflossen (€) */
  aflossen: number
  /** Cumulatief netto voordeel beleggen (€) */
  beleggen: number
  /** Verschil: beleggen - aflossen (positief = beleggen wint) */
  verschil: number
}

export interface HvBResult {
  aflossing: ScenarioResult
  beleggen: ScenarioResult
  /** Netto verschil: beleggen.nettoVoordeel - aflossing.nettoVoordeel (positief = beleggen wint) */
  verschil: number
  /** Breakeven bruto rendement (decimaal) — rendement waarbij beleggen ≈ aflossen */
  breakevenRendement: number
  /** Jaarlijkse vergelijkingstabel */
  jaarlijkseVergelijking: JaarVergelijking[]
  /** FIRE-impact in maanden (positief = beleggen brengt FIRE eerder, null als niet berekenbaar) */
  fireImpactMaanden: number | null
  /** Aanbeveling */
  aanbeveling: 'aflossen' | 'beleggen' | 'gelijk'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Bereken totale rente betaald in een amortisatieschema.
 */
function totalInterest(
  schedule: Array<{ interest: number }>,
  maxMonths?: number,
): number {
  const n = maxMonths ?? schedule.length
  return schedule.slice(0, n).reduce((sum, r) => sum + r.interest, 0)
}

/**
 * Genereer amortisatieschema op basis van type.
 */
function generateSchedule(
  balance: number,
  annualRatePercent: number,
  repaymentType: RepaymentType,
  termMonths: number,
  monthlyPayment: number,
) {
  switch (repaymentType) {
    case 'linear':
      return linearAmortization(balance, annualRatePercent, termMonths)
    case 'interest_only':
      return interestOnlySchedule(balance, annualRatePercent, termMonths)
    case 'annuity':
    default:
      return amortizationSchedule(balance, annualRatePercent, monthlyPayment)
  }
}

/**
 * Bereken de normale maandelijkse hypotheekbetaling op basis van type.
 */
function computeMonthlyPayment(
  balance: number,
  annualRatePercent: number,
  repaymentType: RepaymentType,
  termMonths: number,
): number {
  const monthlyRate = annualRatePercent / 100 / 12
  switch (repaymentType) {
    case 'linear':
      // Eerste maand (hoogste) als referentie
      return (balance / termMonths) + (balance * monthlyRate)
    case 'interest_only':
      return balance * monthlyRate
    case 'annuity':
    default: {
      if (monthlyRate === 0) return balance / termMonths
      return balance * (monthlyRate * Math.pow(1 + monthlyRate, termMonths))
        / (Math.pow(1 + monthlyRate, termMonths) - 1)
    }
  }
}

// ── Aflossingsscenario ────────────────────────────────────────────────────────

/**
 * Bereken het netto voordeel van extra aflossen per jaar.
 * Rentebesparing minus verloren HRA.
 */
function computeAflossingsScenario(params: HvBParams): {
  nettoVoordeelPerJaar: number[]
  totaalNetto: number
  eindwaarde: number
} {
  const { extraBedrag, hypotheekBalance, rente, repaymentType, restLooptijd,
          isTaxDeductible, marginaalTarief, horizonJaren } = params

  const maanden = Math.min(restLooptijd, horizonJaren * 12)
  const basePayment = computeMonthlyPayment(hypotheekBalance, rente, repaymentType, restLooptijd)

  // Schema ZONDER extra aflossing
  const scheduleBase = generateSchedule(hypotheekBalance, rente, repaymentType, restLooptijd, basePayment)

  // Schema MET extra aflossing
  const extraPayment = basePayment + extraBedrag
  const scheduleExtra = generateSchedule(hypotheekBalance, rente, repaymentType, restLooptijd, extraPayment)

  const nettoVoordeelPerJaar: number[] = []
  let totaalNetto = 0

  for (let jaar = 1; jaar <= horizonJaren; jaar++) {
    const startMonth = (jaar - 1) * 12
    const endMonth = Math.min(jaar * 12, maanden)

    // Rente betaald in dit jaar in beide scenario's
    const renteBase = totalInterest(scheduleBase.slice(startMonth, endMonth))
    const renteExtra = totalInterest(scheduleExtra.slice(startMonth, endMonth))

    // Rentebesparing
    const renteBesparing = renteBase - renteExtra

    // Verloren HRA (minder renteaftrek)
    const hraVerlies = isTaxDeductible ? renteBesparing * marginaalTarief : 0

    // Netto voordeel dit jaar
    const netto = renteBesparing - hraVerlies
    totaalNetto += netto
    nettoVoordeelPerJaar.push(totaalNetto)
  }

  // Eindwaarde: totale netto besparing + het extra afgeloste bedrag (equity)
  const totalExtraAfgelost = Math.min(extraBedrag * maanden, hypotheekBalance)
  const eindwaarde = totaalNetto + totalExtraAfgelost

  return { nettoVoordeelPerJaar, totaalNetto, eindwaarde }
}

// ── Beleggingsscenario ────────────────────────────────────────────────────────

/**
 * Bereken het netto voordeel van extra beleggen per jaar.
 * Compound growth minus Box 3 belasting.
 */
function computeBeleggingsScenario(params: HvBParams, overrideRendement?: number): {
  nettoVoordeelPerJaar: number[]
  totaalNetto: number
  eindwaarde: number
} {
  const { extraBedrag, horizonJaren, inflatie } = params
  const verwachtRendement = overrideRendement ?? params.verwachtRendement

  // Jaarlijkse netto groei na Box 3
  const nettoRendement = verwachtRendement - BOX3_DRAG

  const nettoVoordeelPerJaar: number[] = []
  let portfolioWaarde = 0
  let totaalIngelegd = 0

  for (let jaar = 1; jaar <= horizonJaren; jaar++) {
    // Maandelijkse inleg gedurende het jaar
    const jaarInleg = extraBedrag * 12
    totaalIngelegd += jaarInleg

    // Groei: bestaande portfolio groeit een vol jaar, nieuwe inleg gemiddeld half jaar
    portfolioWaarde = portfolioWaarde * (1 + nettoRendement) + jaarInleg * (1 + nettoRendement * 0.5)

    // Netto voordeel = portfoliowaarde - totaal ingelegd (= rendement - belasting)
    const netto = portfolioWaarde - totaalIngelegd
    nettoVoordeelPerJaar.push(netto)
  }

  // Reëel rendement (inflatie-gecorrigeerd)
  const reeleEindwaarde = portfolioWaarde / Math.pow(1 + inflatie, horizonJaren)
  const totaalNetto = portfolioWaarde - totaalIngelegd

  return { nettoVoordeelPerJaar, totaalNetto, eindwaarde: reeleEindwaarde }
}

// ── Breakeven Binary Search ───────────────────────────────────────────────────

/**
 * Zoek het bruto rendement waarbij netto beleggen ≈ netto aflossen.
 * Binary search over rendement 0%–25%.
 */
function computeBreakevenRendement(params: HvBParams, aflossingsNetto: number): number {
  let lo = 0
  let hi = 0.25
  const TOLERANCE = 0.00001 // 0.001%
  const MAX_ITER = 50

  for (let i = 0; i < MAX_ITER; i++) {
    const mid = (lo + hi) / 2
    const belegResult = computeBeleggingsScenario(params, mid)

    if (Math.abs(belegResult.totaalNetto - aflossingsNetto) < 1) {
      return mid
    }

    if (belegResult.totaalNetto < aflossingsNetto) {
      lo = mid
    } else {
      hi = mid
    }

    if (hi - lo < TOLERANCE) break
  }

  return (lo + hi) / 2
}

// ── FIRE-impact ───────────────────────────────────────────────────────────────

/**
 * Bereken FIRE-impact: verschil in fireAge tussen aflossen- en beleggen-scenario.
 * Positief = beleggen brengt FIRE eerder.
 */
function computeFireImpact(params: HvBParams): number | null {
  const { currentAge, currentPortfolio, yearlyExpenses, annualSavings,
          verwachtRendement, inflatie, cashflows, extraBedrag } = params

  // Alle optionele FIRE-velden moeten aanwezig zijn
  if (currentAge == null || currentPortfolio == null ||
      yearlyExpenses == null || annualSavings == null) {
    return null
  }

  const endAge = 100
  const baseCashflows = cashflows ?? []

  // Scenario A: extra aflossen → lagere maandlasten (= meer spaarruimte)
  // Vereenvoudigd: extra bedrag gaat naar schuld, niet naar portfolio
  const simAflossen = runSimulation(
    currentAge, endAge, currentPortfolio,
    yearlyExpenses, annualSavings, // savings stay the same (extra goes to mortgage)
    verwachtRendement, 'nl_box3', inflatie,
    baseCashflows,
  )

  // Scenario B: extra beleggen → hogere jaarlijkse besparingen
  const extraJaarlijks = extraBedrag * 12
  const simBeleggen = runSimulation(
    currentAge, endAge, currentPortfolio,
    yearlyExpenses, annualSavings + extraJaarlijks,
    verwachtRendement, 'nl_box3', inflatie,
    baseCashflows,
  )

  const ageA = simAflossen.fireAgeFractional
  const ageB = simBeleggen.fireAgeFractional

  if (ageA == null && ageB == null) return null
  if (ageA == null) return 120 // aflossen bereikt FIRE niet → groot voordeel beleggen
  if (ageB == null) return -120 // beleggen bereikt FIRE niet → aflossen beter

  // Verschil in maanden (positief = beleggen sneller)
  return Math.round((ageA - ageB) * 12)
}

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Vergelijk extra aflossen vs. extra beleggen.
 *
 * @param params — Alle input parameters
 * @returns HvBResult met beide scenario's, breakeven en FIRE-impact
 */
export function compareMortgageVsInvest(params: HvBParams): HvBResult {
  // Edge case: bij 0 extra bedrag is er geen verschil
  if (params.extraBedrag <= 0) {
    return {
      aflossing: { eindwaarde: 0, nettoVoordeel: 0 },
      beleggen: { eindwaarde: 0, nettoVoordeel: 0 },
      verschil: 0,
      breakevenRendement: 0,
      jaarlijkseVergelijking: [],
      fireImpactMaanden: null,
      aanbeveling: 'gelijk',
    }
  }

  // Bereken beide scenario's
  const aflResult = computeAflossingsScenario(params)
  const belResult = computeBeleggingsScenario(params)

  const aflossing: ScenarioResult = {
    eindwaarde: Math.round(aflResult.eindwaarde),
    nettoVoordeel: Math.round(aflResult.totaalNetto),
  }

  const beleggen: ScenarioResult = {
    eindwaarde: Math.round(belResult.eindwaarde),
    nettoVoordeel: Math.round(belResult.totaalNetto),
  }

  const verschil = beleggen.nettoVoordeel - aflossing.nettoVoordeel

  // Breakeven rendement
  const breakevenRendement = computeBreakevenRendement(params, aflResult.totaalNetto)

  // Jaarlijkse vergelijking
  const jaarlijkseVergelijking: JaarVergelijking[] = []
  for (let i = 0; i < params.horizonJaren; i++) {
    const aflJaar = aflResult.nettoVoordeelPerJaar[i] ?? 0
    const belJaar = belResult.nettoVoordeelPerJaar[i] ?? 0
    jaarlijkseVergelijking.push({
      jaar: i + 1,
      aflossen: Math.round(aflJaar),
      beleggen: Math.round(belJaar),
      verschil: Math.round(belJaar - aflJaar),
    })
  }

  // FIRE-impact
  const fireImpactMaanden = computeFireImpact(params)

  // Aanbeveling
  const DREMPEL = 100 // €100 verschil = praktisch gelijk
  let aanbeveling: 'aflossen' | 'beleggen' | 'gelijk'
  if (verschil > DREMPEL) aanbeveling = 'beleggen'
  else if (verschil < -DREMPEL) aanbeveling = 'aflossen'
  else aanbeveling = 'gelijk'

  return {
    aflossing,
    beleggen,
    verschil: Math.round(verschil),
    breakevenRendement: Math.round(breakevenRendement * 10000) / 10000, // 4 decimalen
    jaarlijkseVergelijking,
    fireImpactMaanden,
    aanbeveling,
  }
}
