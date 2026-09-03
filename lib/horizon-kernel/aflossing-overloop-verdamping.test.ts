/**
 * Regressie — **schuld→bezit-overloop verdampt bij surplus "Schulden aflossen"**
 * (kernel-extensie, gap-besluit V24; UAT WF-TOEK-25-bug1, 2 sep 2026).
 *
 * Bug (eigenaar-observatie op de persona "compleet": enkel `surplus_group` wisselen
 * van 'beleggingen' naar 'schuld_aflossen' verschoof de vrijheidsleeftijd 42 → 53).
 * Mechanisme: bij `schuld_aflossen` zet `toenamePrio()` (adapter/prio-overgang.ts)
 * ÁLLE bezit-categorieën op reserve-prio 5 → `wBezitToename` (verdeling/weights.ts,
 * `halveningWeights`) is all-zero. De schuld-categorieën zijn STATISCH op t=0
 * gevuld/gewogen; zodra de aanwijsbare schuld is afgelost (caps 0) lekt het volledige
 * aflos-budget als `aflossing.onbenut`, en de HC:HH-overloop naar bezit was
 * `onbenut · wBezitToename = onbenut · 0` → het overschot verdampte voor de rest van
 * de horizon uit het grootboek. Zelfde bugklasse als V17 (toename-degeneratie) en de
 * afname-/onttrekking-degeneratie (`runBezitWaterfallMetDegeneratie`).
 *
 * Deze suite pint de fix vast op drie niveaus:
 *  1. tabel `computeVerdeling` — na aflossing landt de overloop volledig
 *     (Σ overflow == onbenut) in liquide bezit-categorieën mét een pot; het
 *     niet-degenerate pad en een nul/negatief lek blijven byte-identiek.
 *  2. gedeelde instroom-ladder (`bezitInstroomFallbackWeights`) — pot-bewust: een
 *     categorie zonder pot of de eigen woning krijgt géén gewicht (anders verdampt het
 *     bedrag alsnog in Bez, `per stuk = totaal€ / aantal`).
 *  3. engine + solver — met 'schuld_aflossen' blijft de vrijheidsleeftijd in de buurt
 *     van 'beleggingen' (geen 11-jaar-sprong) en het maandoverschot landt in potten.
 */

import { describe, it, expect } from 'vitest'
import { buildKernelInputFromAppWithNotices } from '@/lib/horizon-kernel/adapter'
import { solveFire } from '@/lib/horizon-kernel/solver'
import { computeVerdeling, type VerdelingDep } from '@/lib/horizon-kernel/tables/verdeling'
import { bezitInstroomFallbackWeights } from '@/lib/horizon-kernel/tables/verdeling/weights'
import { computeToenameAfname } from '@/lib/horizon-kernel/tables/toename-afname'
import { kernelToUnifiedResult, buildKernelSlotMeta } from '@/lib/horizon-kernel/bridge'
import { deriveEigenHuisIds } from '@/lib/horizon-kernel/adapter/potten'
import { unifiedRowsToStackedRows } from '@/lib/wealth-composition'
import type { KernelInput } from '@/lib/horizon-kernel/types'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'

// Bezit-volgorde = categorie-identiteit: [Spaargeld, Beleggingen, Pensioen, Vastgoed, Eigen huis, Overig].
const SPAAR = 0
const BELEG = 1
const HUIS = 4
// Schuld-volgorde: [Woning, Consumptief, Studie, Zakelijk, Overig].
const CONSUMPTIEF = 1

// ── Synthetisch profiel: liquide potten + één kleine, snel afgeloste consumptieve schuld ──
const YEARLY_EXPENSES = 36000
const assetsLiquide: Asset[] = [
  { id: 'a1', name: 'Betaalrekening', asset_type: 'cash', current_value: 15000, expected_return: 0, monthly_contribution: 0, is_active: true } as unknown as Asset,
  { id: 'a2', name: 'Spaarrekening', asset_type: 'savings', current_value: 40000, expected_return: 2.5, monthly_contribution: 0, is_active: true } as unknown as Asset,
  { id: 'a3', name: 'Beleggingsrekening', asset_type: 'investment', current_value: 20000, expected_return: 7, monthly_contribution: 0, is_active: true } as unknown as Asset,
]
const eigenHuis: Asset = { id: 'h1', name: 'Mijn woning', asset_type: 'eigen_huis', current_value: 300000, expected_return: 2, monthly_contribution: 0, is_active: true } as unknown as Asset
const debts: Debt[] = [
  { id: 'd1', name: 'Doorlopend krediet', debt_type: 'revolving_credit', current_balance: 2000, interest_rate: 10, monthly_payment: 100, is_active: true } as unknown as Debt,
]
const lifeEvents: LifeEvent[] = [
  { id: 'e1', event_type: 'aow', name: 'AOW', target_age: 69, one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: 1558, is_active: true, sort_order: 0, metadata: { leefsituatie: 'alleenstaand', jarenBuitenNL: 0 } } as unknown as LifeEvent,
]

