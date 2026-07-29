import { describe, it, expect } from 'vitest'
import {
  computeConvergentieProjection,
  type ConvergentieRawContext,
} from '@/lib/horizon-kernel/convergentie-router'
import { buildSliderEvent } from '@/lib/scenario-events'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'

/**
 * NORM-FINGERPRINT van het eigenaarsbesluit 2026-07-29: "de spaarquote-slider moet
 * FIRE-gegate zijn, NET ALS de inkomen-, werkdagen- en extra-inleg-slider".
 *
 * Deze suite meet die norm rechtstreeks en TOLERANTIE-VRIJ: een spaarquote-slider die
 * €X/maand aan spaarruimte oplevert moet exact dezelfde projectie geven als een
 * inkomen-slider (of extra-inleg-slider) die diezelfde €X/maand oplevert. Sparen =
 * inkomen − uitgaven, dus pre-FIRE zijn beide routes rekenkundig identiek; ná FIRE
 * gate't het salaris-kanaal ze allebei weg.
 *
 * TOLERANTIE-KEUZE: **byte-gelijkheid** (`toStrictEqual` op de rijen, `toBe` op de
 * scalairen), geen absolute of relatieve marge. Beide runs lopen door dezelfde kern met
 * dezelfde `salarisDeltaPerMaand`; er is per constructie geen bron van drift, dus élk
 * verschil is een echte routerings-afwijking. Een €-marge zou hier juist de foutklasse
 * verbergen die deze suite moet vangen.
 *
 * VÓÓR de fix zou dit ROOD zijn: de spaarquote-slider liep als vrije Geb-rij (permanente
 * kostenverlaging tot het einde van de horizon) → een ~€279k lager `requiredFirePortfolio`
 * dan de inkomen-slider.
 *
 * Aanvullend op `scenario-slider-gate-savings.test.ts` (het lek-fingerprint) en
 * `scenario-slider-gate.test.ts` (de CF!H-fingerprint van income/extra_inleg).
 */

const PINNED_AGE = 42
/** Spaarquote-delta in procentpunt; met €7.600 netto/maand = €760/maand spaarruimte. */
const DELTA_PP = 10

function buildPreFireContext(): { ctx: ConvergentieRawContext; whatIfBaseline: WhatIfOverrides } {
  const fx = buildCompleetHorizonFixture(PINNED_AGE)
  const profile = buildCompleetKernelProfileBase(PINNED_AGE)
  const ctx: ConvergentieRawContext = {
    profile,
    // 10%-geschaalde bezittingen ⇒ een echte meerjarige opbouwfase (FIRE ≈ 54,7).
    assets: fx.assets.map((a) => ({ ...a, current_value: a.current_value * 0.1 })),
    debts: fx.debts,
    lifeEvents: fx.lifeEvents,
    aowRows: [],
    yearlyExpenses: fx.financialInput.yearlyMustExpenses,
  }
  const whatIfBaseline: WhatIfOverrides = {
    monthlyIncome: profile.net_monthly_income ?? 0,
    workDaysPerWeek: 5,
    savingsRate: 0,
    expectedReturn: (profile.expected_return ?? 0.07) * 100,
    extraContribution: 0,
  }
  return { ctx, whatIfBaseline }
}

describe('spaarquote-slider — gedraagt zich exact als de inkomen-/extra-inleg-slider', () => {
  it('gelijke €/maand spaarruimte ⇒ identieke projectie voor savings, income én extra_inleg', () => {
    const { ctx, whatIfBaseline } = buildPreFireContext()
    const run = (extra: unknown) =>
      computeConvergentieProjection({
        rawContext: { ...ctx, lifeEvents: [...ctx.lifeEvents, extra as never] },
      })

    const savingsEvent = buildSliderEvent('savings', DELTA_PP, whatIfBaseline, PINNED_AGE)
    expect(savingsEvent).not.toBeNull()
    // De spaarquote-slider draagt z'n bedrag bewust op `monthly_cost_change` (round-trip-shape).
    const eurPerMaand = -savingsEvent!.monthly_cost_change
    expect(eurPerMaand).toBeGreaterThan(0)

    const incomeEvent = buildSliderEvent(
      'income',
      (whatIfBaseline.monthlyIncome ?? 0) + eurPerMaand,
      whatIfBaseline,
      PINNED_AGE,
    )
    const inlegEvent = buildSliderEvent('extra_inleg', eurPerMaand, whatIfBaseline, PINNED_AGE)
    expect(incomeEvent!.monthly_income_change).toBe(eurPerMaand)
    expect(inlegEvent!.monthly_income_change).toBe(eurPerMaand)

    const savings = run(savingsEvent!)
    const income = run(incomeEvent!)
    const inleg = run(inlegEvent!)
    expect(savings.ok && income.ok && inleg.ok).toBe(true)
    if (!savings.ok || !income.ok || !inleg.ok) return

    // Sanity: de baseline is écht pre-FIRE en de sliders dóén iets (anders leeg-groen).
    const baseline = computeConvergentieProjection({ rawContext: ctx })
    expect(baseline.ok).toBe(true)
    if (!baseline.ok) return
    expect(baseline.result.fireAgeFractional! - PINNED_AGE).toBeGreaterThan(5)
    expect(savings.result.fireAgeFractional!).toBeLessThan(baseline.result.fireAgeFractional!)

    // ── DE NORM: byte-gelijk aan de al-gegate sliders. ──
    expect(savings.result.fireAgeFractional).toBe(income.result.fireAgeFractional)
    expect(savings.result.requiredFirePortfolio).toBe(income.result.requiredFirePortfolio)
    expect(savings.result.rows).toStrictEqual(income.result.rows)

    expect(savings.result.fireAgeFractional).toBe(inleg.result.fireAgeFractional)
    expect(savings.result.requiredFirePortfolio).toBe(inleg.result.requiredFirePortfolio)
    expect(savings.result.rows).toStrictEqual(inleg.result.rows)
  })
})
