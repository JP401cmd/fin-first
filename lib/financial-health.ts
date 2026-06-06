/**
 * Financial Health Score — 6-pillar weighted score (0–100)
 *
 * Replaces the old veerkracht_score (4-pillar resilience score).
 * Broader coverage: savings behaviour, debt management, emergency buffer,
 * FIRE progress, portfolio diversification, and budget discipline.
 *
 * Pillar weights:
 *   1. Spaarquote        25%
 *   2. Schuldratio        20%
 *   3. Noodfonds-dekking  15%
 *   4. FIRE-voortgang     20%
 *   5. Portefeuille-diversificatie 10%
 *   6. Budget-discipline  10%
 */

import type { DashboardData } from '@/components/widgets/widget-renderer'
import type { ModuleId } from '@/lib/module-registry'

// ── Lightweight input for server-side / snapshot usage ───────
// Allows computing the health score without a full DashboardData bundle.

export interface HealthScoreInput {
  savingsRate6m: number
  totalAssets: number
  totalDebts: number
  emergencyFundMonths: number
  freedomPct: number
  assetTypeCount: number
  /** Budget categories with limit/spent; empty array if no budgets */
  budgetCategories: { limit: number; spent: number }[]
  /** Box 3 tax-context voor tax_optimization-pillar. Optioneel; null → neutral score 50. */
  taxData?: {
    box3Bezittingen: number       // spaargeld + beleggingen
    box3Tax: number               // jaarlijkse Box 3-heffing
    heffingsvrijVermogen: number  // vrijstelling single/partner
    rendementsgrondslag: number   // belastbare grondslag na vrijstelling
  } | null
}

// ── Types ────────────────────────────────────────────────────

export interface HealthPillar {
  id: string
  name: string
  score: number        // 0–100
  weight: number       // 0–1 (e.g. 0.25)
  explanation: string  // what this pillar measures
  improvementTip: string
  /** Link to the page where the user can act on this tip */
  actionHref: string
  /** Short CTA label for the action link (e.g. "Budget instellen") */
  actionLabel: string
  rawValue: string     // human-readable current value
}

export interface HealthScore {
  total: number        // 0–100 weighted average
  label: string        // Uitstekend / Sterk / Redelijk / Kwetsbaar / Kritiek
  pillars: HealthPillar[]
  previousMonth: number | null  // total score for previous month (null if insufficient data)
  trend: number        // delta vs previous month (positive = improving)
  /** Number of active pillars (5 when budget excluded, 6 when included) */
  activePillarCount: number
  /** Whether budget discipline is included in the score */
  budgetingActive: boolean
}

// ── Pillar action mapping ────────────────────────────────────
// Elke pijler krijgt een verb-first "doe"-CTA (geen passief "X bekijken")
// die de gebruiker van inzicht → naar de hefboom-pagina brengt waar de
// daad plaatsvindt. Sluit aan op de vrijheids-loop (zie tips-lijst).

const PILLAR_ACTION: Record<string, { href: string; label: string }> = {
  savings_rate:      { href: '/overzicht/cashflow',    label: 'Verhoog je spaarquote' },
  debt_ratio:        { href: '/overzicht/schulden',    label: 'Versnel je aflossing' },
  emergency_fund:    { href: '/overzicht/bezittingen', label: 'Bouw je noodfonds' },
  fire_progress:     { href: '/toekomst',              label: 'Versnel je vrijheid' },
  diversification:   { href: '/overzicht/bezittingen', label: 'Spreid je vermogen' },
  budget_discipline: { href: '/overzicht/cashflow',    label: 'Stel je budget bij' },
  tax_optimization:  { href: '/overzicht/belasting',   label: 'Optimaliseer je belasting' },
}

// ── Score curves ─────────────────────────────────────────────

/** Spaarquote: 30%+ = 100, 20% = 80, 10% = 50, 0% = 0 */
function scoreSavingsRate(ratePercent: number): number {
  if (ratePercent <= 0) return 0
  if (ratePercent >= 30) return 100
  // Piecewise linear: 0→0, 10→50, 20→80, 30→100
  if (ratePercent <= 10) return Math.round((ratePercent / 10) * 50)
  if (ratePercent <= 20) return Math.round(50 + ((ratePercent - 10) / 10) * 30)
  return Math.round(80 + ((ratePercent - 20) / 10) * 20)
}

