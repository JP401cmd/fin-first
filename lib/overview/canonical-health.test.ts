import { describe, it, expect } from 'vitest'
import { withCanonicalHealthScore } from './canonical-health'
import {
  computeHealthScoreFromInputs,
  computeHealthScoreWithTrend,
  type HealthScore,
  type HealthScoreInput,
} from '@/lib/financial-health'

/**
 * Regressie voor de gezondheidscijfer-drift: de GezondheidScoreWidget toonde een
 * ANDER cijfer dan de /overzicht-hero, omdat de widget-bundel de score
 * onafhankelijk (en altijd persoonlijk) herberekende i.p.v. de canonieke,
 * perspectief-correcte horizon-score te consumeren.
 *
 * Twee garanties samen borgen "widget-cijfer == hero-cijfer":
 *  1. `withCanonicalHealthScore` laat de bundel de canonieke score consumeren.
 *  2. `computeHealthScoreWithTrend(...).total === computeHealthScoreFromInputs(...).total`
 *     — de trend-variant (die de hero + widget nu delen) verandert het getal
 *     nooit, dus zelfs een surface dat de trendloze variant zou gebruiken blijft
 *     gelijk.
 */

function mkScore(total: number): HealthScore {
  return {
    total,
    label: 'Redelijk',
    pillars: [],
    previousMonth: null,
    trend: 0,
    activePillarCount: 6,
    budgetingActive: true,
  }
}

describe('withCanonicalHealthScore — consume, don\'t recompute', () => {
  it('vervangt de bundel-score door de canonieke (perspectief-correcte) score', () => {
    const bundle = { healthScore: mkScore(55), freedomPct: 40 }
    const result = withCanonicalHealthScore(bundle, mkScore(62))
    expect(result.healthScore.total).toBe(62)
    // Overige bundelvelden blijven onaangeroerd.
    expect(result.freedomPct).toBe(40)
  })

  it('laat de bundel ongemoeid wanneer de canonieke score ontbreekt (horizon-load-fout)', () => {
    const bundle = { healthScore: mkScore(55) }
    expect(withCanonicalHealthScore(bundle, null).healthScore.total).toBe(55)
  })
})

describe('computeHealthScoreWithTrend — trend verandert het cijfer niet', () => {
  const input: HealthScoreInput = {
    savingsRate6m: 18,
    totalAssets: 120_000,
    totalDebts: 30_000,
    emergencyFundMonths: 4,
    emergencyTargetMonths: 6,
    freedomPct: 42,
    netMonthlyIncome: 4_000,
    debtMonthlyPayments: 600,
    largestAssetTypeShare: 0.55,
    budgetCategories: [
      { limit: 500, spent: 450 },
      { limit: 300, spent: 350 },
    ],
  }

  it('total + label + pijler-scores zijn identiek aan computeHealthScoreFromInputs', () => {
    const base = computeHealthScoreFromInputs(input, true)
    const withTrend = computeHealthScoreWithTrend(input, true, {
      prevNetWorth: 80_000,
      prevSavingsRate: 15,
      requiredPortfolio: 500_000,
    })
    expect(withTrend.total).toBe(base.total)
    expect(withTrend.label).toBe(base.label)
    expect(withTrend.pillars.map((p) => [p.id, p.score])).toEqual(
      base.pillars.map((p) => [p.id, p.score]),
    )
    // De trend is een afgeleide BOVENOP hetzelfde getal (niet een tweede som).
    expect(withTrend.previousMonth).not.toBeNull()
  })

  it('zonder bruikbare historie valt het terug op previousMonth=null, zelfde total', () => {
    const base = computeHealthScoreFromInputs(input, true)
    const withTrend = computeHealthScoreWithTrend(input, true, {
      prevNetWorth: null,
      prevSavingsRate: null,
      requiredPortfolio: null,
    })
    expect(withTrend.total).toBe(base.total)
    expect(withTrend.previousMonth).toBeNull()
  })
})
