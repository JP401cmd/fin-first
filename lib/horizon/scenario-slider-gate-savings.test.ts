import { describe, it, expect } from 'vitest'
import {
  computeConvergentieProjection,
  type ConvergentieRawContext,
} from '@/lib/horizon-kernel/convergentie-router'
import { buildSliderEvent } from '@/lib/scenario-events'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'
import type { LifeEvent } from '@/lib/horizon-data'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'

/**
 * REGRESSIE-ANKER van het eigenaarsbesluit 2026-07-29 — de spaarquote-slider is
 * FIRE-gegate, net als `slider:income`/`slider:workdays`/`slider:extra_inleg`
 * (zie `lib/horizon/scenario-slider-gate.test.ts`, het gespiegelde patroon).
 *
 * NORM VAN DE EIGENAAR: spaarquote = het deel van het inkomen dat gespaard wordt.
 * Valt het inkomen weg (bij FIRE/vrijheidsleeftijd), dan vervalt ook het
 * spaarquote-effect. Historie: tot 29-jul stond `slider:savings` bewust NIET in
 * `SLIDER_WORK_ORIGINS` ("een permanente uitgavenwijziging loopt logisch door in
 * de onttrekking") en liep het event als vrije Geb-rij door tot het einde van de
 * horizon — óók in de onttrekkingsfase. Die aanname is door de eigenaar verworpen
 * vóór de slider (échte lifestyle-events zonder slider-origin blijven wél
 * permanent); sindsdien routeert de slider via het FIRE-gegate salaris-kanaal
 * (`guard.ts#SLIDER_WORK_ORIGINS` + `events.ts#sumSalarisDeltaPerMaand`).
 *
 * Deze suite pint het lek-fingerprint: (1) al-vrij profiel → geen effect,
 * (2) geen savings-specifieke doelvertekening (≡ inkomen-slider bij gelijke
 * €/maand), (3) het opbouw-effect vóór FIRE blijft bestaan, (4) échte
 * `lifestyle_adjustment`-events zónder slider-origin blijven bewust permanent.
 */

const PINNED_AGE = 42

/** Absolute tolerantie voor "materieel gelijk" (test 1) — ruim onder de waargenomen
 *  lek-omvang (≈ €2,22M), ruim boven redelijke afrondings-/box3-ruis. */
const MATERIALITY_TOLERANCE_EUR = 5_000