/** Schuldratio: debt-to-asset ratio. 0% = 100, 50% = 50, 100%+ = 0 */
function scoreDebtRatio(totalAssets: number, totalDebts: number): number {
  if (totalAssets <= 0) return totalDebts > 0 ? 0 : 50 // no assets no debts = neutral
  const ratio = totalDebts / totalAssets
  if (ratio <= 0) return 100
  if (ratio >= 1) return 0
  return Math.round((1 - ratio) * 100)
}

/** Noodfonds-dekking: months of expenses covered. 6+ = 100 */
function scoreEmergencyFund(monthsCovered: number): number {
  if (monthsCovered <= 0) return 0
  if (monthsCovered >= 6) return 100
  // Linear 0→0, 3→60, 6→100
  if (monthsCovered <= 3) return Math.round((monthsCovered / 3) * 60)
  return Math.round(60 + ((monthsCovered - 3) / 3) * 40)
}

/** FIRE-voortgang: freedomPct (0–100+). Already 0-100 scale, cap at 100. */
function scoreFireProgress(freedomPct: number): number {
  return Math.max(0, Math.min(Math.round(freedomPct), 100))
}

/** Portefeuille-diversificatie: number of distinct asset types.
 *  1 type = 20, 2 = 40, 3 = 60, 4 = 80, 5+ = 100 */
function scoreDiversification(assetTypeCount: number): number {
  if (assetTypeCount <= 0) return 0
  if (assetTypeCount >= 5) return 100
  return Math.round((assetTypeCount / 5) * 100)
}

/** Budget-discipline: % of budget categories within their limit.
 *  100% within = 100, 50% = 50, etc. */
function scoreBudgetDiscipline(budgetTotals: DashboardData['budgetTotals']): number {
  // Count categories that have a budget limit set
  const categories = [
    budgetTotals.expense,
    budgetTotals.savings,
    budgetTotals.debt,
  ].filter(c => c.limit > 0)

  if (categories.length === 0) return 70 // no budgets set = neutral-ish

  const withinBudget = categories.filter(c => c.spent <= c.limit).length
  return Math.round((withinBudget / categories.length) * 100)
}

/**
 * Tax-optimalisatie-score (Box 3-context).
 * Hybride benadering (zie deep-dive agent-plan):
 *  - Geen Box 3-bezit (<€1.000) → neutraal 50 (geen optimalisatie nodig)
 *  - Anders: blend van vrijstellingsbenutting (40%) + tax-drag (40%) +
 *    allocatie-hygiene (20%, voor nu = 100 want geen partner-optimalisatie-
 *    data in de input)
 *
 * Vrijstellingsbenutting: hoe goed wordt heffingsvrij vermogen benut?
 * Tax-drag: belasting als % van bezittingen (lager = beter).
 */
function scoreTaxOptimization(
  taxData?: HealthScoreInput['taxData'],
): number {
  if (!taxData || taxData.box3Bezittingen < 1_000) return 50

  // Vrijstellingsbenutting: rendementsgrondslag / heffingsvrijVermogen.
  // Onder 80% → punten naar rato; boven 80% → 100.
  const vrijstellingPct = taxData.heffingsvrijVermogen > 0
    ? Math.min(1, taxData.rendementsgrondslag / taxData.heffingsvrijVermogen)
    : 0
  const vrijstellingScore = vrijstellingPct >= 0.8 ? 100 : Math.round(vrijstellingPct * 125)

  // Tax-drag: tax / bezittingen. <0.5% = 100, >2% = 0, lineair tussen.
  const drag = taxData.box3Bezittingen > 0 ? taxData.box3Tax / taxData.box3Bezittingen : 0
  const dragScore = drag <= 0.005
    ? 100
    : drag >= 0.02
    ? 0
    : Math.round((1 - (drag - 0.005) / 0.015) * 100)

  // Allocatie-hygiene: placeholder (geen partner-allocation-data nu beschikbaar).
  const allocScore = 100

  return Math.round(vrijstellingScore * 0.4 + dragScore * 0.4 + allocScore * 0.2)
}

