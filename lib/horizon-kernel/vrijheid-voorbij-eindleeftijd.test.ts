/**
 * Regressie — **een opgeloste vrijheidsleeftijd voorbij de eindleeftijd is geen vrijheid**
 * (voorgesteld gap-besluit V26; vondst bij de marktcheck-leeftijden, commit 693ed8e07).
 *
 * Mechanisme: P!B37 leest de modelwaarde óp de eindleeftijd (P!B35). Een FIRE-maand ná
 * die leeftijd verandert B37 niet meer, dus de `BepaalFIRE`-bisectie vindt "de eerste
 * maand na de eindleeftijd" als toereikend. Bij deplete tot 90 met uitgaven boven het
 * inkomen gaf de kern 90,08 als vrijheidsleeftijd (status `reached_now`, want B36 = 0),
 * en de bridge maakte daar `fireReachable = true` van. `guardFreedomAge` grijpt pas op
 * het horizonplafond 100 in.
 *
 * Norm: met `KernelInput.vrijheidVoorEindleeftijd` (app-pad AAN, fixture-pad UIT) geldt
 * op het GESOLVEDE pad `fireAge ≥ eindleeftijd` ⇒ `unreachable_within_horizon`, met B16
 * op de horizon-parkeerstand — dezelfde status en weergave als een mislukte
 * horizon-check. Vaste stopmomenten blijven ongemoeid.
 *
 * Per variant van de union die solver en bridge bedienen één regressietest:
 *  - solved × deplete   — gewenst: voorbij/óp 90 ⇒ onhaalbaar; vóór 90 ongewijzigd;
 *  - solved × legacy    — gewenst: de eindleeftijd (B52) is óók daar de grens;
 *  - solved × perpetual — gewenst: eindleeftijd = horizon 100, dus alleen de
 *                          parkeerstand 100 valt om; een leeftijd < 100 blijft;
 *  - vaste ankers aow/nu/leeftijd + `evaluateFireAt` — NIET gewenst: ongewijzigd.
 * Tolerantie: leeftijden zijn maand-exact (k/12), dus `toBeCloseTo(…, 6)` — absoluut,
 * ruim onder de maandstap van 0,083.
 */

import { describe, it, expect } from 'vitest'
import { buildKernelInputFromAppWithNotices } from '@/lib/horizon-kernel/adapter'
import { evaluateFireAt, solveFire } from '@/lib/horizon-kernel/solver'
import { kernelToUnifiedResult, buildKernelSlotMeta } from '@/lib/horizon-kernel/bridge'
import { deriveEigenHuisIds } from '@/lib/horizon-kernel/adapter/potten'
import { runScenarioBand } from '@/lib/horizon-kernel/wrappers/band'
import { MAX_AGE, type KernelInput } from '@/lib/horizon-kernel/types'
import type { Asset } from '@/lib/asset-data'

const POT_RULES = {
  surplus_group: 'spaargeld',
  deficit_order_groups: ['spaargeld', 'beleggingen', 'overig', 'pensioen', 'vastgoed'],
  withdrawal_order_groups: ['spaargeld', 'beleggingen', 'overig', 'pensioen', 'vastgoed'],
}

const EINDLEEFTIJD = 90

/** Belegd vermogen met rendement — alleen daarmee kan perpetual de koopkracht behouden. */
const BELEGGINGEN: Asset[] = [
  { id: 'a2', name: 'Beleggingen', asset_type: 'investment', current_value: 1_500_000, expected_return: 7, monthly_contribution: 0, is_active: true } as unknown as Asset,
]

function spaar(bedrag: number): Asset[] {
  return [
    { id: 'a1', name: 'Spaarrekening', asset_type: 'cash', current_value: bedrag, expected_return: 0, monthly_contribution: 0, is_active: true } as unknown as Asset,
  ]
}

/**
 * Geboren 1990 (startleeftijd 36), netto €3.000/mnd, uitgaven €3.200/mnd — uitgaven
 * boven het inkomen, zoals in de melding. Spaargeld zonder rendement.
 */
