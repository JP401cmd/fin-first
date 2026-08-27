/**
 * Scalar-router (FASE 6 stap 5A — kernel-onvoorwaardelijk) — tests.
 *
 * Dekt de drie resterende lagen (de vroegere vlag-uit-byte-identiteitstests tegen de
 * rauwe scalar-helper zijn vervallen — er is geen schakelaar meer; die dekking wordt
 * volledig overgenomen door de "scalar-fallback == de helper direct"-assertie die elke
 * gate-test hieronder al deed):
 *  1. mapping-unit-tests: scalar-params → verwachte synthetische adapter-invoer;
 *  2. gates + crash-vangnet (kern kan geen tijdas bouwen ⇒ `engine: 'scalar-fallback'`,
 *     resultaat = de rauwe scalar-formule);
 *  3. indicatieve vergelijkings-rooktest op drie profielen — waarden MOGEN
 *     verschillen van de vroegere v2-engine; we asserteren vorm + monotonie (meer
 *     sparen ⇒ niet-latere FIRE; hoger rendement ⇒ niet-latere FIRE).
 */

import { describe, expect, it } from 'vitest'
import {
  buildScalarAdapterInput,
  computeScalarFireProjection,
  computeScalarFireRange,
  computeScalarFreedomMilestones,
  type ScalarFireParams,
} from './scalar-router'
import {
  ageAtDate,
  computeFireProjection,
  computeFireRange,
  type FinancialInput,
} from '@/lib/horizon-data'
import { computeFreedomMilestones } from '@/lib/freedom-milestones'
import { DEFAULT_RETURN, INFLATION } from '@/lib/constants'

// Deterministische leeftijd (~40) relatief aan "nu", zoals de household-router-tests.
const THIS_YEAR = new Date().getFullYear()
const DOB_40 = `${THIS_YEAR - 40}-01-15`

function makeInput(overrides: Partial<FinancialInput> = {}): FinancialInput {
  return {
    totalAssets: 120_000,
    totalDebts: 20_000,
    monthlyIncome: 4_000,
    monthlyExpenses: 2_500,
    monthlyContributions: 0,
    yearlyMustExpenses: 0,
    dateOfBirth: DOB_40,
    ...overrides,
  }
}

function makeParams(overrides: Partial<ScalarFireParams> = {}): ScalarFireParams {
  return {
    input: makeInput(),
    annualReturn: 0.07,
    swrOverride: 0.035,
    inflationOverride: 0.02,
    strategyOptions: { strategy: 'deplete', endAge: 90 },
    ...overrides,
  }
}

// ── 1. Mapping: scalar-params → synthetische adapter-invoer ──────────────────