/** Basiscontext: de "Tessa Compleet"-persona op leeftijd 42 (ongewijzigd asset-schaal). */
function buildBaseContext(): { ctx: ConvergentieRawContext; whatIfBaseline: WhatIfOverrides } {
  const fx = buildCompleetHorizonFixture(PINNED_AGE)
  const profile = buildCompleetKernelProfileBase(PINNED_AGE)
  const ctx: ConvergentieRawContext = {
    profile,
    assets: fx.assets,
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

describe('scenario slider-werk-gate — savings (spaarquote) mist de FIRE-gate', () => {
  it('AL-VRIJ PROFIEL → geen effect: baseline en scenario zijn materieel gelijk in de onttrekkingsfase', () => {
    // "Tessa Compleet" op leeftijd 42 heeft, ONGEWIJZIGD, al een netto vermogen dat
    // vrijwel gelijk is aan het vereiste FIRE-doelbedrag: de solver plaatst
    // `fireAgeFractional` binnen de eerste maand (≈ 42,083 — géén losse "al-vrij"-
    // fixture nodig, dit IS het al-vrije profiel). 58 van de 59 rijen zijn dus
    // `withdrawal` — precies de fase waarin het spaarquote-effect NIET meer zou
    // mogen doorwerken (er is geen looninkomen meer om spaarquote op toe te passen).
    const { ctx: baseContext, whatIfBaseline } = buildBaseContext()
    const baseline = computeConvergentieProjection({ rawContext: baseContext })
    expect(baseline.ok).toBe(true)
    if (!baseline.ok) return
    expect(baseline.result.fireReachable).toBe(true)
    expect(baseline.result.fireAgeFractional).not.toBeNull()
    // Sanity: dit profiel is al (vrijwel) vanaf de start vrij — de fixture-keuze klopt.
    expect(baseline.result.fireAgeFractional! - PINNED_AGE).toBeLessThan(0.5)
    const withdrawalRowsBaseline = baseline.result.rows.filter((r) => r.phase === 'withdrawal')
    expect(withdrawalRowsBaseline.length).toBeGreaterThan(baseline.result.rows.length / 2)

    const sliderEvent = buildSliderEvent('savings', 10, whatIfBaseline, PINNED_AGE)
    expect(sliderEvent).not.toBeNull()
    expect(sliderEvent!.scenario_origin).toBe('slider:savings')
    expect(sliderEvent!.event_type).toBe('lifestyle_adjustment')
    expect(sliderEvent!.monthly_cost_change).toBeLessThan(0) // uitgave-verlaging (spaarquote omhoog)
    expect(sliderEvent!.duration_months).toBe(0) // permanent — de bron van het lek

    const scenario = computeConvergentieProjection({
      rawContext: { ...baseContext, lifeEvents: [...baseContext.lifeEvents, sliderEvent!] },
    })
    expect(scenario.ok).toBe(true)
    if (!scenario.ok) return

    // ── FALENDE ASSERTIE: geen materieel effect in de onttrekkingsfase. ──
    // Nu (bug): de permanente kostenverlaging stuwt élke withdrawal-rij omhoog →
    // het verschil aan het einde van de horizon is ≈ €2,22M (zie exploratie-run),
    // ver boven de tolerantie.
    let maxAbsDeltaWithdrawal = 0
    let comparedWithdrawalRows = 0
    for (const scRow of scenario.result.rows) {
      const baseRow = baseline.result.rows.find((r) => r.year === scRow.year)
      if (!baseRow || scRow.phase !== 'withdrawal') continue
      comparedWithdrawalRows++
      const delta = Math.abs(scRow.netWorth - baseRow.netWorth)
      if (delta > maxAbsDeltaWithdrawal) maxAbsDeltaWithdrawal = delta
    }
    expect(comparedWithdrawalRows).toBeGreaterThan(0)
    expect(maxAbsDeltaWithdrawal).toBeLessThan(MATERIALITY_TOLERANCE_EUR)

    // Eindvermogen (dezelfde fingerprint, samengevat op de laatste rij).
    const baseEnd = baseline.result.rows[baseline.result.rows.length - 1]!
    const scenEnd = scenario.result.rows[scenario.result.rows.length - 1]!
    expect(Math.abs(scenEnd.netWorth - baseEnd.netWorth)).toBeLessThan(MATERIALITY_TOLERANCE_EUR)
  })

  it('PRE-FIRE PROFIEL → doelbedrag (requiredFirePortfolio) verschuift IDENTIEK aan de inkomen-slider bij gelijke €/maand', () => {
    // Zelfde persona, maar met de bezittingen op 10% geschaald: een genuine
    // meerjarige opbouwfase (`fireAgeFractional` ≈ 54,7 t.o.v. currentAge 42 —
    // ruim 12 jaar pre-FIRE), zodat het doelbedrag en de opbouwfase apart te meten zijn.
    //
    // ── HERFORMULERING 2026-07-29 (orchestrator, op bewijs van de motor-specialist) ──
    // Deze test eiste eerder "requiredFirePortfolio verandert niet materieel" met een
    // absolute €5.000-tolerantie. Dat was een MIS-SPECIFICATIE, geen lek: de solver
    // koppelt het doelbedrag aan de gesolvede FIRE-leeftijd (eerder FIRE ⇒ langere brug
    // tot AOW ⇒ hoger benodigd kapitaal), dus verschuift `requiredFirePortfolio` per
    // constructie mee zodra een slider de opbouw versnelt — inclusief de AL-
    // GEACCORDEERDE inkomen-slider (identieke Δ €/maand geeft byte-identieke fireAge én
    // requiredFirePortfolio, zie de equivalentie-suite). Een schaalreeks van de
    // specialist liet de "delta" zelfs van teken wisselen (+1pp −1.504 · +2pp +4.783 ·
    // +5pp +5.399 · +10pp +20.487) — een echt bestedingslek kan dat niet. Deze test en
    // de oude test 3 (spaarquote versnelt de opbouw) waren dus onderling onverenigbaar.
    //
    // Het échte invariant: de spaarquote-slider veroorzaakt geen SAVINGS-SPECIFIEKE
    // doelvertekening — zijn effect op requiredFirePortfolio (en fireAge) is identiek
    // aan dat van de inkomen-slider bij gelijke €/maand. Getoetst hier op scalairen (in
    // dit bestand-eigen fixture, voor lokale samenhang met test 1/3/4); de volledige
    // tolerantie-vrije rij-voor-rij fingerprint (savings ≡ income ≡ extra_inleg, byte-
    // gelijk) staat in `scenario-slider-gate-savings-equivalentie.test.ts` — bewust geen
    // duplicaat van die `toStrictEqual`-vergelijking hier.
    const { ctx: baseContext, whatIfBaseline } = buildBaseContext()
    const preFireContext: ConvergentieRawContext = {
      ...baseContext,
      assets: baseContext.assets.map((a) => ({ ...a, current_value: a.current_value * 0.1 })),
    }
    const baseline = computeConvergentieProjection({ rawContext: preFireContext })
    expect(baseline.ok).toBe(true)
    if (!baseline.ok) return
    expect(baseline.result.fireReachable).toBe(true)
    // Sanity: dit IS een echt pre-FIRE profiel (jaren van opbouw resterend).
    expect(baseline.result.fireAgeFractional! - PINNED_AGE).toBeGreaterThan(5)

    const savingsEvent = buildSliderEvent('savings', 10, whatIfBaseline, PINNED_AGE)
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
    expect(incomeEvent).not.toBeNull()
    expect(incomeEvent!.monthly_income_change).toBe(eurPerMaand)

    const savingsScenario = computeConvergentieProjection({
      rawContext: { ...preFireContext, lifeEvents: [...preFireContext.lifeEvents, savingsEvent!] },
    })
    const incomeScenario = computeConvergentieProjection({
      rawContext: { ...preFireContext, lifeEvents: [...preFireContext.lifeEvents, incomeEvent!] },
    })
    expect(savingsScenario.ok).toBe(true)
    expect(incomeScenario.ok).toBe(true)
    if (!savingsScenario.ok || !incomeScenario.ok) return

    // ── DE NORM: geen savings-specifieke doelvertekening — exact gelijk aan income. ──
    expect(savingsScenario.result.requiredFirePortfolio).toBe(incomeScenario.result.requiredFirePortfolio)
    expect(savingsScenario.result.fireAgeFractional).toBe(incomeScenario.result.fireAgeFractional)
  })

  it('PRE-FIRE PROFIEL → REGRESSIE-ANKER: spaarquote versnelt wél de opbouw tot FIRE (mag de fix niet doodslaan)', () => {
    const { ctx: baseContext, whatIfBaseline } = buildBaseContext()
    const preFireContext: ConvergentieRawContext = {
      ...baseContext,
      assets: baseContext.assets.map((a) => ({ ...a, current_value: a.current_value * 0.1 })),
    }
    const baseline = computeConvergentieProjection({ rawContext: preFireContext })
    expect(baseline.ok).toBe(true)
    if (!baseline.ok) return
    expect(baseline.result.fireAgeFractional).not.toBeNull()

    const sliderEvent = buildSliderEvent('savings', 10, whatIfBaseline, PINNED_AGE)
    expect(sliderEvent).not.toBeNull()
    const scenario = computeConvergentieProjection({
      rawContext: { ...preFireContext, lifeEvents: [...preFireContext.lifeEvents, sliderEvent!] },
    })
    expect(scenario.ok).toBe(true)
    if (!scenario.ok) return
    expect(scenario.result.fireAgeFractional).not.toBeNull()

    // Meer sparen pre-FIRE ⇒ FIRE niet later dan de basislijn (typisch eerder).
    expect(scenario.result.fireAgeFractional!).toBeLessThanOrEqual(baseline.result.fireAgeFractional!)

    // Positieve controle: in de opbouwfase (vroege jaren) ligt het scenario-vermogen
    // hoger dan de baseline — het spaarquote-effect bestaat wél pre-FIRE.
    const baseRow1 = baseline.result.rows[1]!
    const scenRow1 = scenario.result.rows[1]!
    expect(baseRow1.phase).toBe('accumulation')
    expect(scenRow1.phase).toBe('accumulation')
    expect(scenRow1.netWorth).toBeGreaterThan(baseRow1.netWorth)
  })

  it('ECHT lifestyle_adjustment-event ZONDER scenario_origin blijft permanent (ook ná FIRE) — de slider-herkomst is de enige gate', () => {
    // Zelfde "al-vrij"-context als test 1, maar nu met een event dat GEEN
    // `scenario_origin` draagt (bv. een DB-/gebruikers-lifestyle-event i.p.v. de
    // wat-als-slider). Dat event MOET de onttrekkingsfase blijven raken — alleen de
    // slider-herkomst (`slider:savings`) hoort gegate te worden, niet elk
    // `lifestyle_adjustment`-event.
    const { ctx: baseContext } = buildBaseContext()
    const baseline = computeConvergentieProjection({ rawContext: baseContext })
    expect(baseline.ok).toBe(true)
    if (!baseline.ok) return

    const realLifestyleEvent: LifeEvent = {
      id: 'db-lifestyle-real',
      name: 'Structurele lifestyle-aanpassing',
      event_type: 'lifestyle_adjustment',
      target_age: PINNED_AGE,
      target_date: null,
      one_time_cost: 0,
      monthly_cost_change: -760, // zelfde orde van grootte als de slider-case hierboven
      monthly_income_change: 0,
      duration_months: 0,
      icon: 'PiggyBank',
      is_active: true,
      sort_order: 999,
      is_indexed: true,
      metadata: {},
      // GEEN scenario_origin — dit ONDERSCHEIDT het van een slider-event.
    }

    const scenario = computeConvergentieProjection({
      rawContext: { ...baseContext, lifeEvents: [...baseContext.lifeEvents, realLifestyleEvent] },
    })
    expect(scenario.ok).toBe(true)
    if (!scenario.ok) return

    let maxAbsDeltaWithdrawal = 0
    let comparedWithdrawalRows = 0
    for (const scRow of scenario.result.rows) {
      const baseRow = baseline.result.rows.find((r) => r.year === scRow.year)
      if (!baseRow || scRow.phase !== 'withdrawal') continue
      comparedWithdrawalRows++
      const delta = Math.abs(scRow.netWorth - baseRow.netWorth)
      if (delta > maxAbsDeltaWithdrawal) maxAbsDeltaWithdrawal = delta
    }
    expect(comparedWithdrawalRows).toBeGreaterThan(0)
    // Een écht (niet-slider) lifestyle-event MOET wél materieel doorwerken ná FIRE —
    // ruim boven de materialiteits-tolerantie van de gate-tests hierboven.
    expect(maxAbsDeltaWithdrawal).toBeGreaterThan(MATERIALITY_TOLERANCE_EUR * 10)
  })
})