function bouw(
  eindVorm: 'deplete' | 'legacy' | 'perpetual',
  spaargeld: number,
  over: Record<string, unknown> = {},
  extra: Asset[] = [],
): { input: KernelInput; assets: Asset[] } {
  const assets = [...spaar(spaargeld), ...extra]
  const input = buildKernelInputFromAppWithNotices({
    profile: {
      date_of_birth: '1990-01-01',
      net_monthly_income: 3000,
      estimated_monthly_expenses: 3200,
      yearly_essential_expenses: 38400,
      expected_return: 0.07,
      inflation_rate: 0.02,
      box3_method: 'forfaitair',
      fire_end_strategy: eindVorm,
      fire_end_age: EINDLEEFTIJD,
      fire_legacy_amount: eindVorm === 'legacy' ? 1000 : null,
      feature_preferences: { horizon_kernel_convergentie: true },
      withdrawal_strategy: 'static',
      guardrail_floor: 0.8,
      guardrail_ceiling: 1.2,
      guardrail_cut_step: 0.1,
      housing_strategy_config: null,
      pot_rules: POT_RULES,
      retirement_expense_method: 'essential_budgets',
      retirement_custom_amount: null,
      ...over,
    },
    assets,
    debts: [],
    lifeEvents: [],
  } as never).input
  return { input, assets }
}

/** Het parity-/fixture-pad: de vlag weggelaten = exact het Excel v5-gedrag. */
function zonderVlag(input: KernelInput): KernelInput {
  return { ...input, vrijheidVoorEindleeftijd: undefined }
}

function naarUnified(input: KernelInput, assets: Asset[]) {
  const meta = buildKernelSlotMeta(assets, [], deriveEigenHuisIds(assets))
  return kernelToUnifiedResult(solveFire(input), {
    input,
    yearlyExpenses: 38400,
    assetSlotMeta: meta.assetSlotMeta,
    debtSlotMeta: meta.debtSlotMeta,
  })
}

describe('V26 · adapter', () => {
  it('Given het app-pad, When de adapter de KernelInput bouwt, Then staat de vlag AAN', () => {
    expect(bouw('deplete', 200_000).input.vrijheidVoorEindleeftijd).toBe(true)
  })
})

describe('V26 · solved × deplete — een leeftijd voorbij het plan is "niet haalbaar binnen je plan"', () => {
  it('Given deplete tot 90 en uitgaven boven het inkomen, When zonder vlag (oracle-pad), Then vindt de bisectie 90,08 (de gedocumenteerde oracle-vorm)', () => {
    const { input } = bouw('deplete', 200_000)
    const solve = solveFire(zonderVlag(input))
    expect(solve.eindleeftijd).toBe(EINDLEEFTIJD)
    expect(solve.fireAge).toBeCloseTo(EINDLEEFTIJD + 1 / 12, 6)
    expect(solve.status).not.toBe('unreachable_within_horizon')
  })

  it('Given dezelfde invoer op het app-pad, When de solver draait, Then is de status unreachable_within_horizon en staat B16 op de parkeerstand', () => {
    const { input } = bouw('deplete', 200_000)
    const solve = solveFire(input)
    expect(solve.status).toBe('unreachable_within_horizon')
    expect(solve.fireAge).toBeCloseTo(MAX_AGE, 6)
    expect(solve.vastStopLeeftijd).toBeNull()
  })

  it('Given dezelfde invoer, When de bridge de uitkomst omzet, Then is er geen vrijheidsleeftijd (fireReachable false, fireAge null)', () => {
    const { input, assets } = bouw('deplete', 200_000)
    const r = naarUnified(input, assets)
    expect(r.fireReachable).toBe(false)
    expect(r.fireAgeFractional).toBeNull()
    expect(r.fireAge).toBeNull()
  })

  it('Given een opgeloste leeftijd van precies de eindleeftijd (90,00), When de solver draait, Then telt ook die als niet haalbaar (grens is ≥)', () => {
    const { input } = bouw('deplete', 260_000)
    expect(solveFire(zonderVlag(input)).fireAge).toBeCloseTo(EINDLEEFTIJD, 6)
    expect(solveFire(input).status).toBe('unreachable_within_horizon')
  })

  it('Given een leeftijd vóór de eindleeftijd, When de solver draait, Then verandert er niets (niet-regressie)', () => {
    const { input } = bouw('deplete', 400_000)
    const met = solveFire(input)
    const zonder = solveFire(zonderVlag(input))
    expect(met.fireAge).toBeLessThan(EINDLEEFTIJD)
    expect(met.fireAge).toBe(zonder.fireAge)
    expect(met.status).toBe(zonder.status)
    expect(met.gap).toBe(zonder.gap)
  })
})

