/**
 * Regressie — **onttrekking/afname-verdamping bij een uitgesloten liquide pot**
 * (kernel-extensie; spiegel van `surplus-evaporation.test.ts` aan de UITstroom-kant).
 *
 * Bug (bewezen op eigenaar-data): tijdens accumulatie loopt de surplus-doelpot
 * (bv. een €0-beleggingspot) vol. In de onttrekkingsfase raakt Spaargeld (prio 1,
 * STATISCH gevuld) leeg; de behoefte hoort dan naar Beleggingen (prio 2) te vloeien,
 * maar die is STATISCH `gevuld=false` → `ruwGewicht`/`halveningWeights` geven weight 0
 * en de Verdeling-waterval sluit haar uit ONDANKS een fors saldo. Het onttrekking-
 * budget lekt daardoor elke maand als `onbenut` naar de tekort-lening (5% rente),
 * terwijl Beleggingen ongemoeid doorgroeit — Bez én tekort-lening exploderen parallel.
 *
 * Anders dan de toename-degeneratie (`somToename===0`, GEEN gewogen doel) is dit een
 * CAPACITEITS-degeneratie: `som > 0` (Spaargeld weegt mee), dus een gewicht-fallback
 * zou nooit vuren. De fix zit in `computeVerdeling` (`runBezitWaterfallMetDegeneratie`):
 * laat de statische gevuld-eis vallen ZODRA het budget lekt én een uitgesloten liquide
 * pot restcapaciteit heeft; bij échte depletie (alle liquide leeg) blijft de oracle-lek
 * intact.
 *
 * Deze suite pint de fix vast op twee niveaus:
 *  1. tabel `computeVerdeling` — het degenerate onttrekking- én afname-budget landt in
 *     de uitgesloten liquide pot (Beleggingen), niet in `onbenut` → tekort-lening.
 *  2. engine + bridge — na leegloop Spaargeld komt de onttrekking uit Beleggingen en
 *     blijft de tekort-lening (vrijwel) 0 gedurende de hele onttrekkingsfase.
 */

import { describe, it, expect } from 'vitest'
import { buildKernelInputFromAppWithNotices } from '@/lib/horizon-kernel/adapter'
import { solveFire } from '@/lib/horizon-kernel/solver'
import { computeVerdeling, type VerdelingDep } from '@/lib/horizon-kernel/tables/verdeling'
import { kernelToUnifiedResult, buildKernelSlotMeta } from '@/lib/horizon-kernel/bridge'
import { deriveEigenHuisIds } from '@/lib/horizon-kernel/adapter/potten'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'

// Bezit-volgorde [Spaar, Beleg, Pens, Vast, Huis, Overig] (= Verdeling/engine-orde).
const SPAAR = 0
const BELEG = 1

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

/** Verdeling-dep met gedraineerd Spaargeld (cap 0) en een gevulde Beleggingen-cap. */
function degenerateDep(over: Partial<VerdelingDep>): VerdelingDep {
  return {
    afnameBudget: 0,
    onttrekkingBudget: 0,
    aflossingBudget: 0,
    bezSaldiPrev: [0, 500000, 0, 0, 0, 0], // Spaargeld leeg, Beleggingen €500k
    schuldSaldiPrev: [0, 0, 0, 0, 0],
    tekortSaldoPrev: 0,
    ...over,
  }
}

