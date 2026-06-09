/**
 * Deterministic Stress Test Engine voor fase-analyse.
 *
 * Simuleert de impact van marktcrashes, langdurige inflatie, langer leven,
 * en eenmalig vermogensverlies op een UnifiedProjectionRow[] reeks.
 *
 * Pure functions, geen Supabase dependency.
 */

import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import { formatCurrency } from '@/lib/format'

// ── Scenario Types ──────────────────────────────────────────────────────────

export type StressScenarioType =
  | 'market_crash'
  | 'prolonged_inflation'
  | 'longer_life'
  | 'wealth_loss'
  | 'combined_crisis'

export interface StressScenario {
  type: StressScenarioType
  label: string
  description: string
  /** Jaar-offset in de fase wanneer het scenario wordt geactiveerd */
  triggerYearOffset?: number
  /** Duur in jaren voor langdurige scenario's */
  durationYears?: number
  /**
   * Magnitude — betekenis hangt af van type:
   * - market_crash: rendement-override (bijv. -0.30 = -30%)
   * - prolonged_inflation: inflatie percentage (bijv. 0.05 = 5%)
   * - longer_life: extra jaren (bijv. 10)
   * - wealth_loss: euro-bedrag (bijv. -50000)
   */
  magnitude: number
}

// ── Preset Scenario's ───────────────────────────────────────────────────────

export const PRESET_STRESS_SCENARIOS: StressScenario[] = [
  {
    type: 'market_crash',
    label: 'Marktcrash (−30%)',
    description: 'Een crash van 30% in jaar 2 van deze fase',
    triggerYearOffset: 2,
    magnitude: -0.30,
  },
  {
    type: 'prolonged_inflation',
    label: 'Langdurige inflatie (5%)',
    description: '10 jaar met 5% inflatie i.p.v. 2%',
    durationYears: 10,
    magnitude: 0.05,
  },
  {
    type: 'longer_life',
    label: 'Langer leven (+10 jaar)',
    description: 'Wat als je 10 jaar langer leeft dan gepland?',
    magnitude: 10,
  },
  {
    type: 'wealth_loss',
    label: 'Vermogensverlies (€50.000)',
    description: 'Eenmalig verlies door scheiding of onverwachte kosten',
    triggerYearOffset: 1,
    magnitude: -50_000,
  },
  {
    type: 'combined_crisis',
    label: 'Gecombineerde crisis',
    description: 'Crash van 30% in jaar 2, plus 5% inflatie gedurende 5 jaar',
    triggerYearOffset: 2,
    durationYears: 5,
    magnitude: -0.30, // crash magnitude; inflatie is hardcoded op 0.05
  },
]

// ── Result Types ────────────────────────────────────────────────────────────