type Surplus = 'beleggingen' | 'schuld_aflossen'

function buildInput(surplus: Surplus, assets: readonly Asset[] = assetsLiquide): KernelInput {
  const adapterInput = {
    asOf: new Date('2026-09-01T00:00:00Z'),
    profile: {
      date_of_birth: '1985-01-01', net_monthly_income: 5000, estimated_monthly_expenses: 3000,
      yearly_essential_expenses: YEARLY_EXPENSES, expected_return: 0.07, inflation_rate: 0.02,
      box3_method: 'forfaitair', marginaal_tarief: 0.495, fire_end_strategy: 'deplete',
      fire_end_age: 90, fire_legacy_amount: null, feature_preferences: { horizon_kernel_convergentie: true },
      withdrawal_strategy: 'static', guardrail_floor: 0.8, guardrail_ceiling: 1.2,
      guardrail_cut_step: 0.1, guardrail_raise_step: 0.1,
      housing_strategy_config: { mode: 'include_full' },
      pot_rules: {
        surplus_group: surplus,
        deficit_order_groups: ['spaargeld', 'beleggingen', 'overig', 'pensioen', 'vastgoed'],
        withdrawal_order_groups: ['spaargeld', 'beleggingen', 'overig', 'pensioen', 'vastgoed'],
      },
      retirement_expense_method: 'essential_budgets', retirement_custom_amount: null,
    },
    assets, debts, lifeEvents,
  }
  return buildKernelInputFromAppWithNotices(adapterInput as never).input
}

/** Verdeling-dep "de consumptieve schuld is afgelost, het aflos-budget lekt". */
function depNaAflossing(overrides: Partial<VerdelingDep> = {}): VerdelingDep {
  return {
    afnameBudget: 0,
    onttrekkingBudget: 0,
    aflossingBudget: 1000,
    bezSaldiPrev: [55000, 20000, 0, 0, 0, 0],
    schuldSaldiPrev: [0, 0, 0, 0, 0],
    tekortSaldoPrev: 0,
    ...overrides,
  }
}

const som = (xs: readonly number[]) => xs.reduce((a, x) => a + x, 0)