// ── Label ────────────────────────────────────────────────────

function getLabel(score: number): string {
  if (score >= 80) return 'Uitstekend'
  if (score >= 60) return 'Sterk'
  if (score >= 40) return 'Redelijk'
  if (score >= 20) return 'Kwetsbaar'
  return 'Kritiek'
}

// ── Weight redistribution ────────────────────────────────────

/**
 * Base weights voor 7 pillars. Sum > 1.0 wordt automatisch herverdeeld
 * door getRedistributedWeightForSet() — active pillars worden propor-
 * tioneel geschaald. Voor alle 7 actief: tax krijgt ~9.1%, savings ~22.7%, etc.
 */
const BASE_WEIGHTS: Record<string, number> = {
  savings_rate: 0.25,
  debt_ratio: 0.20,
  emergency_fund: 0.15,
  fire_progress: 0.20,
  diversification: 0.10,
  budget_discipline: 0.10,
  tax_optimization: 0.10,
}

/**
 * Maps health score pillars to the module that must be active for them to be included.
 * Pillars mapped to `null` are always computed (foundation data, no module required).
 */
const PILLAR_MODULE_REQUIREMENTS: Record<string, ModuleId | null> = {
  savings_rate: 'budgetteren',
  debt_ratio: 'vermogensregistratie',
  emergency_fund: null,          // Always available — core financial health indicator
  fire_progress: 'toekomstplannen',
  diversification: 'vermogensregistratie',
  budget_discipline: 'budgetteren',
  tax_optimization: 'vermogensregistratie',
}

/**
 * Determine which pillar IDs are active given a set of active modules.
 * Pillars with `null` requirement are always included.
 * When no `activeModules` array is provided, all pillars are included.
 */
function getActivePillarIds(activeModules?: ModuleId[]): Set<string> {
  if (!activeModules) {
    // Backward-compat: all pillars active
    return new Set(Object.keys(PILLAR_MODULE_REQUIREMENTS))
  }
  const active = new Set<string>()
  for (const [pillarId, requiredModule] of Object.entries(PILLAR_MODULE_REQUIREMENTS)) {
    if (requiredModule === null || activeModules.includes(requiredModule)) {
      active.add(pillarId)
    }
  }
  return active
}

/**
 * Compute redistributed weight for a pillar given the set of active pillar IDs.
 * Active pillar weights are scaled proportionally so they sum to 1.0.
 * Returns 0 for pillars not in the active set.
 */
function getRedistributedWeightForSet(pillarId: string, activePillarIds: Set<string>): number {
  if (!activePillarIds.has(pillarId)) return 0
  const totalActiveWeight = Array.from(activePillarIds).reduce(
    (sum, id) => sum + (BASE_WEIGHTS[id] ?? 0),
    0,
  )
  if (totalActiveWeight === 0) return 0
  return (BASE_WEIGHTS[pillarId] ?? 0) / totalActiveWeight
}

/**
 * @deprecated Use `getRedistributedWeightForSet` with an explicit active-pillar set.
 * Kept only to support the legacy `budgetingActive` boolean path when `activeModules`
 * is not provided. Replicates the old 5-vs-6 pillar behaviour exactly.
 */
function getRedistributedWeight(pillarId: string, includeBudget: boolean): number {
  // The legacy 5-pillar set excludes only budget_discipline; all other pillars stay.
  const legacyActiveSet = includeBudget
    ? new Set(Object.keys(BASE_WEIGHTS))
    : new Set(Object.keys(BASE_WEIGHTS).filter(id => id !== 'budget_discipline'))
  return getRedistributedWeightForSet(pillarId, legacyActiveSet)
}

// ── Main computation ─────────────────────────────────────────

/**
 * Compute health score from DashboardData.
 *
 * @param data - Full dashboard data bundle
 * @param budgetingActive - Whether the user has active budgeting. Kept for
 *   backward compatibility; ignored when `activeModules` is provided.
 * @param activeModules - Optional list of active module IDs. When provided,
 *   only pillars whose required module is in this list (or always-on pillars)
 *   are included, and weights are redistributed proportionally to sum to 1.0.
 *   When omitted, all pillars are included (full backward compat).
 */
