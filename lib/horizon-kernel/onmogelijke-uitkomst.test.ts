/**
 * Regressie — **M6: onmogelijke uitkomsten uit de FIRE-solver** (kernel-extensie).
 *
 * Bevinding M6 (UX-testpanel, 24-08-2026): met een structureel tekort-profiel
 * (leeg/onvolledig, uitgaven >> inkomen) toonde /toekomst "VRIJHEIDSLEEFTIJD
 * 100,0 jaar" én "DOELBEDRAG €−11.328.971 benodigd" als gewoon resultaat.
 *
 * Mechanisme in de kern (hieronder gereproduceerd, eindstrategie **perpetual**):
 *  - B36 doelbedrag = `Prognose!J@FIRE · (1+i)^(100−FIRE)`. Bij een structureel
 *    tekort is J@FIRE negatief ⇒ **B36 < 0** — het "doelbedrag" uit de bevinding.
 *  - De horizon-check kan hier per constructie niet ingrijpen: op fireAge = 100
 *    valt B36 samen met B37, dus B38 (gap) is exact 0 en de bisectie loopt door
 *    tot de horizon-parkeerstand fireAge = 100.
 *  - B93 toetst dan `J(0) ≥ B36`; met een negatieve B36 is dat vrijwel altijd
 *    waar ⇒ status `reached_now`. `bridge.ts` leidt daaruit
 *    `fireReachable = status !== 'unreachable_within_horizon'` = true af en geeft
 *    `fireAgeFractional = 100` door. Zo werd de parkeerstand een "antwoord".
 *
 * De fix is een INERT-BY-DEFAULT `KernelInput`-vlag
 * (`reachedNowVereistBereikbaarDoel`, gap-besluit V21): het fixture-/parity-pad
 * laat 'm weg → Excel v5-oracle byte-identiek; de app-adapter zet 'm aan. Met de
 * vlag mag `reached_now` niet meer vallen op een doel dat er niet is: B36 < 0 óf
 * B38 < 0 (de verhulde parkeerstand) ⇒ `unreachable_within_horizon`.
 *
 * Deze suite pint drie dingen vast: het defect zonder vlag (zodat de bewuste
 * oracle-afwijking zichtbaar blijft), de fix mét vlag t/m de bridge, en de
 * niet-regressie op een profiel dat écht al vrij is.
 */

import { describe, it, expect } from 'vitest'
import { buildKernelInputFromAppWithNotices } from '@/lib/horizon-kernel/adapter'
import { solveFire } from '@/lib/horizon-kernel/solver'
import { kernelToUnifiedResult, buildKernelSlotMeta } from '@/lib/horizon-kernel/bridge'
import { deriveEigenHuisIds } from '@/lib/horizon-kernel/adapter/potten'
import { MAX_AGE, type KernelInput } from '@/lib/horizon-kernel/types'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'

const POT_RULES = {
  surplus_group: 'spaargeld',
  deficit_order_groups: ['spaargeld', 'beleggingen', 'overig', 'pensioen', 'vastgoed'],
  withdrawal_order_groups: ['spaargeld', 'beleggingen', 'overig', 'pensioen', 'vastgoed'],
}

/**
 * Structureel tekort: een klein liquide saldo naast uitgaven die het inkomen ruim
 * overtreffen. Geen woning, geen AOW-event — precies het "leeg/onvolledig
 * profiel" uit de bevinding.
 */
const tekortAssets: Asset[] = [
  { id: 'a1', name: 'Betaalrekening', asset_type: 'cash', current_value: 1200, expected_return: 0, monthly_contribution: 0, is_active: true } as unknown as Asset,
]
const geenSchulden: Debt[] = []
const geenEvents: LifeEvent[] = []

function profiel(over: Record<string, unknown> = {}, assets: Asset[] = tekortAssets) {
  return {
    profile: {
      date_of_birth: '1990-01-01',
      net_monthly_income: 900,
      estimated_monthly_expenses: 3200,
      yearly_essential_expenses: 38400,
      expected_return: 0.07,
      inflation_rate: 0.02,
      box3_method: 'forfaitair',
      marginaal_tarief: 0.495,
      fire_end_strategy: 'perpetual',
      fire_end_age: 90,
      fire_legacy_amount: null,
      feature_preferences: { horizon_kernel_convergentie: true },
      withdrawal_strategy: 'static',
      guardrail_floor: 0.8,
      guardrail_ceiling: 1.2,
      guardrail_cut_step: 0.1,
      guardrail_raise_step: 0.1,
      housing_strategy_config: null,
      pot_rules: POT_RULES,
      retirement_expense_method: 'essential_budgets',
      retirement_custom_amount: null,
      ...over,
    },
    assets,
    debts: geenSchulden,
    lifeEvents: geenEvents,
  }
}