describe('kernel · schuld→bezit-overloop bij surplus "Schulden aflossen" (V24)', () => {
  it('reproduceert de degenerate TS-config (alle bezit reserve, schuld aflos-prio 1)', () => {
    const input = buildInput('schuld_aflossen')
    for (const c of input.ts.bezitCategorien) expect(c.prioToename).toBe(5)
    const cons = input.ts.schuldCategorien.find((c) => c.categorie === 'Consumptief')!
    expect(cons.gevuld).toBe(true)
    expect(cons.prioAflossing).toBe(1)
  })

  it('FIX (tabel): ná aflossing landt het lekkende aflos-budget volledig als overloop in bezit', () => {
    const input = buildInput('schuld_aflossen')
    const row = computeVerdeling(input, depNaAflossing(), 12)
    // Het budget kan nergens in de schuld-waterval terecht (caps 0) → alles lekt.
    expect(row.aflossing.onbenut).toBeCloseTo(1000, 6)
    // Vóór de fix: overflow = onbenut · [0,0,0,0,0,0] = alles verdampt.
    expect(som(row.overflow)).toBeCloseTo(1000, 6)
    // Ladder-stap B (prio-5-reserve, liquide, mét pot): Spaargeld + Beleggingen gelijk.
    expect(row.overflow[SPAAR]).toBeCloseTo(500, 6)
    expect(row.overflow[BELEG]).toBeCloseTo(500, 6)
    // Categorieën zonder pot (Pensioen/Vastgoed/Eigen huis/Overig) krijgen niets —
    // Bez zou dat bedrag (per stuk / aantal 0) alsnog laten verdampen.
    expect(row.overflow[2]).toBe(0)
    expect(row.overflow[3]).toBe(0)
    expect(row.overflow[HUIS]).toBe(0)
    expect(row.overflow[5]).toBe(0)
  })

  it('byte-identiek: zolang de schuld openstaat is er geen lek en dus geen overloop', () => {
    const input = buildInput('schuld_aflossen')
    const row = computeVerdeling(input, depNaAflossing({ schuldSaldiPrev: [0, 2000, 0, 0, 0] }), 12)
    expect(row.aflossing.eind[CONSUMPTIEF]).toBeCloseTo(1000, 6)
    expect(row.aflossing.onbenut).toBeCloseTo(0, 6)
    expect(row.overflow.every((v) => v === 0)).toBe(true)
  })

  it('byte-identiek: het niet-degenerate pad (surplus naar beleggingen) gebruikt de reguliere gewichten', () => {
    const input = buildInput('beleggingen')
    const row = computeVerdeling(input, depNaAflossing(), 12)
    // wBezitToename = [0,1,0,0,0,0] → de overloop gaat 100% naar Beleggingen, zoals voorheen.
    expect(row.overflow[BELEG]).toBeCloseTo(1000, 6)
    expect(som(row.overflow)).toBeCloseTo(1000, 6)
  })

  it('byte-identiek: een deficit-maand (negatief aflos-budget) geeft geen lek en geen overloop', () => {
    const input = buildInput('schuld_aflossen')
    const row = computeVerdeling(input, depNaAflossing({ aflossingBudget: -500 }), 12)
    // De tekort-lening-stap (MIN(budget, saldo+rente)) absorbeert een negatief budget
    // volledig (oracle-gedrag) → EQ = 0 → niets lekt; de fallback-poort (onbenut > ε)
    // ziet dus nooit een negatief bedrag en de overloop blijft exact all-nul.
    expect(row.aflossing.onbenut).toBe(0)
    expect(row.overflow.every((v) => v === 0)).toBe(true)
  })

  it('FIX (tabel): de eigen woning is géén instroom-doel, ook niet bij "meerekenen"', () => {
    const input = buildInput('schuld_aflossen', [...assetsLiquide, eigenHuis])
    const huis = input.ts.bezitCategorien[HUIS]
    expect(huis.categorie).toBe('Eigen huis')
    expect(huis.nietLiquide).toBe(false) // include_full → liquide in de TS-zin
    const row = computeVerdeling(
      input,
      depNaAflossing({ bezSaldiPrev: [55000, 20000, 0, 0, 300000, 0] }),
      12,
    )
    expect(som(row.overflow)).toBeCloseTo(1000, 6)
    expect(row.overflow[HUIS]).toBe(0)
    expect(row.overflow[SPAAR]).toBeCloseTo(500, 6)
    expect(row.overflow[BELEG]).toBeCloseTo(500, 6)
  })
})

