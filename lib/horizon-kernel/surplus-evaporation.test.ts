/**
 * Regressie — **toename-verdamping bij een lege surplus-doelpot** (kernel-extensie).
 *
 * Bug (bewezen op eigenaar-data): wanneer `pot_rules.surplus_group` naar een nog
 * LEGE bezit-categorie wijst (bv. een €0-beleggingspot) en Spaargeld daardoor op
 * `prioToename = 5` (reserve) staat, kwalificeert GEEN enkele categorie voor de
 * Toename-waterval (`somToename === 0`). De positieve extra-geld-begroting (CF!I —
 * zowel het maandoverschot als de eenmalige woningverkoop-opbrengst) wordt dan met
 * een all-nul gewichtsvector vermenigvuldigd en verdampt volledig uit het grootboek.
 *
 * Deze suite pint de fix vast op drie niveaus:
 *  1. tabel `computeToenameAfname` — de degenerate case (somToename==0, D>0) landt
 *     de volledige begroting D in potten (Σ toenameEur == D).
 *  2. engine + bridge — het maandoverschot landt in potten (Beleggingen groeit),
 *     de verkoopopbrengst verschijnt als liquide bucket i.p.v. te verdampen, en de
 *     stacked-bucketsom blijft gelijk aan netWorth.
 *  3. het verkoopmoment (on_depletion zonder fallbackAge) valt niet meer op de
 *     app-`triggerAge` (67) maar op de Excel-fallback (75).
 */

import { describe, it, expect } from 'vitest'
import { buildKernelInputFromAppWithNotices } from '@/lib/horizon-kernel/adapter'
import { solveFire } from '@/lib/horizon-kernel/solver'
import { computeToenameAfname } from '@/lib/horizon-kernel/tables/toename-afname'
import { kernelToUnifiedResult, buildKernelSlotMeta } from '@/lib/horizon-kernel/bridge'
import { deriveEigenHuisIds } from '@/lib/horizon-kernel/adapter/potten'
import { unifiedRowsToStackedRows } from '@/lib/wealth-composition'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'

// ── Synthetisch profiel à la de eigenaar (lege surplus-doelpot Beleggingen) ─────
const assets: Asset[] = [
  { id: 'a1', name: 'Betaalrekening', asset_type: 'cash', current_value: 15000, expected_return: 0, monthly_contribution: 0, is_active: true } as unknown as Asset,
  { id: 'a2', name: 'Spaarrekening', asset_type: 'savings', current_value: 40000, expected_return: 2.5, monthly_contribution: 0, is_active: true } as unknown as Asset,
  { id: 'a3', name: 'Mijn woning', asset_type: 'eigen_huis', current_value: 500000, expected_return: 3.5, monthly_contribution: 0, is_active: true } as unknown as Asset,
  { id: 'a4', name: 'Beleggingsrekening', asset_type: 'investment', current_value: 0, expected_return: 7, monthly_contribution: 0, is_active: true } as unknown as Asset,
]
const debts: Debt[] = [
  { id: 'd1', name: 'Studielening DUO', debt_type: 'student_loan', current_balance: 40000, interest_rate: 0, monthly_payment: 222.22, is_active: true } as unknown as Debt,
  { id: 'd2', name: 'krediet', debt_type: 'revolving_credit', current_balance: 1000, interest_rate: 10, monthly_payment: 8.33, is_active: true } as unknown as Debt,
  { id: 'd3', name: 'Hypotheek — Mijn woning', debt_type: 'mortgage', current_balance: 250000, interest_rate: 4, monthly_payment: 1193.54, is_active: true, linked_asset_id: 'a3' } as unknown as Debt,
]
const lifeEvents: LifeEvent[] = [
  { id: 'e1', event_type: 'aow', name: 'AOW', target_age: 69, one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: 1558, is_active: true, sort_order: 0, metadata: { leefsituatie: 'alleenstaand', jarenBuitenNL: 0 } } as unknown as LifeEvent,
]
const housingStrategy = {
  mode: 'downsize', trigger: 'on_depletion', triggerAge: 67,
  salePricePct: 1, salesCostsPct: 0.04, newMonthlyHousingCost: null, depletionThresholdYears: 0,
}
const adapterInput = {
  profile: {
    date_of_birth: '1980-01-01', net_monthly_income: 5000, estimated_monthly_expenses: 3500,
    yearly_essential_expenses: 42000, expected_return: 0.07, inflation_rate: 0.02,
    box3_method: 'forfaitair', marginaal_tarief: 0.495, fire_end_strategy: 'deplete',
    fire_end_age: 90, fire_legacy_amount: null, feature_preferences: { horizon_kernel_convergentie: true },
    withdrawal_strategy: 'static', guardrail_floor: 0.8, guardrail_ceiling: 1.2,
    guardrail_cut_step: 0.1, guardrail_raise_step: 0.1,
    housing_strategy_config: housingStrategy,
    pot_rules: {
      surplus_group: 'beleggingen',
      deficit_order_groups: ['spaargeld', 'beleggingen', 'overig', 'pensioen', 'vastgoed'],
      withdrawal_order_groups: ['spaargeld', 'beleggingen', 'overig', 'pensioen', 'vastgoed'],
    },
    retirement_expense_method: 'essential_budgets', retirement_custom_amount: null,
  },
  assets, debts, lifeEvents,
}

