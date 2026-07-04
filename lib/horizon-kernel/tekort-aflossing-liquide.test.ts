/**
 * Regressie — **F6-bugfix: verkoop-transitie-lag-piek / geen aflossingspad tekort-lening**
 * (kernel-extensie buiten het Excel v5-oracle; gap-besluit V19, ADR 0033).
 *
 * Bug (firsthand geverifieerd): bij een "wanneer nodig"-huisverkoop ontstaat door de
 * één-maand-capaciteitslag (verdeling capt op categoriesaldo m−1) een tekort van één
 * maand dat als tekort-lening wordt geboekt. Die lening kon NOOIT worden afgelost:
 * `tekortAflossing` (S!AC) werd uitsluitend gevoed uit het Toename-aflos-budget (positief
 * maandsurplus), dat in de onttrekkingsfase structureel 0 is. Resultaat op de synthetische
 * eigenaar-case: een ~€10k transitie-piek die met 5% rente compoundt tot €1,67M terwijl er
 * >€1M liquide (Beleggingen, verkoopopbrengst) náást staat.
 *
 * Fix (`computeVerdeling`, schakelbaar via `input.tekortAflossingUitLiquide`): elke maand,
 * ná de reguliere verdeling/onttrekking, als het tekort-lening-saldo > 0 én er nog liquide
 * capaciteit is (m−1-lag), los af uit de liquide bezit-categorieën in de onttrekking-
 * waterval-volgorde tot saldo of capaciteit op is. Vlag AAN = app-pad (adapter); vlag UIT =
 * parity-/fixture-pad (byte-identiek oracle-gedrag, lening blijft staan).
 */

import { describe, it, expect } from 'vitest'
import { buildKernelInputFromAppWithNotices } from '@/lib/horizon-kernel/adapter'
import { solveFire } from '@/lib/horizon-kernel/solver'
import { computeVerdeling, type VerdelingDep } from '@/lib/horizon-kernel/tables/verdeling'
import type { KernelInput } from '@/lib/horizon-kernel/types'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'

// Bezit-volgorde [Spaar, Beleg, Pens, Vast, Huis, Overig] (= Verdeling/engine-orde).
const SPAAR = 0

// ── Synthetisch eigenaar-profiel: huis (op-depletie-verkoop op fallback) + lange ──
//    onttrekkingsfase → transitie-lag-tekort dat blijft staan (vóór de fix).
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
const adapterInput = {
  profile: {
    date_of_birth: '1980-01-01', net_monthly_income: 5000, estimated_monthly_expenses: 3500,
    yearly_essential_expenses: 42000, expected_return: 0.07, inflation_rate: 0.02,
    box3_method: 'forfaitair', marginaal_tarief: 0.495, fire_end_strategy: 'deplete',
    fire_end_age: 90, fire_legacy_amount: null, feature_preferences: { horizon_kernel_convergentie: true },
    withdrawal_strategy: 'static', guardrail_floor: 0.8, guardrail_ceiling: 1.2,
    guardrail_cut_step: 0.1, guardrail_raise_step: 0.1,
    housing_strategy_config: { mode: 'downsize', trigger: 'on_depletion', triggerAge: 67, salePricePct: 1, salesCostsPct: 0.04, newMonthlyHousingCost: null, depletionThresholdYears: 0 },
    pot_rules: { surplus_group: 'beleggingen', deficit_order_groups: ['spaargeld', 'beleggingen', 'overig', 'pensioen', 'vastgoed'], withdrawal_order_groups: ['spaargeld', 'beleggingen', 'overig', 'pensioen', 'vastgoed'] },
    retirement_expense_method: 'essential_budgets', retirement_custom_amount: null,
  },
  assets, debts, lifeEvents,
}

function buildInput(): KernelInput {
  return buildKernelInputFromAppWithNotices(adapterInput as never).input
}

function tekortSlotIdx(input: KernelInput): number {
  return input.schuldPotten.find((p) => p.rol === 'tekortLening')?.slot ?? 6
}

/** Tekort-lening-saldo-serie (maandelijks) uit een projectie. */
function tekortSerie(input: KernelInput, flag: boolean): number[] {
  const solve = solveFire({ ...input, tekortAflossingUitLiquide: flag })
  const slot = tekortSlotIdx(input)
  const out: number[] = []
  for (let m = 0; m < 1200; m++) {
    const cell = solve.projection.s[m]?.slots[slot]
    out.push(typeof cell?.saldo === 'number' ? cell.saldo : 0)
  }
  return out
}

/** Verdeling-dep met een pre-existent tekort en instelbare liquide capaciteit. */
function depMet(over: Partial<VerdelingDep>): VerdelingDep {
  return {
    afnameBudget: 0,
    onttrekkingBudget: 0,
    aflossingBudget: 0,
    bezSaldiPrev: [0, 0, 0, 0, 0, 0],
    schuldSaldiPrev: [0, 0, 0, 0, 0],
    tekortSaldoPrev: 0,
    ...over,
  }
}

