import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import { runHorizonLedger } from '@/lib/horizon-engine'
import type { HousingStrategyConfig } from '@/lib/housing-strategy'

// Regressie voor ADR 0015: downsize in v2 = huis als niet-liquide asset in het
// grootboek + liquidatie-event op de trigger (i.p.v. huis filteren + verkoop als
// inkomen). Borgt de drie bevindingen uit de Fase B-meting:
//  #2 netto vermogen blijft continu (geen sprong); liquiditeit verspringt;
//  #3 de woningwaarde groeit zichtbaar in het grootboek tot de verkoop.

const ASSETS: Asset[] = (
  [
    ['huis', 'Woning', 'eigen_huis', 385000, 385000, 3.5, null],
    ['bel', 'Beleggen', 'investment', 42000, null, 7, null],
    ['cash', 'Spaar', 'cash', 18000, null, 0, null],
    ['auto', 'Auto', 'vehicle', 8000, null, 0, 12],
  ] as const
).map(([id, name, t, v, woz, r, dep]) => ({ id, name, asset_type: t, current_value: v, woz_value: woz, expected_return: r, is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: dep }) as unknown as Asset)

const DEBTS: Debt[] = [
  { id: 'hyp', name: 'Hypotheek', debt_type: 'mortgage', current_balance: 300000, interest_rate: 2.9, monthly_payment: 1100, repayment_type: 'annuiteit', is_tax_deductible: true, linked_asset_id: 'huis', end_date: null, net_worth_inclusion_pct: 100, include_aflossing_in_savings: false, is_active: true } as unknown as Debt,
]

const HOUSING: HousingStrategyConfig = { mode: 'downsize', trigger: 'fixed_age', triggerAge: 67, salePricePct: 1, salesCostsPct: 0.04, newMonthlyHousingCost: null, depletionThresholdYears: 0 } as unknown as HousingStrategyConfig

function build(v2: boolean) {
  return buildHorizonInput({
    horizonInput: { monthlyContributions: 1500, yearlyMustExpenses: 30000, dateOfBirth: '1981-07-08', monthlyIncome: 5000 } as never,
    lifeEvents: [],
    fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    grossReturn: 0.07,
    inflation: 0.02,
    assets: ASSETS,
    debts: DEBTS,
    box3Method: 'forfaitair',
    hasPartner: true,
    housingStrategy: HOUSING,
    horizonEngineV2: v2,
  })
}

describe('horizon v2 housing-liquidatie (ADR 0015)', () => {
  it('v2: huis blijft in de input + assetLiquidations op de trigger', () => {
    const built = build(true)!
    expect(built.input.assets.some((a) => a.asset_type === 'eigen_huis')).toBe(true)
    expect(built.input.assetLiquidations?.length).toBe(1)
    expect(built.input.assetLiquidations![0].assetId).toBe('huis')
    expect(built.input.assetLiquidations![0].age).toBe(67)
    expect(built.input.assetLiquidations![0].payoffDebtIds).toContain('hyp')
  })

  it('v1: huis gefilterd, geen assetLiquidations (ongewijzigd model)', () => {
    const built = build(false)!
    expect(built.input.assets.some((a) => a.asset_type === 'eigen_huis')).toBe(false)
    expect(built.input.assetLiquidations).toBeUndefined()
  })

  it('v2: woningwaarde groeit zichtbaar tot de verkoop, dan €0', () => {
    const built = build(true)!
    const r = runHorizonLedger(built.input)
    const huis = (age: number) => r.rows.find((x) => x.leeftijd === age)?.assets.find((a) => a.type === 'eigen_huis')?.eind ?? 0
    expect(huis(60)).toBeGreaterThan(huis(50)) // groeit in de opbouw
    expect(huis(66)).toBeGreaterThan(385000) // geprojecteerd boven startwaarde
    expect(huis(67)).toBeLessThan(1) // verkocht op de trigger
    expect(huis(70)).toBeLessThan(1)
  })

  it('v2: netto vermogen blijft CONTINU bij verkoop (geen sprong), liquide verspringt OMHOOG', () => {
    const built = build(true)!
    const r = runHorizonLedger(built.input)
    const row = (age: number) => r.rows.find((x) => x.leeftijd === age)!
    const pre = row(66)
    const post = row(67)
    // Netto vermogen: hooguit een kleine dip (verkoopkosten + jaar-uitgaven),
    // NIET de oude sprong omhoog van het filter-model. Verschil < 15% van pre.
    const nettoSprong = Math.abs(post.nettoVermogen - pre.nettoVermogen)
    expect(nettoSprong).toBeLessThan(pre.nettoVermogen * 0.15)
    // Liquide verspringt fors omhoog door de netto-opbrengst.
    expect(post.liquideVermogen).toBeGreaterThan(pre.liquideVermogen * 1.3)
  })

  it('v2: verkoopkosten verlagen het netto vermogen (geen waarde uit het niets)', () => {
    const built = build(true)!
    const r = runHorizonLedger(built.input)
    const pre = r.rows.find((x) => x.leeftijd === 66)!
    const post = r.rows.find((x) => x.leeftijd === 67)!
    // Verkoop verhoogt netto vermogen NOOIT (filter-model deed dat wel).
    expect(post.nettoVermogen).toBeLessThanOrEqual(pre.nettoVermogen)
  })
})