function buildInput() {
  return buildKernelInputFromAppWithNotices(adapterInput as never).input
}

describe('kernel · toename-verdamping bij lege surplus-doelpot', () => {
  it('reproduceert de degenerate TS-config (somToename-bron)', () => {
    const input = buildInput()
    const bez = input.ts.bezitCategorien
    const spaar = bez.find((c) => c.categorie === 'Spaargeld')!
    const beleg = bez.find((c) => c.categorie === 'Beleggingen')!
    // De exacte config die de bug triggert.
    expect(spaar.gevuld).toBe(true)
    expect(spaar.prioToename).toBe(5) // reserve → uit de normale toename-noemer
    expect(beleg.gevuld).toBe(false) // lege surplus-doelpot
    expect(beleg.prioToename).toBe(1) // surplus_group-doel
  })

  it('FIX 1 (tabel): positieve extra-geld-begroting D landt volledig in potten', () => {
    const input = buildInput()
    const D = 100000
    const row = computeToenameAfname(input, { totaalExtraGeld: D, afname: 0, onttrekking: 0 }, 12)
    if (row.beyondHorizon) throw new Error('onverwacht beyondHorizon')
    const bezitSom = row.bezit.reduce((s, c) => s + c.toenameEur, 0)
    const schuldSom = row.schuld.reduce((s, c) => s + c.toenameEur, 0)
    // Geen euro mag verdampen: Σ toenameEur == D (was 0 vóór de fix).
    expect(bezitSom + schuldSom).toBeCloseTo(D, 2)
    // Surplus-doel = Beleggingen (index 1 in ASSET_ORDER) vult zich (gebruikersintentie).
    expect(row.bezit[1].toenameEur).toBeGreaterThan(D * 0.99)
  })

  it('FIX 1 (tabel): negatieve/nul D blijft byte-identiek 0 (geen fallback)', () => {
    const input = buildInput()
    const neg = computeToenameAfname(input, { totaalExtraGeld: -500, afname: 0, onttrekking: 0 }, 12)
    if (neg.beyondHorizon) throw new Error('onverwacht beyondHorizon')
    // Deficit hoort NIET via de toename-fallback (dat is de onttrekking-orde) → alles 0.
    expect(neg.bezit.every((c) => c.toenameEur === 0)).toBe(true)
  })

  it('FIX 1 (engine+bridge): maandoverschot landt in Beleggingen tijdens accumulatie', () => {
    const input = buildInput()
    const solve = solveFire(input)
    const eigenHuisIds = deriveEigenHuisIds(assets)
    const meta = buildKernelSlotMeta(assets, debts, eigenHuisIds)
    const unified = kernelToUnifiedResult(solve, {
      input, yearlyExpenses: 42000,
      assetSlotMeta: meta.assetSlotMeta, debtSlotMeta: meta.debtSlotMeta,
    })
    const at60 = unified.rows.find((r) => r.age === 60)!
    const belegAt60 = at60.assetBuckets.investment?.endValue ?? 0
    // Vóór de fix bleef de €0-beleggingspot 0 (al het spaaroverschot verdampte).
    expect(belegAt60).toBeGreaterThan(200000)
  })

  it('FIX 1 (engine+bridge): verkoopopbrengst landt in liquide buckets i.p.v. te verdampen', () => {
    const input = buildInput()
    const solve = solveFire(input)
    const eigenHuisIds = deriveEigenHuisIds(assets)
    const meta = buildKernelSlotMeta(assets, debts, eigenHuisIds)
    const unified = kernelToUnifiedResult(solve, {
      input, yearlyExpenses: 42000,
      assetSlotMeta: meta.assetSlotMeta, debtSlotMeta: meta.debtSlotMeta,
    })
    // Vind het verkoopjaar (eenmalige netto-opbrengst > 0 + woning verdwijnt).
    let saleIdx = -1
    for (let i = 1; i < unified.rows.length; i++) {
      const prevHouse = unified.rows[i - 1].assetBuckets.eigen_huis?.endValue ?? 0
      const curHouse = unified.rows[i].assetBuckets.eigen_huis?.endValue ?? 0
      if (prevHouse > 100000 && curHouse === 0 && unified.rows[i].oneTimeNet > 100000) { saleIdx = i; break }
    }
    expect(saleIdx).toBeGreaterThan(0)
    const proceeds = unified.rows[saleIdx].oneTimeNet
    const liquid = (r: (typeof unified.rows)[number]) =>
      (r.assetBuckets.cash?.endValue ?? 0) +
      (r.assetBuckets.savings?.endValue ?? 0) +
      (r.assetBuckets.investment?.endValue ?? 0)
    const jump = liquid(unified.rows[saleIdx]) - liquid(unified.rows[saleIdx - 1])
    // De netto-opbrengst moet als liquide vermogen VERSCHIJNEN (was: 0 → verdampt).
    // Ruime marge: het verkoopjaar draagt ook groei + (na FIRE) een jaar onttrekking.
    expect(jump).toBeGreaterThan(proceeds * 0.6)
  })

  it('invariant: Σ stacked buckets == row.netWorth (bridge blijft trouw)', () => {
    const input = buildInput()
    const solve = solveFire(input)
    const eigenHuisIds = deriveEigenHuisIds(assets)
    const meta = buildKernelSlotMeta(assets, debts, eigenHuisIds)
    const unified = kernelToUnifiedResult(solve, {
      input, yearlyExpenses: 42000,
      assetSlotMeta: meta.assetSlotMeta, debtSlotMeta: meta.debtSlotMeta,
    })
    const stacked = unifiedRowsToStackedRows(unified.rows)
    for (let i = 0; i < stacked.length; i++) {
      const s = stacked[i]
      const sum = s.spaargeld + s.beleggingen + s.pensioen + s.vastgoed + s.overig + s.schulden
      expect(Math.abs(sum - unified.rows[i].netWorth)).toBeLessThanOrEqual(2)
    }
  })

  it('FIX 2 (verkoopmoment): on_depletion zonder fallbackAge verkoopt niet op 67', () => {
    const input = buildInput()
    // verkoopleeftijd hoort de Excel-fallback (75) te zijn, niet de app-triggerAge (67).
    expect(input.woning.verkoopleeftijd).toBe(75)
  })
})