describe('V26 · solved × legacy — de eindleeftijd (B52) is ook daar de grens', () => {
  it('Given legacy tot 90 en een opgeloste leeftijd van 90,08 op het oracle-pad, When op het app-pad, Then onhaalbaar', () => {
    const { input, assets } = bouw('legacy', 260_000)
    expect(solveFire(zonderVlag(input)).fireAge).toBeCloseTo(EINDLEEFTIJD + 1 / 12, 6)
    const solve = solveFire(input)
    expect(solve.status).toBe('unreachable_within_horizon')
    expect(naarUnified(input, assets).fireAgeFractional).toBeNull()
  })

  it('Given legacy met een leeftijd vóór de eindleeftijd, When de solver draait, Then ongewijzigd', () => {
    const { input } = bouw('legacy', 400_000)
    const met = solveFire(input)
    expect(met.fireAge).toBeLessThan(EINDLEEFTIJD)
    expect(met.fireAge).toBe(solveFire(zonderVlag(input)).fireAge)
    expect(met.status).not.toBe('unreachable_within_horizon')
  })
})

describe('V26 · solved × perpetual — eindleeftijd = horizon 100', () => {
  it('Given perpetual waarbij alleen de parkeerstand 100 "toereikend" is (gap exact 0), When op het app-pad, Then onhaalbaar i.p.v. reached_now', () => {
    const { input } = bouw('perpetual', 400_000)
    const zonder = solveFire(zonderVlag(input))
    expect(zonder.fireAge).toBeCloseTo(MAX_AGE, 6)
    expect(zonder.status).not.toBe('unreachable_within_horizon')
    expect(solveFire(input).status).toBe('unreachable_within_horizon')
  })

  it('Given perpetual met een echte vrijheidsleeftijd < 100, When de solver draait, Then ongewijzigd', () => {
    const { input } = bouw('perpetual', 400_000, {}, BELEGGINGEN)
    const met = solveFire(input)
    expect(met.fireAge).toBeLessThan(MAX_AGE)
    expect(met.fireAge).toBe(solveFire(zonderVlag(input)).fireAge)
    expect(met.status).not.toBe('unreachable_within_horizon')
  })
})

describe('V26 · vaste stopmomenten blijven ongemoeid (vraag is óf het geld reikt, niet wánneer)', () => {
  const ankers = [
    { naam: 'aow', anker: { soort: 'aow' as const } },
    { naam: 'nu', anker: { soort: 'nu' as const } },
    { naam: 'leeftijd 60', anker: { soort: 'leeftijd' as const, leeftijd: 60 } },
  ]
  for (const { naam, anker } of ankers) {
    it(`Given anker ${naam} × deplete, When de solver draait, Then identiek aan het pad zonder vlag en nooit unreachable_within_horizon`, () => {
      const { input: basis } = bouw('deplete', 200_000)
      const input: KernelInput = { ...basis, stopAnker: anker }
      const met = solveFire(input)
      const zonder = solveFire(zonderVlag(input))
      expect(met.status).toBe(zonder.status)
      expect(met.fireAge).toBe(zonder.fireAge)
      expect(met.status).not.toBe('unreachable_within_horizon')
    })
  }

  it('Given een geforceerd stopmoment voorbij de eindleeftijd (evaluateFireAt 91), When geëvalueerd, Then identiek aan het pad zonder vlag', () => {
    const { input } = bouw('deplete', 200_000)
    const met = evaluateFireAt(input, 91)
    const zonder = evaluateFireAt(zonderVlag(input), 91)
    expect(met.status).toBe(zonder.status)
    expect(met.fireAge).toBe(91)
  })
})

describe('V26 · scenarioband deelt het predicaat', () => {
  it('Given deplete tot 90 met 90,08 als bisectie-uitkomst, When de band draait, Then is Verwacht onhaalbaar op het app-pad en haalbaar op het oracle-pad', () => {
    const { input } = bouw('deplete', 200_000)
    const verwacht = (i: KernelInput) => runScenarioBand(i).rows.find((r) => r.scenario === 'Verwacht')!
    expect(verwacht(zonderVlag(input)).reachable).toBe(true)
    const met = verwacht(input)
    expect(met.reachable).toBe(false)
    expect(met.fireAge).toBeNull()
  })
})