/** Ruim vermogen, lage uitgaven: écht al vrij — de legitieme `reached_now`. */
const vrijAssets: Asset[] = [
  { id: 'a1', name: 'Betaalrekening', asset_type: 'cash', current_value: 50000, expected_return: 0, monthly_contribution: 0, is_active: true } as unknown as Asset,
  { id: 'a2', name: 'Beleggingen', asset_type: 'investment', current_value: 1_500_000, expected_return: 7, monthly_contribution: 0, is_active: true } as unknown as Asset,
]

function bouw(adapterInput: unknown): KernelInput {
  return buildKernelInputFromAppWithNotices(adapterInput as never).input
}

/** Zonder de vlag = exact het Excel v5-oracle-gedrag (fixture-/parity-pad). */
function zonderVangrail(input: KernelInput): KernelInput {
  return { ...input, reachedNowVereistBereikbaarDoel: undefined }
}

function naarUnified(input: KernelInput, assets: Asset[]) {
  const solve = solveFire(input)
  const meta = buildKernelSlotMeta(assets, geenSchulden, deriveEigenHuisIds(assets))
  return kernelToUnifiedResult(solve, {
    input,
    yearlyExpenses: 38400,
    assetSlotMeta: meta.assetSlotMeta,
    debtSlotMeta: meta.debtSlotMeta,
  })
}

describe('M6 · reached_now mag geen onbereikbaar doel maskeren', () => {
  it('de app-adapter zet de vangrail AAN (parity-/fixture-pad doet dat niet)', () => {
    expect(bouw(profiel()).reachedNowVereistBereikbaarDoel).toBe(true)
  })

  it('DEFECT zonder vlag (Excel v5): negatief doelbedrag + parkeerstand → vals reached_now op leeftijd 100', () => {
    const solve = solveFire(zonderVangrail(bouw(profiel())))
    // De precondities van de bevinding — valt één hiervan weg, dan dekt deze
    // suite de bug niet meer en moet het profiel bijgesteld worden.
    expect(solve.doelbedrag).toBeLessThan(0) // "DOELBEDRAG €−… benodigd"
    expect(solve.fireAge).toBe(MAX_AGE) // "VRIJHEIDSLEEFTIJD 100,0 jaar"
    expect(solve.status).toBe('reached_now') // ← de maskering
  })

  it('FIX met vlag: dezelfde invoer levert unreachable_within_horizon', () => {
    const solve = solveFire(bouw(profiel()))
    expect(solve.doelbedrag).toBeLessThan(0)
    expect(solve.status).toBe('unreachable_within_horizon')
  })

  it('FIX doorgeleid naar de bridge: géén vrijheidsleeftijd i.p.v. 100', () => {
    const unified = naarUnified(bouw(profiel()), tekortAssets)
    expect(unified.fireReachable).toBe(false)
    expect(unified.fireAgeFractional).toBeNull()
    expect(unified.fireAge).toBeNull()
    // Zonder de fix zou de bridge hier 100 doorgeven (zie de defect-test hierboven).
    const kaal = naarUnified(zonderVangrail(bouw(profiel())), tekortAssets)
    expect(kaal.fireAgeFractional).toBe(MAX_AGE)
  })

  it('bridge markeert de eind-horizon-terugval expliciet (geen stil "benodigd" bedrag)', () => {
    const unified = naarUnified(bouw(profiel()), tekortAssets)
    // De vlag MOET gezet zijn (true of false) zodat de weergavelaag hem kan lezen
    // i.p.v. te moeten raden of dit bedrag een FIRE-doel of een eindstand is.
    expect(typeof unified.requiredFireIsEndOfHorizonFallback).toBe('boolean')
  })

  it('een gap < 0 (legacy-doel buiten bereik) blijft gewoon unreachable — met én zonder vlag', () => {
    const legacy = profiel({ fire_end_strategy: 'legacy', fire_legacy_amount: 100000 })
    expect(solveFire(bouw(legacy)).status).toBe('unreachable_within_horizon')
    expect(solveFire(zonderVangrail(bouw(legacy))).status).toBe('unreachable_within_horizon')
  })

  it('NIET-REGRESSIE: écht al vrij (gap ≥ 0, doel ≥ 0) houdt reached_now, mét vlag', () => {
    const vrij = profiel(
      { net_monthly_income: 4000, estimated_monthly_expenses: 1500, yearly_essential_expenses: 18000, fire_end_strategy: 'deplete' },
      vrijAssets,
    )
    const input = bouw(vrij)
    const solve = solveFire(input)
    expect(solve.doelbedrag).toBeGreaterThanOrEqual(0)
    expect(solve.gap).toBeGreaterThanOrEqual(0)
    expect(solve.status).toBe('reached_now')
    // De vlag verandert daar niets aan.
    expect(solveFire(zonderVangrail(input)).status).toBe('reached_now')
  })
})