describe('kernel · F6 tekort-aflossing uit liquide (transitie-lag-piek)', () => {
  // ── Voorwaarde: de app-adapter zet de vlag AAN (default), fixtures niet ─────────
  it('adapter zet tekortAflossingUitLiquide AAN (app-pad, default)', () => {
    expect(buildInput().tekortAflossingUitLiquide).toBe(true)
  })

  // ── (a) transitie-lag: verkoop-maand-tekort afgelost de maand erna uit liquide ──
  it('(a) engine: transitie-piek (leeftijd 73–90) wordt afgelost mét vlag; zonder vlag blijft hij staan', () => {
    const input = buildInput()
    const serieOn = tekortSerie(input, true)
    const serieOff = tekortSerie(input, false)
    const start = input.startLeeftijd
    const mAt = (age: number) => Math.round((age - start) * 12)

    // Meet de tekort-lening in het POST-SETTLEMENT-venster [74, 90]: ná de "wanneer
    // nodig"-verkoop (~73, waar >€1M verkoopopbrengst liquide náást de piek arriveert
    // en de maand erná aflost) en vóór de terminale depletie (~90+, waar het tekort een
    // LEGITIEME depletie is — geen liquide meer; de aflos-stap is dáár terecht inert).
    // Vgl. withdrawal-evaporation.test.ts (zelfde depletie-vs-artefact-onderscheid).
    let maxOn = 0
    let maxOff = 0
    for (let age = 74; age <= 90; age++) {
      maxOn = Math.max(maxOn, serieOn[mAt(age)])
      maxOff = Math.max(maxOff, serieOff[mAt(age)])
    }
    // Vlag UIT = huidig oracle-gedrag: de transitie-piek blijft staan en compoundt
    // (~€10k op 74, oplopend naar ~€23k op 90) — terwijl er >€500k liquide náást staat.
    expect(maxOff).toBeGreaterThan(10_000)
    // Vlag AAN: de piek is de maand ná de verkoop afgelost → 0 in het hele venster.
    expect(maxOn).toBeLessThan(100)
  })

  it('(a) engine: kort ná de verkoop (leeftijd 74) staat de lening op ~0 mét vlag', () => {
    const input = buildInput()
    const serieOn = tekortSerie(input, true)
    // Leeftijd 74 = maand (74−40)·12 = 408; ruim ná de verkoop op ~73.
    const m74 = (74 - input.startLeeftijd) * 12
    expect(serieOn[m74]).toBeLessThan(100)
  })

  it('(a) engine: LEGITIEME terminale depletie (lege potten, ~leeftijd 100) blijft een tekort tonen — de stap papt insolventie niet weg', () => {
    const input = buildInput()
    const serieOn = tekortSerie(input, true)
    // Op ~leeftijd 100 is het liquide vermogen echt op; de aflos-stap is inert en het
    // (legitieme) depletie-tekort staat er gewoon — de fix verbergt géén echte insolventie.
    const m100 = Math.round((100 - input.startLeeftijd) * 12)
    expect(serieOn[m100]).toBeGreaterThan(1_000_000)
  })

  // ── (b) lege potten → geen aflossing, gedrag identiek aan vandaag ──────────────
  it('(b) lege liquide potten → geen aflossing; identiek aan vlag-uit', () => {
    const input = buildInput()
    const dep = depMet({ tekortSaldoPrev: 10_000 }) // caps allemaal 0
    const on = computeVerdeling(input, dep, 200)
    const off = computeVerdeling({ ...input, tekortAflossingUitLiquide: false }, dep, 200)
    expect(on.tekortAflossing).toBeCloseTo(0, 6)
    expect(on.tekortAflossingLiquide.every((v) => v === 0)).toBe(true)
    expect(on.tekortAflossing).toBeCloseTo(off.tekortAflossing, 6)
    expect(on.tekortAflossingLiquide).toEqual(off.tekortAflossingLiquide)
  })

  // ── (c) gedeeltelijke capaciteit → gedeeltelijke aflossing, rest + rente erna ───
  it('(c) capaciteit < tekort → gedeeltelijke aflossing; rest + rente de maand erna', () => {
    const input = buildInput()
    const rate = input.tekortLeningRente
    const saldoPrev = 10_000
    const rente1 = (saldoPrev * rate) / 12

    // Maand 1: Spaargeld cap €3.000 < resterend tekort (€10k + rente) → gecapt op €3.000.
    const row1 = computeVerdeling(input, depMet({ tekortSaldoPrev: saldoPrev, bezSaldiPrev: [3000, 0, 0, 0, 0, 0] }), 200)
    expect(row1.tekortAflossing).toBeCloseTo(3000, 2)
    expect(row1.tekortAflossingLiquide[SPAAR]).toBeCloseTo(3000, 2)
    // De resterende tekort-schuld (S!AB-formule): MAX(0, saldoPrev + rente + BV+EO − AC).
    const restNaMaand1 = Math.max(0, saldoPrev + rente1 + 0 - row1.tekortAflossing)
    expect(restNaMaand1).toBeGreaterThan(7000)

    // Maand 2: ruime capaciteit → volledige aflossing van het restant + zijn rente.
    const rente2 = (restNaMaand1 * rate) / 12
    const row2 = computeVerdeling(input, depMet({ tekortSaldoPrev: restNaMaand1, bezSaldiPrev: [100_000, 0, 0, 0, 0, 0] }), 201)
    expect(row2.tekortAflossing).toBeCloseTo(restNaMaand1 + rente2, 2)
    const restNaMaand2 = Math.max(0, restNaMaand1 + rente2 + 0 - row2.tekortAflossing)
    expect(restNaMaand2).toBeCloseTo(0, 6)
  })

  // ── (d) vlag UIT → exact oud gedrag (lening blijft staan) ──────────────────────
  it('(d) vlag UIT → geen liquide-aflossing (surplus-only); lening blijft staan', () => {
    const input = { ...buildInput(), tekortAflossingUitLiquide: false }
    const dep = depMet({ tekortSaldoPrev: 10_000, bezSaldiPrev: [100_000, 0, 0, 0, 0, 0] })
    const row = computeVerdeling(input, dep, 200)
    // aflossingBudget = 0 (geen surplus) → tekortAflossing = 0 → lening groeit met rente.
    expect(row.tekortAflossing).toBeCloseTo(0, 6)
    expect(row.tekortAflossingLiquide.every((v) => v === 0)).toBe(true)
  })

  // ── (e) waterval-volgorde gerespecteerd (prio-1 onttrekking eerst) ─────────────
  it('(e) aflossing volgt de onttrekking-waterval-volgorde (Spaargeld = prio 1 eerst)', () => {
    const input = buildInput()
    // Spaargeld (prio-onttrekking 1) heeft ruim capaciteit; Overig (prio 3) ook.
    const dep = depMet({ tekortSaldoPrev: 8000, bezSaldiPrev: [100_000, 0, 0, 0, 0, 100_000] })
    const row = computeVerdeling(input, dep, 200)
    // Alles komt uit de hoogste-prio liquide categorie (Spaargeld), niets uit Overig.
    expect(row.tekortAflossingLiquide[SPAAR]).toBeGreaterThan(row.tekortAflossing * 0.99)
    expect(row.tekortAflossingLiquide[5]).toBeCloseTo(0, 6) // Overig ongemoeid
  })

  // ── (f) Σruw=0-invariant: onttrokken liquide == afgeloste tekort ───────────────
  it('(f) Σruw=0: Σ tekortAflossingLiquide == afgeloste tekort (geld verdampt/ontstaat niet)', () => {
    const input = buildInput()
    const dep = depMet({ tekortSaldoPrev: 12_345, bezSaldiPrev: [100_000, 0, 0, 0, 0, 0] })
    const row = computeVerdeling(input, dep, 200)
    const somLiquide = row.tekortAflossingLiquide.reduce((s, v) => s + v, 0)
    // Wat uit bezit wordt getrokken == wat op de tekort-lening wordt afgelost (surplus=0).
    expect(somLiquide).toBeCloseTo(row.tekortAflossing, 6)
    expect(somLiquide).toBeGreaterThan(0)
  })

  // ── (g) surplus-tak (aflossingBudget>0) ÉN liquide-tak tegelijk ────────────────
  it('(g) surplus + liquide samen → totale aflossing gecapt op het pre-existente tekort (geen dubbele aflossing)', () => {
    const input = buildInput()
    const rate = input.tekortLeningRente
    const saldoPrev = 10_000
    const rente = (saldoPrev * rate) / 12
    // Surplus-tak (aflossingBudget €5.000) dekt de eerste €5.000; de liquide-tak moet
    // exact het RESTANT (saldoPrev + rente − surplus) pakken, niet het volle tekort.
    const row = computeVerdeling(
      input,
      depMet({ aflossingBudget: 5000, tekortSaldoPrev: saldoPrev, bezSaldiPrev: [100_000, 0, 0, 0, 0, 0] }),
      200,
    )
    const surplus = Math.min(5000, saldoPrev + rente) // = 5000
    const resterendTekort = saldoPrev + rente - surplus
    const somLiquide = row.tekortAflossingLiquide.reduce((s, v) => s + v, 0)
    // Totale aflossing = precies het pre-existente tekort (saldoPrev + rente), niet méér:
    // een refactor die `− tekortAflossingSurplus` uit `resterendTekort` sloopt (dubbele
    // aflossing van het surplus-deel) maakt dit rood.
    expect(row.tekortAflossing).toBeCloseTo(saldoPrev + rente, 6)
    // Het liquide deel is exact het restant ná de surplus-tak.
    expect(somLiquide).toBeCloseTo(resterendTekort, 6)
    expect(row.tekortAflossingLiquide[SPAAR]).toBeCloseTo(resterendTekort, 6)
  })
})
