import { describe, it, expect } from 'vitest'
import { withCanonicalOverviewFigures } from './canonical-health'
import { resolveEmergencyFundFromRows, toEmergencyFundDisplay } from '@/lib/emergency-fund'
import { computeEmergencyFundMonths } from '@/lib/health-score-input'
import {
  computeHealthScoreFromInputs,
  computeHealthScoreWithTrend,
  type HealthScore,
  type HealthScoreInput,
} from '@/lib/financial-health'

/**
 * Regressie voor de /overzicht-drift: de widget-rail toonde ANDERE cijfers dan
 * de hero en de kassabon erboven, omdat de widget-bundel gezondheidsscore,
 * vrijheids-% en noodfonds onafhankelijk (en altijd persoonlijk) herberekende
 * i.p.v. de canonieke, perspectief-correcte horizon-waarden te consumeren.
 * Bevinding H4: "compleet, 4,6 × salaris" naast "vraagt aandacht", en
 * "kritiek 11%" naast "24,2%" — binnen één scroll.
 *
 * Drie garanties samen borgen "widget-cijfer == hero-cijfer":
 *  1. `withCanonicalOverviewFigures` laat de bundel álle drie de canonieke
 *     waarden consumeren (niet alleen de score — dát was het gat).
 *  2. `computeHealthScoreWithTrend(...).total === computeHealthScoreFromInputs(...).total`
 *     — de trend-variant (die de hero + widget nu delen) verandert het getal
 *     nooit, dus zelfs een surface dat de trendloze variant zou gebruiken blijft
 *     gelijk.
 *  3. De noodfonds-bundel en de `emergency_fund`-pijler delen één kern, dus
 *     gelijke rijen ⇒ gelijke dekking (geen tweede liquide pot).
 *
 * TOLERANTIE — bewust EXACT (`toBe`/`toEqual`) op de doorgeef-testen: dit zijn
 * identiteiten tussen twee representaties van hetzelfde getal, geen geschaalde
 * vergelijking. Waar afronding meespeelt (dekking in maanden) toetsen we op
 * dezelfde afgeronde weergave-waarde, niet op een marge.
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

const BUNDLE_EMERGENCY = {
  currentAmount: 9_000,
  targetAmount: 12_000,
  monthsCovered: 2.3,
  targetMonths: 3,
  isComplete: false,
  runwayMonths: 3.1,
  source: 'salary' as const,
}
const CANONICAL_EMERGENCY = {
  currentAmount: 18_400,
  targetAmount: 12_000,
  monthsCovered: 4.6,
  targetMonths: 3,
  isComplete: true,
  runwayMonths: 6.2,
  source: 'salary' as const,
}

describe('withCanonicalOverviewFigures — consume, don\'t recompute', () => {
  const bundle = {
    healthScore: mkScore(55),
    freedomPct: 24.2,
    emergencyFund: BUNDLE_EMERGENCY,
    monthlyExpenses: 2_950,
  }

  it('vervangt score, vrijheids-% én noodfonds door de canonieke waarden', () => {
    const result = withCanonicalOverviewFigures(bundle, {
      healthScore: mkScore(62),
      freedomPct: 11,
      emergencyFund: CANONICAL_EMERGENCY,
    })
    expect(result.healthScore.total).toBe(62)
    // H4 punt 2: de FIRE-widget las 24,2% terwijl de modal 11% toonde.
    expect(result.freedomPct).toBe(11)
    // H4 punt 1: de briefing/noodfonds-widget las een ándere dekking dan de modal.
    expect(result.emergencyFund).toEqual(CANONICAL_EMERGENCY)
    // Overige bundelvelden blijven onaangeroerd.
    expect(result.monthlyExpenses).toBe(2_950)
  })

  it('laat de bundel volledig ongemoeid wanneer de canonieke bundel ontbreekt (horizon-load-fout)', () => {
    const result = withCanonicalOverviewFigures(bundle, null)
    expect(result.healthScore.total).toBe(55)
    expect(result.freedomPct).toBe(24.2)
    expect(result.emergencyFund).toEqual(BUNDLE_EMERGENCY)
  })
})

describe('noodfonds — pijler en bundel delen één kern (H4 punt 1)', () => {
  // Deel-getelde spaarrekening (inclusion 50%) + niet-gekoppelde bankrekening:
  // precies het geval waarin twee onafhankelijke potten uiteenlopen.
  const ASSETS = [
    { asset_type: 'savings', current_value: '20000', net_worth_inclusion_pct: 50 },
    { asset_type: 'checking', current_value: 2_500, net_worth_inclusion_pct: null },
    { asset_type: 'eigen_huis', current_value: 400_000 },
  ]
  const UNLINKED_CASH = 1_500
  const SALARY = 3_000
  const AVG_EXPENSES = 2_400

  it('de dekking van de bundel is exact de dekking van de score-pijler', () => {
    const resolved = resolveEmergencyFundFromRows(ASSETS, UNLINKED_CASH, SALARY, AVG_EXPENSES)
    const pillarMonths = computeEmergencyFundMonths(ASSETS, UNLINKED_CASH, SALARY, AVG_EXPENSES)
    expect(resolved.monthsCovered).toBe(pillarMonths)
    // Liquide pot = 20.000 × 50% + 2.500 + 1.500 = 14.000; huis telt niet mee.
    expect(resolved.currentAmount).toBe(14_000)
    expect(resolved.monthsCovered).toBeCloseTo(14_000 / SALARY, 10)
  })

  it('de weergave-afronding is één conventie (geen tweede Math.round)', () => {
    const display = toEmergencyFundDisplay(
      resolveEmergencyFundFromRows(ASSETS, UNLINKED_CASH, SALARY, AVG_EXPENSES),
    )
    expect(display.monthsCovered).toBe(4.7)
    expect(display.targetMonths).toBe(3)
    expect(display.isComplete).toBe(true)
    expect(display.source).toBe('salary')
    // Runway loopt op de uitgaven-noemer, dekking op het salaris — twee
    // grondslagen die bewust naast elkaar staan (zie lib/emergency-fund.ts).
    expect(display.runwayMonths).toBe(Math.round((14_000 / AVG_EXPENSES) * 10) / 10)
  })

  it('zonder salaris valt de norm terug op 6 × uitgaven, óók in de bundel', () => {
    const resolved = resolveEmergencyFundFromRows(ASSETS, UNLINKED_CASH, 0, AVG_EXPENSES)
    expect(resolved.source).toBe('expenses')
    expect(resolved.targetMonths).toBe(6)
    expect(resolved.monthsCovered).toBe(computeEmergencyFundMonths(ASSETS, UNLINKED_CASH, 0, AVG_EXPENSES))
  })

  it('zonder salaris én zonder uitgaven degenereert het niet naar Infinity/NaN', () => {
    const display = toEmergencyFundDisplay(resolveEmergencyFundFromRows([], 0, 0, 0))
    expect(display.currentAmount).toBe(0)
    expect(display.monthsCovered).toBe(0)
    expect(display.runwayMonths).toBe(0)
    expect(display.isComplete).toBe(false)
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