describe('buildScalarAdapterInput — mapping', () => {
  it('mapt inkomen/uitgaven/grondslag naar het synthetische profiel (essential_budgets-injectie)', () => {
    const adapter = buildScalarAdapterInput(makeParams())
    expect(adapter.profile.date_of_birth).toBe(DOB_40)
    expect(adapter.profile.net_monthly_income).toBe(4_000)
    expect(adapter.profile.estimated_monthly_expenses).toBe(2_500)
    // Geen must-uitgaven → grondslag = maanduitgaven × 12 (computeEffectiveExpenses).
    expect(adapter.profile.yearly_essential_expenses).toBe(30_000)
    expect(adapter.profile.retirement_expense_method).toBe('essential_budgets')
  })

  it('must-uitgaven > 0 winnen als grondslag (zelfde regel als de scalar-helper)', () => {
    const adapter = buildScalarAdapterInput(
      makeParams({ input: makeInput({ yearlyMustExpenses: 24_000 }) }),
    )
    expect(adapter.profile.yearly_essential_expenses).toBe(24_000)
  })

  it('bouwt één Beleggingen-pot: waarde = assets − debts, rendement = annualReturn', () => {
    const adapter = buildScalarAdapterInput(makeParams())
    expect(adapter.assets).toHaveLength(1)
    const pot = adapter.assets[0]
    expect(pot.asset_type).toBe('investment')
    expect(pot.current_value).toBe(100_000) // 120k − 20k gesaldeerd
    expect(pot.expected_return).toBeCloseTo(7, 10) // Asset.expected_return is een jaar-%
    expect(pot.is_active).toBe(true)
    // Schulden zijn gesaldeerd; geen events/AOW (lege lijsten = AOW €0 in de adapter).
    expect(adapter.debts).toHaveLength(0)
    expect(adapter.lifeEvents).toHaveLength(0)
    expect(adapter.aowRows).toHaveLength(0)
  })

  it('strategie mapt 1-op-1; zonder strategyOptions is de default perpetual (NIET de adapter-default deplete)', () => {
    const expliciet = buildScalarAdapterInput(makeParams({
      strategyOptions: { strategy: 'legacy', endAge: 85, legacyAmount: 50_000 },
    }))
    expect(expliciet.profile.fire_end_strategy).toBe('legacy')
    expect(expliciet.profile.fire_end_age).toBe(85)
    expect(expliciet.profile.fire_legacy_amount).toBe(50_000)

    const zonder = buildScalarAdapterInput(makeParams({ strategyOptions: undefined }))
    expect(zonder.profile.fire_end_strategy).toBe('perpetual')
    expect(zonder.profile.fire_legacy_amount).toBe(0)
  })

  it('rendement/inflatie: expliciet doorgegeven, weggelaten → helper-defaults', () => {
    const expliciet = buildScalarAdapterInput(makeParams())
    expect(expliciet.profile.expected_return).toBe(0.07)
    expect(expliciet.profile.inflation_rate).toBe(0.02)

    const defaults = buildScalarAdapterInput(
      makeParams({ annualReturn: undefined, inflationOverride: undefined }),
    )
    // null → resolveFireParams valt op DEFAULT_RETURN/INFLATION terug (zelfde defaults
    // als de helper-signatuur); het pot-rendement spiegelt DEFAULT_RETURN direct.
    expect(defaults.profile.expected_return).toBeNull()
    expect(defaults.profile.inflation_rate).toBeNull()
    expect(defaults.assets[0].expected_return).toBeCloseTo(DEFAULT_RETURN * 100, 10)
  })

  it('Box 3 blijft op de kernel-default (forfaitair) — zie de module-doc-redenering', () => {
    const adapter = buildScalarAdapterInput(makeParams())
    expect(adapter.profile.box3_method).toBeNull() // → forfaitair via resolveFireParams
  })
})

// ── 2. Gates + crash-vangnet: scalar-fallback ────────────────────────────────

describe('gates — scalar-fallback (resultaat = de rauwe helper)', () => {
  it('geen geboortedatum → schone scalar-fallback met reden (resultaat = de helper)', () => {
    const params = makeParams({ input: makeInput({ dateOfBirth: null }) })
    const direct = computeFireProjection(
      params.input,
      params.annualReturn,
      params.swrOverride,
      params.inflationOverride,
      params.strategyOptions,
    )
    const outcome = computeScalarFireProjection(params)
    expect(outcome.engine).toBe('scalar-fallback')
    expect(outcome.fallbackReason).toMatch(/geboortedatum/)
    expect(outcome.result).toEqual(direct)
  })

  it('negatief netto vermogen → scalar-fallback met reden', () => {
    const params = makeParams({ input: makeInput({ totalAssets: 10_000, totalDebts: 50_000 }) })
    const outcome = computeScalarFireProjection(params)
    expect(outcome.engine).toBe('scalar-fallback')
    expect(outcome.fallbackReason).toMatch(/negatief netto vermogen/)
  })

  it('band: gate-terugval geldt voor de HELE band (geen engine-mix)', () => {
    const params = makeParams({ input: makeInput({ dateOfBirth: null }) })
    const direct = computeFireRange(
      params.input,
      params.swrOverride,
      params.inflationOverride,
      params.annualReturn,
      params.strategyOptions,
    )
    const outcome = computeScalarFireRange(params)
    expect(outcome.engine).toBe('scalar-fallback')
    expect(outcome.fallbackReason).toMatch(/geboortedatum/)
    expect(outcome.result).toEqual(direct)
  })

  it('mijlpalen: geen geboortedatum → scalar-fallback met reden', () => {
    const outcome = computeScalarFreedomMilestones({
      netWorth: 50_000, monthlyExpenses: 2_500, monthlySavings: 1_500,
    })
    expect(outcome.engine).toBe('scalar-fallback')
    expect(outcome.fallbackReason).toMatch(/geboortedatum/)
    expect(outcome.result).toEqual(computeFreedomMilestones(50_000, 2_500, 1_500))
  })

  it('milestones met helper-defaults (weggelaten optionele params) blijven identiek op de fallback', () => {
    const direct = computeFreedomMilestones(50_000, 2_500, 1_500)
    const outcome = computeScalarFreedomMilestones({ netWorth: 50_000, monthlyExpenses: 2_500, monthlySavings: 1_500 })
    expect(outcome.result).toEqual(direct)
  })
})