export interface StressTestResult {
  scenario: StressScenario
  /** Eindvermogen onder dit stressscenario */
  endPortfolio: number
  /** Eindvermogen in de basisprojectie (ter vergelijking) */
  baseEndPortfolio: number
  /** Delta: stress - basis */
  endPortfolioDelta: number
  /** Of het vermogen de gehele fase overleeft (blijft >= 0) */
  survives: boolean
  /** Leeftijd waarop vermogen opraakt (null als het overleeft) */
  depletionAge: number | null
  /** Samenvatting voor UI-weergave */
  impactSummary: string
  /**
   * Veerkracht (0–1): het aandeel van je verwachte basis-eindvermogen dat ná
   * deze ene deterministische schok overblijft. 0 = je vermogen raakt op vóór
   * het einde van de fase. Dit is GEEN kansverdeling/Monte-Carlo-waarschijnlijkheid.
   */
  estimatedSuccessRate: number
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Bereken de effectieve Box 3 drag rate uit een projectierij.
 * Leidt de rate af uit totalBox3 / startNetWorth als proxy.
 * Geeft 0 terug als startNetWorth <= 0 om deling door nul te voorkomen.
 */
function deriveBox3DragRate(row: UnifiedProjectionRow): number {
  if (row.startNetWorth <= 0) return 0
  return Math.abs(row.totalBox3) / row.startNetWorth
}

/**
 * Bouw een vereenvoudigd forward-cascade model vanuit een startpositie.
 * Retourneert de netWorth-reeks na het toepassen van jaarlijks rendement,
 * besparingen, onttrekkingen, cashflows en Box 3 drag.
 */
function forwardCascade(
  startNetWorth: number,
  years: number,
  params: {
    expectedReturn: number
    box3DragRate: number
    /** Jaarlijkse besparingen (uit basisrijen waar beschikbaar) */
    getSavings: (yearIndex: number) => number
    /** Jaarlijkse onttrekking (uit basisrijen waar beschikbaar) */
    getWithdrawal: (yearIndex: number) => number
    /** Netto cashflow per jaar (uit basisrijen waar beschikbaar) */
    getCashflowNet: (yearIndex: number) => number
    /** Extra inflatie-gecorrigeerde uitgavenverhoging per jaar */
    getInflationDelta: (yearIndex: number) => number
  },
): { netWorthByYear: number[]; depletionYearIndex: number | null } {
  const netWorthByYear: number[] = []
  let nw = startNetWorth
  let depletionYearIndex: number | null = null

  for (let y = 0; y < years; y++) {
    const growth = nw * (params.expectedReturn - params.box3DragRate)
    const savings = params.getSavings(y)
    const withdrawal = params.getWithdrawal(y)
    const cashflowNet = params.getCashflowNet(y)
    const inflationDelta = params.getInflationDelta(y)

    nw = nw + growth + savings - withdrawal + cashflowNet - inflationDelta

    if (depletionYearIndex === null && nw < 0) {
      depletionYearIndex = y
    }

    netWorthByYear.push(nw)
  }

  return { netWorthByYear, depletionYearIndex }
}

// ── Market Crash ────────────────────────────────────────────────────────────

function applyMarketCrash(
  baseRows: UnifiedProjectionRow[],
  scenario: StressScenario,
  params: { expectedReturn: number },
): { endPortfolio: number; survives: boolean; depletionAge: number | null } {
  if (baseRows.length === 0) {
    return { endPortfolio: 0, survives: true, depletionAge: null }
  }

  const triggerOffset = scenario.triggerYearOffset ?? 3
  const triggerIndex = Math.min(triggerOffset, baseRows.length - 1)

  // Gebruik de gemiddelde Box 3 drag rate uit de basisrijen
  const avgBox3DragRate = baseRows.reduce((sum, r) => sum + deriveBox3DragRate(r), 0) / baseRows.length

  // Vermogen vlak voor de crash
  const preCrashNw = triggerIndex > 0
    ? baseRows[triggerIndex - 1].netWorth
    : baseRows[0].startNetWorth

  // Pas crash toe: magnitude is negatief (bijv. -0.30 = -30% van vermogen)
  const crashLoss = preCrashNw * Math.abs(scenario.magnitude)
  const postCrashNw = preCrashNw - crashLoss

  // Forward-cascade vanaf het crash-punt
  const remainingYears = baseRows.length - triggerIndex
  const { netWorthByYear, depletionYearIndex } = forwardCascade(
    postCrashNw,
    remainingYears,
    {
      expectedReturn: params.expectedReturn,
      box3DragRate: avgBox3DragRate,
      getSavings: (y) => baseRows[triggerIndex + y]?.savings ?? 0,
      getWithdrawal: (y) => baseRows[triggerIndex + y]?.withdrawal ?? 0,
      getCashflowNet: (y) => baseRows[triggerIndex + y]?.cashflowNet ?? 0,
      getInflationDelta: () => 0,
    },
  )

  const endPortfolio = netWorthByYear.length > 0
    ? netWorthByYear[netWorthByYear.length - 1]
    : postCrashNw

  const depletionAge = depletionYearIndex !== null
    ? baseRows[triggerIndex + depletionYearIndex].age
    : null

  return {
    endPortfolio: Math.round(endPortfolio),
    survives: depletionYearIndex === null,
    depletionAge,
  }
}

// ── Prolonged Inflation ─────────────────────────────────────────────────────

function applyProlongedInflation(
  baseRows: UnifiedProjectionRow[],
  scenario: StressScenario,
  params: { expectedReturn: number; inflationRate: number },
): { endPortfolio: number; survives: boolean; depletionAge: number | null } {
  if (baseRows.length === 0) {
    return { endPortfolio: 0, survives: true, depletionAge: null }
  }

  const durationYears = scenario.durationYears ?? 10
  const stressInflation = scenario.magnitude // bijv. 0.05
  const baseInflation = params.inflationRate  // bijv. 0.02
  const inflationDelta = stressInflation - baseInflation

  const avgBox3DragRate = baseRows.reduce((sum, r) => sum + deriveBox3DragRate(r), 0) / baseRows.length
  const startNw = baseRows[0].startNetWorth

  // Hogere inflatie verhoogt de onttrekkingen: de extra inflatie werkt door
  // als cumulatief stijgende kosten bovenop de basisonttrekking.
  const { netWorthByYear, depletionYearIndex } = forwardCascade(
    startNw,
    baseRows.length,
    {
      expectedReturn: params.expectedReturn,
      box3DragRate: avgBox3DragRate,
      getSavings: (y) => baseRows[y]?.savings ?? 0,
      getWithdrawal: (y) => baseRows[y]?.withdrawal ?? 0,
      getCashflowNet: (y) => baseRows[y]?.cashflowNet ?? 0,
      getInflationDelta: (y) => {
        if (y >= durationYears) return 0
        // Cumulatieve extra kosten door hogere inflatie op de onttrekking
        const baseWithdrawal = baseRows[y]?.withdrawal ?? 0
        return baseWithdrawal * inflationDelta * (y + 1)
      },
    },
  )

  const endPortfolio = netWorthByYear.length > 0
    ? netWorthByYear[netWorthByYear.length - 1]
    : startNw

  const depletionAge = depletionYearIndex !== null
    ? baseRows[depletionYearIndex].age
    : null

  return {
    endPortfolio: Math.round(endPortfolio),
    survives: depletionYearIndex === null,
    depletionAge,
  }
}

// ── Longer Life ─────────────────────────────────────────────────────────────

function applyLongerLife(
  baseRows: UnifiedProjectionRow[],
  scenario: StressScenario,
  params: { expectedReturn: number; inflationRate: number; yearlyExpenses: number },
): { endPortfolio: number; survives: boolean; depletionAge: number | null } {
  if (baseRows.length === 0) {
    return { endPortfolio: 0, survives: true, depletionAge: null }
  }

  const extraYears = Math.round(scenario.magnitude)
  const lastRow = baseRows[baseRows.length - 1]
  const startNw = lastRow.netWorth
  const avgBox3DragRate = baseRows.reduce((sum, r) => sum + deriveBox3DragRate(r), 0) / baseRows.length

  // Projecteer de extra jaren voort op basis van het patroon uit de laatste rij.
  // Onttrekking groeit jaarlijks mee met inflatie.
  const lastWithdrawal = lastRow.withdrawal > 0
    ? lastRow.withdrawal
    : params.yearlyExpenses * lastRow.inflationFactor

  const { netWorthByYear, depletionYearIndex } = forwardCascade(
    startNw,
    extraYears,
    {
      expectedReturn: params.expectedReturn,
      box3DragRate: avgBox3DragRate,
      getSavings: () => 0, // Na pensioen geen besparingen meer
      getWithdrawal: (y) => {
        // Onttrekking groeit mee met inflatie t.o.v. de laatste basisrij
        return lastWithdrawal * Math.pow(1 + params.inflationRate, y + 1)
      },
      getCashflowNet: () => lastRow.cashflowNet,
      getInflationDelta: () => 0,
    },
  )

  const endPortfolio = netWorthByYear.length > 0
    ? netWorthByYear[netWorthByYear.length - 1]
    : startNw

  // Depletie-leeftijd is relatief t.o.v. de laatste basisrij-leeftijd
  const depletionAge = depletionYearIndex !== null
    ? lastRow.age + depletionYearIndex + 1
    : null

  return {
    endPortfolio: Math.round(endPortfolio),
    survives: depletionYearIndex === null,
    depletionAge,
  }
}

// ── Wealth Loss ─────────────────────────────────────────────────────────────

function applyWealthLoss(
  baseRows: UnifiedProjectionRow[],
  scenario: StressScenario,
  params: { expectedReturn: number },
): { endPortfolio: number; survives: boolean; depletionAge: number | null } {
  if (baseRows.length === 0) {
    return { endPortfolio: 0, survives: true, depletionAge: null }
  }

  const triggerOffset = scenario.triggerYearOffset ?? 1
  const triggerIndex = Math.min(triggerOffset, baseRows.length - 1)

  const avgBox3DragRate = baseRows.reduce((sum, r) => sum + deriveBox3DragRate(r), 0) / baseRows.length

  // Vermogen vlak voor het verlies
  const preLossNw = triggerIndex > 0
    ? baseRows[triggerIndex - 1].netWorth
    : baseRows[0].startNetWorth

  // Magnitude is negatief (bijv. -50000), dus aftrekken van vermogen
  const postLossNw = preLossNw + scenario.magnitude // magnitude < 0

  const remainingYears = baseRows.length - triggerIndex
  const { netWorthByYear, depletionYearIndex } = forwardCascade(
    postLossNw,
    remainingYears,
    {
      expectedReturn: params.expectedReturn,
      box3DragRate: avgBox3DragRate,
      getSavings: (y) => baseRows[triggerIndex + y]?.savings ?? 0,
      getWithdrawal: (y) => baseRows[triggerIndex + y]?.withdrawal ?? 0,
      getCashflowNet: (y) => baseRows[triggerIndex + y]?.cashflowNet ?? 0,
      getInflationDelta: () => 0,
    },
  )

  const endPortfolio = netWorthByYear.length > 0
    ? netWorthByYear[netWorthByYear.length - 1]
    : postLossNw

  const depletionAge = depletionYearIndex !== null
    ? baseRows[triggerIndex + depletionYearIndex].age
    : null

  return {
    endPortfolio: Math.round(endPortfolio),
    survives: depletionYearIndex === null,
    depletionAge,
  }
}

// ── Combined Crisis (Crash + Inflation) ────────────────────────────────────

function applyCombinedCrisis(
  baseRows: UnifiedProjectionRow[],
  scenario: StressScenario,
  params: { expectedReturn: number; inflationRate: number },
): { endPortfolio: number; survives: boolean; depletionAge: number | null } {
  if (baseRows.length === 0) {
    return { endPortfolio: 0, survives: true, depletionAge: null }
  }

  const triggerOffset = scenario.triggerYearOffset ?? 2
  const triggerIndex = Math.min(triggerOffset, baseRows.length - 1)
  const durationYears = scenario.durationYears ?? 5
  const crashMagnitude = Math.abs(scenario.magnitude) // e.g. 0.30
  const stressInflation = 0.05 // 5% inflatie tijdens crisis
  const inflationDelta = stressInflation - params.inflationRate

  const avgBox3DragRate = baseRows.reduce((sum, r) => sum + deriveBox3DragRate(r), 0) / baseRows.length

  // Vermogen vlak voor de crash
  const preCrashNw = triggerIndex > 0
    ? baseRows[triggerIndex - 1].netWorth
    : baseRows[0].startNetWorth

  // Pas crash toe
  const postCrashNw = preCrashNw * (1 - crashMagnitude)

  // Forward-cascade met crash + inflatie-schok
  const remainingYears = baseRows.length - triggerIndex
  const { netWorthByYear, depletionYearIndex } = forwardCascade(
    postCrashNw,
    remainingYears,
    {
      expectedReturn: params.expectedReturn,
      box3DragRate: avgBox3DragRate,
      getSavings: (y) => baseRows[triggerIndex + y]?.savings ?? 0,
      getWithdrawal: (y) => baseRows[triggerIndex + y]?.withdrawal ?? 0,
      getCashflowNet: (y) => baseRows[triggerIndex + y]?.cashflowNet ?? 0,
      getInflationDelta: (y) => {
        // Inflatieschok geldt alleen gedurende durationYears na de crash
        if (y >= durationYears) return 0
        const baseWithdrawal = baseRows[triggerIndex + y]?.withdrawal ?? 0
        return baseWithdrawal * inflationDelta * (y + 1)
      },
    },
  )

  const endPortfolio = netWorthByYear.length > 0
    ? netWorthByYear[netWorthByYear.length - 1]
    : postCrashNw

  const depletionAge = depletionYearIndex !== null
    ? baseRows[triggerIndex + depletionYearIndex].age
    : null

  return {
    endPortfolio: Math.round(endPortfolio),
    survives: depletionYearIndex === null,
    depletionAge,
  }
}

// ── Impact Summary Generators ───────────────────────────────────────────────

function generateImpactSummary(
  scenario: StressScenario,
  endPortfolio: number,
  delta: number,
): string {
  const absDelta = Math.abs(delta)

  switch (scenario.type) {
    case 'market_crash':
      return `Vermogen daalt met ${formatCurrency(absDelta)} door crash, eindsaldo ${formatCurrency(absDelta)} lager`

    case 'prolonged_inflation':
      return `Hoge inflatie kost ${formatCurrency(absDelta)} extra, eindsaldo ${formatCurrency(absDelta)} lager`

    case 'longer_life':
      if (endPortfolio >= 0) {
        return `Bij ${Math.round(scenario.magnitude)} jaar langer leven resteert ${formatCurrency(endPortfolio)}`
      }
      return `Bij ${Math.round(scenario.magnitude)} jaar langer leven tekort ${formatCurrency(Math.abs(endPortfolio))}`

    case 'wealth_loss':
      return `Eenmalig verlies verlaagt eindsaldo met ${formatCurrency(absDelta)}`

    case 'combined_crisis':
      return `Crash + hoge inflatie kost ${formatCurrency(absDelta)}, eindsaldo ${formatCurrency(absDelta)} lager`

    default:
      return `Impact: ${formatCurrency(absDelta)}`
  }
}

// ── Main: applyStressScenario ───────────────────────────────────────────────

/**
 * Pas een enkel stressscenario toe op een reeks projectierijen.
 *
 * Kloont de data en berekent het verschil in eindvermogen, overlevingskans,
 * en depletie-leeftijd ten opzichte van de basisprojectie.
 */
export function applyStressScenario(
  baseRows: UnifiedProjectionRow[],
  scenario: StressScenario,
  params: {
    expectedReturn: number   // bijv. 0.07
    inflationRate: number    // bijv. 0.02
    yearlyExpenses: number   // voor longer_life extensie
  },
): StressTestResult {
  // Basisgeval: eindvermogen is netWorth van de laatste rij
  const baseEndPortfolio = baseRows.length > 0
    ? baseRows[baseRows.length - 1].netWorth
    : 0

  // Pas het scenario toe op basis van type
  let result: { endPortfolio: number; survives: boolean; depletionAge: number | null }

  switch (scenario.type) {
    case 'market_crash':
      result = applyMarketCrash(baseRows, scenario, params)
      break
    case 'prolonged_inflation':
      result = applyProlongedInflation(baseRows, scenario, params)
      break
    case 'longer_life':
      result = applyLongerLife(baseRows, scenario, params)
      break
    case 'wealth_loss':
      result = applyWealthLoss(baseRows, scenario, params)
      break
    case 'combined_crisis':
      result = applyCombinedCrisis(baseRows, scenario, params)
      break
    default: {
      // Onbekend scenario — geen impact
      result = { endPortfolio: baseEndPortfolio, survives: true, depletionAge: null }
    }
  }

  const delta = result.endPortfolio - baseEndPortfolio
  const impactSummary = generateImpactSummary(scenario, result.endPortfolio, delta)

  // Veerkracht (0–1): aandeel van het verwachte eindvermogen dat ná de schok
  // overblijft. Deterministisch — geen kans/waarschijnlijkheid.
  let estimatedSuccessRate: number
  if (!result.survives) {
    estimatedSuccessRate = 0
  } else if (baseEndPortfolio > 0) {
    estimatedSuccessRate = Math.max(0, 1 - Math.abs(delta) / baseEndPortfolio)
  } else {
    // Basisgeval al op nul — stress maakt het niet erger qua percentage
    estimatedSuccessRate = result.endPortfolio >= 0 ? 1 : 0
  }

  return {
    scenario,
    endPortfolio: result.endPortfolio,
    baseEndPortfolio: Math.round(baseEndPortfolio),
    endPortfolioDelta: Math.round(delta),
    survives: result.survives,
    depletionAge: result.depletionAge,
    impactSummary,
    estimatedSuccessRate: Math.round(estimatedSuccessRate * 100) / 100,
  }
}

// ── Batch: runPhaseStressTests ──────────────────────────────────────────────

/**
 * Voer alle preset stressscenario's (plus optionele custom scenario's) uit
 * op een reeks projectierijen. Retourneert een resultaat per scenario.
 */
export function runPhaseStressTests(
  baseRows: UnifiedProjectionRow[],
  params: {
    expectedReturn: number
    inflationRate: number
    yearlyExpenses: number
    customScenarios?: StressScenario[]
  },
): StressTestResult[] {
  const scenarios = [
    ...PRESET_STRESS_SCENARIOS,
    ...(params.customScenarios ?? []),
  ]

  return scenarios.map((scenario) =>
    applyStressScenario(baseRows, scenario, params),
  )
}
