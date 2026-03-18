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

// ── Types ────────────────────────────────────────────────────

export interface HealthPillar {
  id: string
  name: string
  score: number        // 0–100
  weight: number       // 0–1 (e.g. 0.25)
  explanation: string  // what this pillar measures
  improvementTip: string
  rawValue: string     // human-readable current value
}

export interface HealthScore {
  total: number        // 0–100 weighted average
  label: string        // Uitstekend / Sterk / Redelijk / Kwetsbaar / Kritiek
  pillars: HealthPillar[]
  previousMonth: number | null  // total score for previous month (null if insufficient data)
  trend: number        // delta vs previous month (positive = improving)
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

// ── Label ────────────────────────────────────────────────────

function getLabel(score: number): string {
  if (score >= 80) return 'Uitstekend'
  if (score >= 60) return 'Sterk'
  if (score >= 40) return 'Redelijk'
  if (score >= 20) return 'Kwetsbaar'
  return 'Kritiek'
}

// ── Main computation ─────────────────────────────────────────

export function computeHealthScore(data: DashboardData): HealthScore {
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

  const pillars: HealthPillar[] = [
    {
      id: 'savings_rate',
      name: 'Spaarquote',
      score: savingsRateScore,
      weight: 0.25,
      explanation: 'Hoeveel procent van je inkomen spaar je? (6-maands gemiddelde)',
      improvementTip: data.savingsRate6m < 10
        ? 'Begin met 10% van je inkomen automatisch opzij te zetten.'
        : data.savingsRate6m < 20
        ? 'Bekijk je abonnementen en vaste lasten — kleine besparingen tellen snel op.'
        : data.savingsRate6m < 30
        ? 'Je bent op de goede weg! Verhoog bij elke loonsverhoging je spaarpercentage.'
        : 'Uitstekende spaarquote — blijf dit volhouden.',
      rawValue: `${Math.round(data.savingsRate6m)}%`,
    },
    {
      id: 'debt_ratio',
      name: 'Schuldratio',
      score: debtRatioScore,
      weight: 0.20,
      explanation: 'Verhouding tussen je schulden en je totale vermogen.',
      improvementTip: debtRatio > 50
        ? 'Focus op de duurste schuld eerst (avalanche-methode) om sneller schuldenvrij te worden.'
        : debtRatio > 20
        ? 'Overweeg extra aflossingen op je duurste lening.'
        : debtRatio > 0
        ? 'Je schuldenlast is beheersbaar. Overweeg herfinanciering voor betere rente.'
        : 'Schuldenvrij — uitstekend!',
      rawValue: `${debtRatio}%`,
    },
    {
      id: 'emergency_fund',
      name: 'Noodfonds',
      score: emergencyScore,
      weight: 0.15,
      explanation: 'Hoeveel maanden kun je rondkomen van je noodfonds?',
      improvementTip: data.emergencyFund.monthsCovered < 1
        ? 'Start met een doel van 1 maand buffer — automatiseer een vaste storting.'
        : data.emergencyFund.monthsCovered < 3
        ? 'Bouw naar 3 maanden — zet onverwachte meevallers direct opzij.'
        : data.emergencyFund.monthsCovered < 6
        ? 'Bijna op het ideaal van 6 maanden. Elke extra maand geeft meer rust.'
        : 'Noodfonds compleet — financiële rust als vangnet.',
      rawValue: `${data.emergencyFund.monthsCovered.toFixed(1)} mnd`,
    },
    {
      id: 'fire_progress',
      name: 'FIRE-voortgang',
      score: fireScore,
      weight: 0.20,
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
      rawValue: `${Math.round(data.freedomPct)}%`,
    },
    {
      id: 'diversification',
      name: 'Diversificatie',
      score: diversificationScore,
      weight: 0.10,
      explanation: 'Spreiding over verschillende vermogenstypes (cash, aandelen, vastgoed, etc.).',
      improvementTip: data.assetsByType.length <= 1
        ? 'Spreid je vermogen — overweeg naast cash ook een indexfonds.'
        : data.assetsByType.length <= 2
        ? 'Voeg een derde vermogenstype toe, bijvoorbeeld vastgoed of obligaties.'
        : data.assetsByType.length <= 3
        ? 'Goede basis — overweeg crypto of fysiek bezit als extra spreiding.'
        : 'Goed gespreid — monitor je allocatie periodiek.',
      rawValue: `${data.assetsByType.length} types`,
    },
    {
      id: 'budget_discipline',
      name: 'Budgetdiscipline',
      score: budgetScore,
      weight: 0.10,
      explanation: 'Hoeveel van je budgetcategorieën blijven binnen de limiet?',
      improvementTip: budgetTotal === 0
        ? 'Stel budgetten in voor je belangrijkste uitgavencategorieën.'
        : budgetWithin < budgetTotal
        ? 'Er zijn budgetten overschreden — bekijk de kassabon voor details.'
        : 'Alle budgetten binnen de limiet — goed gedisciplineerd!',
      rawValue: budgetTotal > 0 ? `${budgetWithin}/${budgetTotal}` : 'Geen budget',
    },
  ]

  // Weighted total
  const total = Math.round(
    pillars.reduce((sum, p) => sum + p.score * p.weight, 0)
  )

  // Previous month estimate from history
  let previousMonth: number | null = null
  let trend = 0
  if (data.netWorthHistory.length >= 2) {
    // Approximate: re-score with last month's data (rough, using net worth delta as proxy)
    const prevNetWorth = data.netWorthHistory[data.netWorthHistory.length - 2]?.value ?? data.netWorth
    const prevSavingsRate = data.savingsHistory.length >= 2
      ? data.savingsHistory[data.savingsHistory.length - 2]?.value ?? data.savingsRate6m
      : data.savingsRate6m

    // Recalculate pillar scores with previous month data
    const prevSavingsScore = scoreSavingsRate(prevSavingsRate)
    const prevDebtScore = scoreDebtRatio(
      prevNetWorth + data.totalDebts,  // rough: prev assets ≈ prevNetWorth + current debts
      data.totalDebts
    )
    const prevEmergency = emergencyScore  // stable month-to-month
    const prevFire = scoreFireProgress(
      data.fireTarget > 0 ? (prevNetWorth / data.fireTarget) * 100 : data.freedomPct
    )
    const prevDiv = diversificationScore  // stable
    const prevBudget = budgetScore  // no historical data available

    previousMonth = Math.round(
      prevSavingsScore * 0.25 +
      prevDebtScore * 0.20 +
      prevEmergency * 0.15 +
      prevFire * 0.20 +
      prevDiv * 0.10 +
      prevBudget * 0.10
    )
    trend = total - previousMonth
  }

  return {
    total,
    label: getLabel(total),
    pillars,
    previousMonth,
    trend,
  }
}