export function computeHealthScore(
  data: DashboardData,
  budgetingActive = true,
  activeModules?: ModuleId[],
): HealthScore {
  const savingsRateScore = scoreSavingsRate(data.savingsRate6m)
  const debtRatioScore = scoreDebtRatio(data.totalAssets, data.totalDebts)
  const emergencyScore = scoreEmergencyFund(data.emergencyFund.monthsCovered)
  const fireScore = scoreFireProgress(data.freedomPct)
  const diversificationScore = scoreDiversification(data.assetsByType.length)
  const budgetScore = scoreBudgetDiscipline(data.budgetTotals)

  // Debt ratio raw value
  const debtRatio = data.totalAssets > 0
    ? Math.round((data.totalDebts / data.totalAssets) * 100)
    : (data.totalDebts > 0 ? 100 : 0)

  // Budget discipline raw
  const budgetCategories = [
    data.budgetTotals.expense,
    data.budgetTotals.savings,
    data.budgetTotals.debt,
  ].filter(c => c.limit > 0)
  const budgetWithin = budgetCategories.filter(c => c.spent <= c.limit).length
  const budgetTotal = budgetCategories.length

  // Determine which pillars to include.
  // When activeModules is provided: use module-aware filtering.
  // When not provided: fall back to the legacy budgetingActive boolean path
  // (all 6 pillars vs. 5 pillars with budget_discipline excluded) so existing
  // callers that pass only budgetingActive continue to work identically.
  const activePillarSet: Set<string> = activeModules !== undefined
    ? getActivePillarIds(activeModules)
    : new Set(budgetingActive
        ? Object.keys(BASE_WEIGHTS)
        : Object.keys(BASE_WEIGHTS).filter(id => id !== 'budget_discipline'))
  // budgetingActive derived from the resolved pillar set (for HealthScore.budgetingActive field)
  const resolvedBudgetingActive = activePillarSet.has('budget_discipline')

  const allPillars: HealthPillar[] = [
    {
      id: 'savings_rate',
      name: 'Spaarquote',
      score: savingsRateScore,
      weight: getRedistributedWeightForSet('savings_rate', activePillarSet),
      explanation: 'Hoeveel procent van je inkomen spaar je? (6-maands gemiddelde)',
      improvementTip: data.savingsRate6m < 10
        ? 'Begin met 10% van je inkomen automatisch opzij te zetten.'
        : data.savingsRate6m < 20
        ? 'Bekijk je abonnementen en vaste lasten — kleine besparingen tellen snel op.'
        : data.savingsRate6m < 30
        ? 'Je bent op de goede weg! Verhoog bij elke loonsverhoging je spaarpercentage.'
        : 'Uitstekende spaarquote — blijf dit volhouden.',
      actionHref: PILLAR_ACTION.savings_rate.href,
      actionLabel: PILLAR_ACTION.savings_rate.label,
      rawValue: `${Math.round(data.savingsRate6m)}%`,
    },
    {
      id: 'debt_ratio',
      name: 'Schuldratio',
      score: debtRatioScore,
      weight: getRedistributedWeightForSet('debt_ratio', activePillarSet),
      explanation: 'Verhouding tussen je schulden en je totale vermogen.',
      improvementTip: debtRatio > 50
        ? 'Focus op de duurste schuld eerst (avalanche-methode) om sneller schuldenvrij te worden.'
        : debtRatio > 20
        ? 'Overweeg extra aflossingen op je duurste lening.'
        : debtRatio > 0
        ? 'Je schuldenlast is beheersbaar. Overweeg herfinanciering voor betere rente.'
        : 'Schuldenvrij — uitstekend!',
      actionHref: PILLAR_ACTION.debt_ratio.href,
      actionLabel: PILLAR_ACTION.debt_ratio.label,
      rawValue: `${debtRatio}%`,
    },
    {
      id: 'emergency_fund',
      name: 'Noodfonds',
      score: emergencyScore,
      weight: getRedistributedWeightForSet('emergency_fund', activePillarSet),
      explanation: 'Hoeveel maanden kun je rondkomen van je noodfonds?',
      improvementTip: data.emergencyFund.monthsCovered < 1
        ? 'Start met een doel van 1 maand buffer — automatiseer een vaste storting.'
        : data.emergencyFund.monthsCovered < 3
        ? 'Bouw naar 3 maanden — zet onverwachte meevallers direct opzij.'
        : data.emergencyFund.monthsCovered < 6
        ? 'Bijna op het ideaal van 6 maanden. Elke extra maand geeft meer rust.'
        : 'Noodfonds compleet — financiële rust als vangnet.',
      actionHref: PILLAR_ACTION.emergency_fund.href,
      actionLabel: PILLAR_ACTION.emergency_fund.label,
      rawValue: `${data.emergencyFund.monthsCovered.toFixed(1)} mnd`,
    },
    {
      id: 'fire_progress',
      name: 'FIRE-voortgang',
      score: fireScore,
      weight: getRedistributedWeightForSet('fire_progress', activePillarSet),
      explanation: 'Hoever ben je op weg naar financiële vrijheid?',
      improvementTip: data.freedomPct < 10
        ? 'Begin klein — elke euro opgebouwd vermogen brengt je dichter bij vrijheid.'
        : data.freedomPct < 25
        ? 'Verhoog je maandelijkse inleg in beleggingen voor versneld vermogensopbouw.'
        : data.freedomPct < 50
        ? 'Je bent halverwege! Overweeg je spaarquote te optimaliseren.'
        : data.freedomPct < 75
        ? 'Sterk op weg — de compound interest werkt steeds harder voor je.'
        : data.freedomPct < 100
        ? 'Bijna vrij! Focus op het volhouden van je strategie.'
        : 'FIRE bereikt — geniet van je financiële vrijheid!',
      actionHref: PILLAR_ACTION.fire_progress.href,
      actionLabel: PILLAR_ACTION.fire_progress.label,
      rawValue: `${Math.round(data.freedomPct)}%`,
    },
    {
      id: 'diversification',
      name: 'Diversificatie',
      score: diversificationScore,
      weight: getRedistributedWeightForSet('diversification', activePillarSet),
      explanation: 'Spreiding over verschillende vermogenstypes (cash, aandelen, vastgoed, etc.).',
      improvementTip: data.assetsByType.length <= 1
        ? 'Spreid je vermogen — overweeg naast cash ook een indexfonds.'
        : data.assetsByType.length <= 2
        ? 'Voeg een derde vermogenstype toe, bijvoorbeeld vastgoed of obligaties.'
        : data.assetsByType.length <= 3
        ? 'Goede basis — overweeg crypto of fysiek bezit als extra spreiding.'
        : 'Goed gespreid — monitor je allocatie periodiek.',
      actionHref: PILLAR_ACTION.diversification.href,
      actionLabel: PILLAR_ACTION.diversification.label,
      rawValue: `${data.assetsByType.length} types`,
    },
    {
      id: 'budget_discipline',
      name: 'Budgetdiscipline',
      score: budgetScore,
      weight: getRedistributedWeightForSet('budget_discipline', activePillarSet),
      explanation: 'Hoeveel van je budgetcategorieën blijven binnen de limiet?',
      improvementTip: budgetTotal === 0
        ? 'Stel budgetten in voor je belangrijkste uitgavencategorieën.'
        : budgetWithin < budgetTotal
        ? 'Er zijn budgetten overschreden — bekijk de kassabon voor details.'
        : 'Alle budgetten binnen de limiet — goed gedisciplineerd!',
      actionHref: PILLAR_ACTION.budget_discipline.href,
      actionLabel: PILLAR_ACTION.budget_discipline.label,
      rawValue: budgetTotal > 0 ? `${budgetWithin}/${budgetTotal}` : 'Geen budget',
    },
    {
      id: 'tax_optimization',
      name: 'Belasting-optimalisatie',
      // DashboardData heeft geen taxData; pillar krijgt neutrale 50.
      // computeHealthScoreFromInputs() levert wel taxData wanneer beschikbaar.
      score: 50,
      weight: getRedistributedWeightForSet('tax_optimization', activePillarSet),
      explanation: 'Hoe slim is je vermogen verdeeld over Box 1, 2 en 3?',
      improvementTip: 'Bekijk je Box 3-positie — vrijstelling, partner-allocatie en heffingsmethode bepalen je jaarlijkse belasting.',
      actionHref: PILLAR_ACTION.tax_optimization.href,
      actionLabel: PILLAR_ACTION.tax_optimization.label,
      rawValue: 'Geen Box 3-data',
    },
  ]

  // Retain only active pillars (weight === 0 means the pillar was excluded)
  const pillars = allPillars.filter(p => activePillarSet.has(p.id))

  // Weighted total
  const total = Math.round(
    pillars.reduce((sum, p) => sum + p.score * p.weight, 0)
  )

  // Previous month estimate from history
  let previousMonth: number | null = null
  let trend = 0
  if (data.netWorthHistory.length >= 2) {
    const prevNetWorth = data.netWorthHistory[data.netWorthHistory.length - 2]?.value ?? data.netWorth
    const prevSavingsRate = data.savingsHistory.length >= 2
      ? data.savingsHistory[data.savingsHistory.length - 2]?.value ?? data.savingsRate6m
      : data.savingsRate6m

    const prevSavingsScore = scoreSavingsRate(prevSavingsRate)
    const prevDebtScore = scoreDebtRatio(
      prevNetWorth + data.totalDebts,
      data.totalDebts
    )
    const prevEmergency = emergencyScore
    const prevFire = scoreFireProgress(
      data.fireTarget > 0 ? (prevNetWorth / data.fireTarget) * 100 : data.freedomPct
    )
    const prevDiv = diversificationScore
    const prevBudget = budgetScore

    // Compute previous month score using the same active-pillar set and redistributed weights
    const prevScores: Record<string, number> = {
      savings_rate: prevSavingsScore,
      debt_ratio: prevDebtScore,
      emergency_fund: prevEmergency,
      fire_progress: prevFire,
      diversification: prevDiv,
      budget_discipline: prevBudget,
      // tax_optimization: geen historie beschikbaar in DashboardData → proxy
      // op huidige score (50 want geen taxData hier). Voorkomt trend-discontinuïteit.
      tax_optimization: 50,
    }
    previousMonth = Math.round(
      Array.from(activePillarSet).reduce(
        (sum, id) => sum + (prevScores[id] ?? 0) * getRedistributedWeightForSet(id, activePillarSet),
        0,
      )
    )
    trend = total - previousMonth
  }

  return {
    total,
    label: getLabel(total),
    pillars,
    previousMonth,
    trend,
    activePillarCount: pillars.length,
    budgetingActive: resolvedBudgetingActive,
  }
}