describe('kernel · onttrekking/afname-verdamping bij uitgesloten liquide pot', () => {
  it('reproduceert de degenerate TS-config (som > 0, capaciteits-degeneratie)', () => {
    const input = buildInput()
    const bez = input.ts.bezitCategorien
    const spaar = bez.find((c) => c.categorie === 'Spaargeld')!
    const beleg = bez.find((c) => c.categorie === 'Beleggingen')!
    // Spaargeld weegt WEL mee voor onttrekking (prio 1, gevuld) → som > 0.
    expect(spaar.prioOnttrekking).toBe(1)
    expect(spaar.gevuld).toBe(true)
    // Beleggingen: uitstroom-prio maar STATISCH ongevuld → weight 0 zolang !gevuld.
    expect(beleg.prioOnttrekking).toBe(2)
    expect(beleg.prioAfname).toBe(2)
    expect(beleg.gevuld).toBe(false)
    expect(beleg.nietLiquide).toBe(false)
  })

  it('FIX (tabel): degenerate ONTTREKKING-budget landt in Beleggingen i.p.v. onbenut→tekort', () => {
    const input = buildInput()
    const budget = 4000
    const row = computeVerdeling(input, degenerateDep({ onttrekkingBudget: budget }), 200)
    // Vóór de fix: eind[Beleggingen]=0, onbenut=budget (lekt naar de tekort-lening).
    expect(row.onttrekking.eind[BELEG]).toBeCloseTo(budget, 2)
    expect(row.onttrekking.eind[SPAAR]).toBeCloseTo(0, 2) // Spaargeld leeg (cap 0)
    expect(row.onttrekking.onbenut).toBeLessThan(1)
  })

  it('FIX (tabel): degenerate AFNAME-budget landt óók in Beleggingen (consistent met onttrekking)', () => {
    const input = buildInput()
    const budget = 6000
    const row = computeVerdeling(input, degenerateDep({ afnameBudget: budget }), 200)
    expect(row.afname.eind[BELEG]).toBeCloseTo(budget, 2)
    expect(row.afname.onbenut).toBeLessThan(1)
  })

  it('inert: bij ECHTE depletie (alle liquide leeg) lekt het budget nog steeds (oracle-gedrag)', () => {
    const input = buildInput()
    // Geen enkele liquide categorie heeft saldo → geen uitgesloten capaciteit → geen fallback.
    const row = computeVerdeling(
      input,
      degenerateDep({ onttrekkingBudget: 4000, bezSaldiPrev: [0, 0, 0, 0, 0, 0] }),
      200,
    )
    expect(row.onttrekking.onbenut).toBeCloseTo(4000, 2) // lekt → tekort-lening (ongewijzigd)
  })

  it('FIX (engine+bridge): onttrekking komt uit Beleggingen, tekort-lening blijft 0 in de gezonde fase', () => {
    const input = buildInput()
    const solve = solveFire(input)
    const eigenHuisIds = deriveEigenHuisIds(assets)
    const meta = buildKernelSlotMeta(assets, debts, eigenHuisIds)
    const unified = kernelToUnifiedResult(solve, {
      input, yearlyExpenses: 42000,
      assetSlotMeta: meta.assetSlotMeta, debtSlotMeta: meta.debtSlotMeta,
    })
    const fireAge = unified.fireAge ?? 60

    // Tekort-lening blijft 0 gedurende de eerste 10 onttrekkingsjaren (de "gezonde"
    // fase: Beleggingen is fors gevuld en absorbeert de volledige behoefte). Vóór de
    // fix groeide zij hier vanaf het eerste onttrekkingsjaar aan (naar miljoenen). De
    // terminale depletie (deplete-doel €0 @90) en de huisverkoop-op-depletie-transitie
    // ná deze fase mogen een klein, legitiem restant-tekort geven — dat is échte
    // depletie, geen gevuld-artefact.
    let maxTekort = 0
    for (const r of unified.rows) {
      if (r.phase !== 'withdrawal' || r.age > fireAge + 10) continue
      maxTekort = Math.max(maxTekort, r.debtBalances['tekort-lening']?.endBalance ?? 0)
    }
    expect(maxTekort).toBeLessThan(100)

    // De onttrekking komt daadwerkelijk uit Beleggingen (investment) in de onttrekkingsfase.
    const investWithdrawn = unified.rows
      .filter((r) => r.phase === 'withdrawal')
      .reduce((s, r) => s + (r.withdrawalByType.investment ?? 0), 0)
    expect(investWithdrawn).toBeGreaterThan(0)
  })
})