describe('kernel · gedeelde instroom-ladder (bezitInstroomFallbackWeights)', () => {
  const liquide = [false, false, false, false, false, false]

  it('A: prio 1..4 zonder gevuld-eis, ½^(prio−1)-ordening, alleen instroom-doelen', () => {
    const w = bezitInstroomFallbackWeights([1, 2, 5, 5, 5, 5], liquide, [true, true, true, true, false, true])
    expect(w[0]).toBeCloseTo(2 / 3, 12)
    expect(w[1]).toBeCloseTo(1 / 3, 12)
    expect(som(w)).toBeCloseTo(1, 12)
  })

  it('A → B: een prio-1-doel ZONDER pot telt niet; de reserve mét pot vangt op', () => {
    // Beleggingen prio 1 maar geen pot → ladder valt door naar prio-5-reserve (Spaargeld).
    const w = bezitInstroomFallbackWeights([5, 1, 5, 5, 5, 5], liquide, [true, false, false, false, false, false])
    expect(w).toEqual([1, 0, 0, 0, 0, 0])
  })

  it('B: prio-5-reserve gelijk gewogen over liquide instroom-doelen; niet-liquide valt af', () => {
    const w = bezitInstroomFallbackWeights([5, 5, 5, 5, 5, 5], [false, false, false, false, true, false], [true, true, false, false, true, true])
    expect(w).toEqual([1 / 3, 1 / 3, 0, 0, 0, 1 / 3])
  })

  it('C: geen enkel liquide instroom-doel → all-nul (geen NaN, geen deling door nul)', () => {
    const w = bezitInstroomFallbackWeights([5, 5, 5, 5, 5, 5], liquide, [false, false, false, false, false, false])
    expect(w).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('FIX (toename-tabel, V17-ladder pot-bewust): surplus-doel zonder pot verdampt niet meer in Bez', () => {
    // "Naar beleggingen" gekozen, maar er bestaat géén beleggingspot: vóór deze fix kreeg
    // Beleggingen (aantal 0) het volle gewicht → Bez deelde door aantal 0 → €0 inleg.
    const input = buildInput('beleggingen', assetsLiquide.filter((a) => a.asset_type !== 'investment'))
    const D = 1000
    const row = computeToenameAfname(input, { totaalExtraGeld: D, afname: 0, onttrekking: 0 }, 12)
    if (row.beyondHorizon) throw new Error('onverwacht beyondHorizon')
    expect(row.bezit[BELEG].aantal).toBe(0)
    expect(row.bezit[BELEG].toenameEur).toBe(0)
    expect(row.bezit[SPAAR].toenameEur).toBeCloseTo(D, 6)
    expect(som(row.bezit.map((c) => c.toenameEur))).toBeCloseTo(D, 6)
  })
})

describe('kernel · engine + solver: "Schulden aflossen" verschuift de vrijheidsleeftijd niet met jaren', () => {
  function run(surplus: Surplus) {
    const input = buildInput(surplus)
    const solve = solveFire(input)
    const eigenHuisIds = deriveEigenHuisIds(assetsLiquide)
    const meta = buildKernelSlotMeta(assetsLiquide, debts, eigenHuisIds)
    const unified = kernelToUnifiedResult(solve, {
      input, yearlyExpenses: YEARLY_EXPENSES,
      assetSlotMeta: meta.assetSlotMeta, debtSlotMeta: meta.debtSlotMeta,
    })
    return { input, solve, unified }
  }
  const liquid = (r: { assetBuckets: Record<string, { endValue: number } | undefined> }) =>
    (r.assetBuckets.cash?.endValue ?? 0) +
    (r.assetBuckets.savings?.endValue ?? 0) +
    (r.assetBuckets.investment?.endValue ?? 0)

  it('beide bestemmingen bereiken vrijheid en liggen dicht bij elkaar (geen 42→53-sprong)', () => {
    const beleg = run('beleggingen')
    const schuld = run('schuld_aflossen')
    expect(beleg.solve.status).not.toBe('unreachable_within_horizon')
    expect(schuld.solve.status).not.toBe('unreachable_within_horizon')
    // De €2.000-schuld is binnen enkele maanden weg; daarna moet het overschot blijven
    // landen (50/50 spaar/beleggen i.p.v. 100% beleggen — een rendementsverschil, geen
    // verdamping). Vóór de fix parkeerde de solver 'schuld_aflossen' ver later of op de
    // horizon omdat ruim twintig jaar maandoverschot uit het grootboek verdween.
    expect(schuld.solve.fireAge).toBeLessThan(beleg.solve.fireAge + 4)
    expect(schuld.solve.fireAge).toBeGreaterThan(beleg.solve.fireAge - 1)
  })

  it('het maandoverschot landt ná aflossing in liquide potten (Spaargeld én Beleggingen groeien)', () => {
    const schuld = run('schuld_aflossen')
    const start = schuld.unified.rows[0]
    const at55 = schuld.unified.rows.find((r) => r.age === 55)!
    // Zonder de fix groeide alleen het startkapitaal (rendement); met ~€2k/mnd overschot
    // over ~14 jaar hoort het liquide vermogen ruim méér dan verdubbeld te zijn.
    expect(liquid(at55)).toBeGreaterThan(liquid(start) * 3)
    expect(at55.assetBuckets.savings?.endValue ?? 0).toBeGreaterThan(start.assetBuckets.savings?.endValue ?? 0)
    expect(at55.assetBuckets.investment?.endValue ?? 0).toBeGreaterThan(start.assetBuckets.investment?.endValue ?? 0)
    // De consumptieve schuld is afgelost (niet oneindig herfinancierd).
    expect(at55.totalDebts).toBeLessThanOrEqual(1)
  })

  it('invariant: Σ stacked buckets == row.netWorth (bridge blijft trouw, geen geld verschijnt uit het niets)', () => {
    const schuld = run('schuld_aflossen')
    const stacked = unifiedRowsToStackedRows(schuld.unified.rows)
    for (let i = 0; i < stacked.length; i++) {
      const s = stacked[i]
      const sum = s.spaargeld + s.beleggingen + s.pensioen + s.vastgoed + s.overig + s.schulden
      expect(Math.abs(sum - schuld.unified.rows[i].netWorth)).toBeLessThanOrEqual(2)
    }
  })
})