// ── Server-side / snapshot-compatible computation ────────────
// Uses lightweight HealthScoreInput instead of full DashboardData.
// Returns only { total, label, pillars } — no trend (no history available).

/**
 * Compute health score from lightweight inputs (server-side / snapshot context).
 *
 * @param input - Lightweight health score inputs
 * @param budgetingActive - Whether the user has active budgeting. Kept for
 *   backward compatibility; ignored when `activeModules` is provided.
 * @param activeModules - Optional list of active module IDs. When provided,
 *   only pillars whose required module is active (or always-on pillars) are
 *   included, and weights are redistributed proportionally to sum to 1.0.
 *   When omitted, all pillars are included (full backward compat).
 */
export function computeHealthScoreFromInputs(
  input: HealthScoreInput,
  budgetingActive = true,
  activeModules?: ModuleId[],
): HealthScore {
  const savingsRateScore = scoreSavingsRate(input.savingsRate6m)
  const debtRatioScore = scoreDebtRatio(input.totalAssets, input.totalDebts)
  const emergencyScore = scoreEmergencyFund(input.emergencyFundMonths)
  const fireScore = scoreFireProgress(input.freedomPct)
  const diversificationScore = scoreDiversification(input.assetTypeCount)
  const taxScore = scoreTaxOptimization(input.taxData)

  // Budget discipline from raw categories
  const budgetCats = input.budgetCategories.filter(c => c.limit > 0)
  const budgetWithin = budgetCats.filter(c => c.spent <= c.limit).length
  const budgetTotal = budgetCats.length
  const budgetScore = budgetTotal === 0 ? 70 : Math.round((budgetWithin / budgetTotal) * 100)

  const debtRatio = input.totalAssets > 0
    ? Math.round((input.totalDebts / input.totalAssets) * 100)
    : (input.totalDebts > 0 ? 100 : 0)

  // Determine which pillars to include.
  // When activeModules is provided: use module-aware filtering.
  // When not provided: fall back to the legacy budgetingActive boolean path
  // (all 6 pillars vs. 5 pillars with budget_discipline excluded) so existing
  // callers that pass only budgetingActive continue to work identically.
  const activePillarSet: Set<string> = activeModules !== undefined
    ? getActivePillarIds(activeModules)
    : new Set(budgetingActive
        ? Object.keys(BASE_WEIGHTS)
        : Object.keys(BASE_WEIGHTS).filter(id => id !== 'budget_discipline'))
  const resolvedBudgetingActive = activePillarSet.has('budget_discipline')

  const allPillars: HealthPillar[] = [
    {
      id: 'savings_rate',
      name: 'Spaarquote',
      score: savingsRateScore,
      weight: getRedistributedWeightForSet('savings_rate', activePillarSet),
      explanation: 'Hoeveel procent van je inkomen spaar je? (6-maands gemiddelde)',
      improvementTip: input.savingsRate6m < 10
        ? 'Begin met 10% van je inkomen automatisch opzij te zetten.'
        : input.savingsRate6m < 20
        ? 'Bekijk je abonnementen en vaste lasten — kleine besparingen tellen snel op.'
        : input.savingsRate6m < 30
        ? 'Je bent op de goede weg! Verhoog bij elke loonsverhoging je spaarpercentage.'
        : 'Uitstekende spaarquote — blijf dit volhouden.',
      actionHref: PILLAR_ACTION.savings_rate.href,
      actionLabel: PILLAR_ACTION.savings_rate.label,
      rawValue: `${Math.round(input.savingsRate6m)}%`,
    },
    {
      id: 'debt_ratio',
      name: 'Schuldratio',
      score: debtRatioScore,
      weight: getRedistributedWeightForSet('debt_ratio', activePillarSet),
      explanation: 'Verhouding tussen je schulden en je totale vermogen.',
      improvementTip: debtRatio > 50
        ? 'Focus op de duurste schuld eerst (avalanche-methode) om sneller schuldenvrij te worden.'
        : debtRatio > 20
        ? 'Overweeg extra aflossingen op je duurste lening.'
        : debtRatio > 0
        ? 'Je schuldenlast is beheersbaar. Overweeg herfinanciering voor betere rente.'
        : 'Schuldenvrij — uitstekend!',
      actionHref: PILLAR_ACTION.debt_ratio.href,
      actionLabel: PILLAR_ACTION.debt_ratio.label,
      rawValue: `${debtRatio}%`,
    },
    {
      id: 'emergency_fund',
      name: 'Noodfonds',
      score: emergencyScore,
      weight: getRedistributedWeightForSet('emergency_fund', activePillarSet),
      explanation: 'Hoeveel maanden kun je rondkomen van je noodfonds?',
      improvementTip: input.emergencyFundMonths < 1
        ? 'Start met een doel van 1 maand buffer — automatiseer een vaste storting.'
        : input.emergencyFundMonths < 3
        ? 'Bouw naar 3 maanden — zet onverwachte meevallers direct opzij.'
        : input.emergencyFundMonths < 6
        ? 'Bijna op het ideaal van 6 maanden. Elke extra maand geeft meer rust.'
        : 'Noodfonds compleet — financiële rust als vangnet.',
      actionHref: PILLAR_ACTION.emergency_fund.href,
      actionLabel: PILLAR_ACTION.emergency_fund.label,
      rawValue: `${input.emergencyFundMonths.toFixed(1)} mnd`,
    },
    {
      id: 'fire_progress',
      name: 'FIRE-voortgang',
      score: fireScore,
      weight: getRedistributedWeightForSet('fire_progress', activePillarSet),
      explanation: 'Hoever ben je op weg naar financiële vrijheid?',
      improvementTip: input.freedomPct < 10
        ? 'Begin klein — elke euro opgebouwd vermogen brengt je dichter bij vrijheid.'
        : input.freedomPct < 25
        ? 'Verhoog je maandelijkse inleg in beleggingen voor versneld vermogensopbouw.'
        : input.freedomPct < 50
        ? 'Je bent halverwege! Overweeg je spaarquote te optimaliseren.'
        : input.freedomPct < 75
        ? 'Sterk op weg — de compound interest werkt steeds harder voor je.'
        : input.freedomPct < 100
        ? 'Bijna vrij! Focus op het volhouden van je strategie.'
        : 'FIRE bereikt — geniet van je financiële vrijheid!',
      actionHref: PILLAR_ACTION.fire_progress.href,
      actionLabel: PILLAR_ACTION.fire_progress.label,
      rawValue: `${Math.round(input.freedomPct)}%`,
    },
    {
      id: 'diversification',
      name: 'Diversificatie',
      score: diversificationScore,
      weight: getRedistributedWeightForSet('diversification', activePillarSet),
      explanation: 'Spreiding over verschillende vermogenstypes (cash, aandelen, vastgoed, etc.).',
      improvementTip: input.assetTypeCount <= 1
        ? 'Spreid je vermogen — overweeg naast cash ook een indexfonds.'
        : input.assetTypeCount <= 2
        ? 'Voeg een derde vermogenstype toe, bijvoorbeeld vastgoed of obligaties.'
        : input.assetTypeCount <= 3
        ? 'Goede basis — overweeg crypto of fysiek bezit als extra spreiding.'
        : 'Goed gespreid — monitor je allocatie periodiek.',
      actionHref: PILLAR_ACTION.diversification.href,
      actionLabel: PILLAR_ACTION.diversification.label,
      rawValue: `${input.assetTypeCount} types`,
    },
    {
      id: 'budget_discipline',
      name: 'Budgetdiscipline',
      score: budgetScore,
      weight: getRedistributedWeightForSet('budget_discipline', activePillarSet),
      explanation: 'Hoeveel van je budgetcategorieën blijven binnen de limiet?',
      improvementTip: budgetTotal === 0
        ? 'Stel budgetten in voor je belangrijkste uitgavencategorieën.'
        : budgetWithin < budgetTotal
        ? 'Er zijn budgetten overschreden — bekijk de kassabon voor details.'
        : 'Alle budgetten binnen de limiet — goed gedisciplineerd!',
      actionHref: PILLAR_ACTION.budget_discipline.href,
      actionLabel: PILLAR_ACTION.budget_discipline.label,
      rawValue: budgetTotal > 0 ? `${budgetWithin}/${budgetTotal}` : 'Geen budget',
    },
    {
      id: 'tax_optimization',
      name: 'Belasting-optimalisatie',
      score: taxScore,
      weight: getRedistributedWeightForSet('tax_optimization', activePillarSet),
      explanation: 'Hoe slim is je vermogen verdeeld over Box 1, 2 en 3?',
      improvementTip: !input.taxData || input.taxData.box3Bezittingen < 1_000
        ? 'Voeg Box 3-data toe om je belasting-optimalisatie te zien.'
        : taxScore >= 80
        ? 'Sterk benut — heffingsvrij en allocatie staan goed.'
        : taxScore >= 50
        ? 'Bekijk partner-allocatie of switch tussen forfaitair/werkelijk.'
        : 'Hoge tax-drag — kijk naar groene beleggingen of partner-verdeling.',
      actionHref: PILLAR_ACTION.tax_optimization.href,
      actionLabel: PILLAR_ACTION.tax_optimization.label,
      rawValue: !input.taxData || input.taxData.box3Bezittingen < 1_000
        ? 'Geen Box 3'
        : `€${Math.round(input.taxData.box3Tax)}/jaar`,
    },
  ]

  // Retain only active pillars
  const pillars = allPillars.filter(p => activePillarSet.has(p.id))

  const total = Math.round(
    pillars.reduce((sum, p) => sum + p.score * p.weight, 0)
  )

  return {
    total,
    label: getLabel(total),
    pillars,
    previousMonth: null,
    trend: 0,
    activePillarCount: pillars.length,
    budgetingActive: resolvedBudgetingActive,
  }
}

/** Get health label from a numeric score (for use with snapshot data) */
export function getHealthLabel(score: number): string {
  return getLabel(score)
}