// ── 3. Kernel-tak: vorm + statische velden + monotonie-rooktest ──────────────

const SOLVER_STATUSES = ['reached_now', 'reached_at', 'unreachable_within_horizon', 'pension_shortfall']

describe('kernel-tak', () => {
  it('draait op de kernel met een solver-status; statische weergavevelden blijven de scalar-formules', () => {
    const params = makeParams()
    const outcome = computeScalarFireProjection(params)
    expect(outcome.engine).toBe('kernel')
    expect(outcome.fallbackReason).toBeUndefined()
    expect(SOLVER_STATUSES).toContain(outcome.kernelStatus)

    // Alleen de tijd-velden komen uit de kernel; de ratio-/weergavevelden zijn
    // per constructie identiek aan de scalar-uitkomst.
    const v2 = computeFireProjection(
      params.input,
      params.annualReturn,
      params.swrOverride,
      params.inflationOverride,
      params.strategyOptions,
    )
    expect(outcome.result.fireTarget).toBe(v2.fireTarget)
    expect(outcome.result.netWorth).toBe(v2.netWorth)
    expect(outcome.result.freedomPercentage).toBe(v2.freedomPercentage)
    expect(outcome.result.monthlySavings).toBe(v2.monthlySavings)
    expect(outcome.result.savingsRate).toBe(v2.savingsRate)
    expect(outcome.result.monthlyPassiveIncome).toBe(v2.monthlyPassiveIncome)
    expect(outcome.result.freedomYears).toBe(v2.freedomYears)
    expect(outcome.result.freedomMonths).toBe(v2.freedomMonths)
    expect(outcome.result.currentAge).toBe(v2.currentAge)

    // Vorm van de tijd-velden.
    if (outcome.result.fireAge !== null) {
      expect(outcome.result.fireAge).toBeGreaterThanOrEqual(40)
      expect(outcome.result.fireAge).toBeLessThanOrEqual(100)
      expect(outcome.result.countdownDays).toBeGreaterThanOrEqual(0)
    } else {
      expect(outcome.result.fireDate).toBe('Niet haalbaar')
    }
  })

  it('onhaalbaar profiel → "Niet haalbaar" met lege countdown', () => {
    // Legacy-doel dat ook op de horizon niet gehaald wordt → gap < 0 (parkeerstand).
    // (Perpetual/deplete zijn op de horizon-check per constructie vrijwel altijd
    // haalbaar — FIRE op 100 betekent immers "nooit onttrekken".)
    const params = makeParams({
      input: makeInput({
        totalAssets: 5_000,
        totalDebts: 0,
        monthlyIncome: 2_510,
        monthlyExpenses: 2_500,
      }),
      strategyOptions: { strategy: 'legacy', endAge: 90, legacyAmount: 100_000_000 },
    })
    const outcome = computeScalarFireProjection(params)
    expect(outcome.engine).toBe('kernel')
    expect(outcome.kernelStatus).toBe('unreachable_within_horizon')
    expect(outcome.result.fireAge).toBeNull()
    expect(outcome.result.fireDate).toBe('Niet haalbaar')
    expect(outcome.result.countdownDays).toBe(0)
    expect(outcome.result.countdownYears).toBe(0)
    expect(outcome.result.countdownMonths).toBe(0)
  })

  it('rooktest (3 profielen): meer sparen ⇒ niet-latere FIRE-leeftijd op de kernel', () => {
    // Drie profielen die alleen in spaarcapaciteit verschillen.
    const zuinig = makeParams({ input: makeInput({ monthlyIncome: 5_500 }) }) // €3.000/mnd sparen
    const midden = makeParams({ input: makeInput({ monthlyIncome: 4_000 }) }) // €1.500/mnd sparen
    const krap = makeParams({ input: makeInput({ monthlyIncome: 3_100 }) })   // €600/mnd sparen

    const ages = [zuinig, midden, krap].map((p) => {
      const o = computeScalarFireProjection(p)
      expect(o.engine).toBe('kernel')
      return o.result.fireAge
    })
    // Vorm: elke uitkomst is óf een leeftijd in [40, 100] óf null (onhaalbaar).
    for (const age of ages) {
      if (age !== null) {
        expect(age).toBeGreaterThanOrEqual(40)
        expect(age).toBeLessThanOrEqual(100)
      }
    }
    // Monotonie: meer sparen ⇒ niet-latere FIRE (null = onhaalbaar = "oneindig laat").
    const asOrd = (a: number | null) => (a === null ? Number.POSITIVE_INFINITY : a)
    expect(asOrd(ages[0])).toBeLessThanOrEqual(asOrd(ages[1]))
    expect(asOrd(ages[1])).toBeLessThanOrEqual(asOrd(ages[2]))
  })

  it('band: hoger rendement ⇒ niet-latere FIRE-leeftijd (optimistisch ≤ verwacht ≤ pessimistisch)', () => {
    const outcome = computeScalarFireRange(makeParams())
    expect(outcome.engine).toBe('kernel')
    const asOrd = (a: number | null) => (a === null ? Number.POSITIVE_INFINITY : a)
    expect(asOrd(outcome.result.optimistic.fireAge)).toBeLessThanOrEqual(
      asOrd(outcome.result.expected.fireAge),
    )
    expect(asOrd(outcome.result.expected.fireAge)).toBeLessThanOrEqual(
      asOrd(outcome.result.pessimistic.fireAge),
    )
  })

  it('band: elk scenario draagt zijn eigen offset-rendement [base+0.02, base, base−0.03] (geklemd)', () => {
    const outcome = computeScalarFireRange(makeParams({ annualReturn: 0.07 }))
    expect(outcome.result.optimistic.annualReturn).toBeCloseTo(0.09, 10)
    expect(outcome.result.expected.annualReturn).toBeCloseTo(0.07, 10)
    expect(outcome.result.pessimistic.annualReturn).toBeCloseTo(0.04, 10)
  })

  it('band: pessimistisch rendement wordt geklemd op ondergrens 0.01', () => {
    const outcome = computeScalarFireRange(makeParams({ annualReturn: 0.02 }))
    // 0.02 − 0.03 = −0.01 → geklemd naar 0.01.
    expect(outcome.result.pessimistic.annualReturn).toBeCloseTo(0.01, 10)
    expect(outcome.result.expected.annualReturn).toBeCloseTo(0.02, 10)
    expect(outcome.result.optimistic.annualReturn).toBeCloseTo(0.04, 10)
  })

  it('deplete: fireAge is de bisectie-uitkomst (echte spend-down-maand), niet de huidige leeftijd', () => {
    // B93-doel=0-quirk: bij 'deplete' is het doelbedrag 0 → de solver-status is
    // triviaal 'reached_now', maar de bisectie vindt wél een echte FIRE-maand.
    // De router hoort die maand te tonen (weergave-regel als
    // bridge.ts#isKernelReachedNowDisplay), niet "nu al bereikt".
    // Profiel: €100k pot, €1.500/mnd sparen, €30k/jr uitgaven, deplete tot 90 —
    // overduidelijk NIET nu al vol te houden tot 90.
    const outcome = computeScalarFireProjection(makeParams())
    expect(outcome.engine).toBe('kernel')
    expect(outcome.kernelStatus).toBe('reached_now') // kern blijft Excel-exact
    expect(outcome.result.fireAge).not.toBeNull()
    expect(outcome.result.fireAge!).toBeGreaterThan(45) // ruim ná de huidige leeftijd (~40)
    expect(outcome.result.fireAge!).toBeLessThan(90)
    expect(outcome.result.fireDate).not.toBe('Bereikt!')
  })

  it('deplete met ruim toereikende pot: "nu al bereikt" blijft de huidige leeftijd', () => {
    // Genuine reached-now: de bisectie landt op start + 1 maand → weergave = huidige
    // leeftijd ("Bereikt!" via deriveCountdown). Dit gedrag mag de quirk-fix niet raken.
    const outcome = computeScalarFireProjection(
      makeParams({ input: makeInput({ totalAssets: 5_000_000, totalDebts: 0 }) }),
    )
    expect(outcome.engine).toBe('kernel')
    // Exact currentAge (ageAtDate), níet start + 1 maand — dat onderscheidt de
    // "echt nu bereikt"-weergave van een doorgegeven bisectie-maand.
    expect(outcome.result.fireAge).toBe(ageAtDate(DOB_40))
    expect(outcome.result.fireDate).toBe('Bereikt!')
  })

  it('deplete die structureel ontspaart: fireAge landt ná de eindleeftijd, niet op "Bereikt!"', () => {
    // Uitgaven > inkomen met een minipot: geen enkele FIRE-maand vóór de eindleeftijd
    // draagt de afbouw — de bisectie landt dan nét ná de eindleeftijd (≈ endAge + 1
    // maand; de tekort-lening houdt Prognose!J op de vloer, dus gap ≥ 0). De doel=0-
    // quirk verhulde dit vóór de weergave-regel als "nu al bereikt" (fireAge = 40).
    // NB — OPEN BESLUIT (geen gewenst-gedrag-pin): of "fireAge ≥ eindleeftijd" als
    // "Niet haalbaar" getoond moet worden is een nog niet genomen weergave-besluit
    // (zelfde procedure als de gap-besluiten); deze test pint alléén dat het geen
    // "Bereikt!" meer is. Wordt dat besluit genomen, herijk dan deze verwachting.
    const outcome = computeScalarFireProjection(
      makeParams({
        input: makeInput({
          totalAssets: 5_000,
          totalDebts: 0,
          monthlyIncome: 2_500,
          monthlyExpenses: 3_000,
        }),
      }),
    )
    expect(outcome.engine).toBe('kernel')
    expect(outcome.result.fireAge).not.toBeNull()
    expect(outcome.result.fireAge!).toBeGreaterThanOrEqual(90) // ná de deplete-eindleeftijd
    expect(outcome.result.fireDate).not.toBe('Bereikt!')
  })

  it('deplete op de horizon-eindleeftijd met structureel tekort: verhulde parkeerstand → "Niet haalbaar"', () => {
    // Met endAge = 100 valt de eindleeftijd samen met de horizon: de bisectie kan
    // niet meer "voorbij" de eindleeftijd ontsnappen en de gap wordt negatief.
    //
    // BIJGEWERKT bij bevinding M6 (26-08-2026): dit was de plek waar de verhulde
    // parkeerstand ALLEEN in de weergave werd rechtgezet — de kern meldde nog
    // 'reached_now' (de doel=0-quirk) en alleen de scalar-router zag daar doorheen.
    // De kernel doet dat nu zelf op het app-pad (KernelInput
    // .reachedNowVereistBereikbaarDoel, gap-besluit V21): een reached_now met
    // gap < 0 of een negatief doelbedrag valt bij de bron op
    // 'unreachable_within_horizon'. De UITKOMST is ongewijzigd (fireAge null,
    // "Niet haalbaar", 0 dagen) — alleen de laag waar het wordt opgelost verschoof.
    // De weergave-tak in de router blijft staan als tweede linie voor invoer
    // zónder de vlag (parity-/fixture-pad); zie lib/horizon-kernel/
    // onmogelijke-uitkomst.test.ts voor de kernel-kant.
    const outcome = computeScalarFireProjection(
      makeParams({
        input: makeInput({
          totalAssets: 5_000,
          totalDebts: 0,
          monthlyIncome: 2_500,
          monthlyExpenses: 3_500,
        }),
        strategyOptions: { strategy: 'deplete', endAge: 100 },
      }),
    )
    expect(outcome.engine).toBe('kernel')
    // Kern lost het nu bij de bron op; de router hoeft er niet meer doorheen te kijken.
    expect(outcome.kernelStatus).toBe('unreachable_within_horizon')
    expect(outcome.result.fireAge).toBeNull()
    expect(outcome.result.fireDate).toBe('Niet haalbaar')
    expect(outcome.result.countdownDays).toBe(0)
  })

  it('mijlpalen op de kernel: zelfde doel-/weergavesemantiek, monotone maanden', () => {
    const params = {
      netWorth: 100_000,
      monthlyExpenses: 2_000,
      monthlySavings: 2_500,
      annualReturn: 0.07,
      inflationRate: INFLATION,
      dateOfBirth: DOB_40,
    }
    const outcome = computeScalarFreedomMilestones(params)
    expect(outcome.engine).toBe('kernel')

    const v2 = computeFreedomMilestones(
      params.netWorth,
      params.monthlyExpenses,
      params.monthlySavings,
      params.annualReturn,
      params.inflationRate,
    )
    // Doel + huidige stand zijn scalar-semantiek en dus identiek aan v2.
    expect(outcome.result.currentFreedomPct).toBe(v2.currentFreedomPct)
    expect(outcome.result.milestones.map((m) => m.targetNetWorth)).toEqual(
      v2.milestones.map((m) => m.targetNetWorth),
    )
    // Maanden: monotoon niet-dalend over de percentages (waar bereikbaar).
    const months = outcome.result.milestones
      .map((m) => m.monthsAway)
      .filter((m): m is number => m !== null)
    for (let i = 1; i < months.length; i++) {
      expect(months[i]).toBeGreaterThanOrEqual(months[i - 1])
    }
    expect(outcome.result.milestones).toHaveLength(4)
  })
})
