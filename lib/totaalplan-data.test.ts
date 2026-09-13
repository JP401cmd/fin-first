import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Aandachtspunt } from '@/lib/aandachtspunten'
import { DEFAULT_VOLATILITY } from '@/lib/constants'
import { toSimResult } from '@/lib/unified-projection'
import { clipRowsToPlanEnd } from '@/lib/horizon/clip-rows-to-plan-end'
import { computeConvergentieProjection, type ConvergentieRawContext } from '@/lib/horizon-kernel/convergentie-router'
import { runMonteCarlo } from '@/lib/horizon-kernel/wrappers/mc'
import {
  assembleTotaalplan,
  buildTotaalplanKernelInput,
  TOTAALPLAN_MC_RUNS,
  type TotaalplanRawInputs,
} from './totaalplan-data'
import {
  buildPersoonlijkPlanSections,
  type PersoonlijkPlanProfileRow,
} from './persoonlijk-plan-assembly'

/**
 * Tests voor de totaalplan-assemblage (`lib/totaalplan-data.ts`). Het contract:
 * "consume, don't recompute" — de projectie komt uit `computeConvergentieProjection`
 * (dezelfde motor als /toekomst) en de slagingskans uit `runMonteCarlo`. Deze
 * suite pint de parity tussen de rapport-uitvoer en directe kernel-aanroepen, plus
 * de lege staat en de inzichten-mapping.
 *
 * Fixture-basis: de "schone input"-persona uit
 * `lib/horizon-kernel/convergentie-router.test.ts` (DOB 1986-01-01, 1 investerings-
 * asset) — een context waarvoor `computeConvergentieProjection` `ok:true` teruggeeft.
 */

const DOB = '1986-01-01'

/**
 * Eén profiel-object dat zowel `PersoonlijkPlanProfileRow` (alle velden verplicht)
 * als `ConvergentieRawProfileRow` (superset, alle velden optioneel) dekt — zodat
 * de aannames-blokken en de kernel-context uit precies dezelfde rauwe rij komen.
 */
const PROFILE: PersoonlijkPlanProfileRow = {
  full_name: 'Test Persoon',
  date_of_birth: DOB,
  household_type: 'single',
  number_of_children: 0,
  net_monthly_income: 4000,
  estimated_monthly_expenses: 2500,
  expected_return: 7,
  inflation_rate: 2,
  fire_end_strategy: 'perpetual',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  retirement_expense_method: 'current_expenses',
  retirement_expense_custom_amount: null,
  withdrawal_strategy: 'static',
  guardrail_floor: null,
  guardrail_ceiling: null,
  guardrail_cut_step: null,
  feature_preferences: null,
}

function makeAssets(): Asset[] {
  return [
    {
      id: 'inv',
      name: 'Beleggingen',
      asset_type: 'investment',
      current_value: 150_000,
      woz_value: null,
      expected_return: 7,
      monthly_contribution: 800,
      is_active: true,
      net_worth_inclusion_pct: 100,
      depreciation_rate: 0,
    },
  ] as unknown as Asset[]
}

/** Kernel-context waarvoor `computeConvergentieProjection` `ok:true` teruggeeft. */
function makeKernelContext(overrides: Partial<ConvergentieRawContext> = {}): ConvergentieRawContext {
  return {
    profile: {
      date_of_birth: PROFILE.date_of_birth,
      net_monthly_income: PROFILE.net_monthly_income,
      estimated_monthly_expenses: PROFILE.estimated_monthly_expenses,
      expected_return: PROFILE.expected_return,
      inflation_rate: PROFILE.inflation_rate,
      box3_method: 'forfaitair',
      fire_end_strategy: PROFILE.fire_end_strategy,
      fire_end_age: PROFILE.fire_end_age,
      fire_legacy_amount: PROFILE.fire_legacy_amount,
      withdrawal_strategy: PROFILE.withdrawal_strategy,
      housing_strategy_config: { mode: 'include_full' },
      retirement_expense_method: PROFILE.retirement_expense_method,
      retirement_expense_custom_amount: PROFILE.retirement_expense_custom_amount,
    },
    assets: makeAssets(),
    debts: [],
    lifeEvents: [],
    aowRows: [],
    yearlyExpenses: 30_000,
    ...overrides,
  }
}

function makeAandachtspunten(): Aandachtspunt[] {
  return [
    { id: 'tax:1', domain: 'tax', title: 'Box 3-kans', savings: 1200, freedomDays: 12, href: '/overzicht/belasting' },
    { id: 'debt:1', domain: 'debt', title: 'Dure lening aflossen', savings: 900, freedomDays: 9, href: '/core/debts' },
    { id: 'budget:1', domain: 'budget', title: 'Abonnement opzeggen', savings: 300, freedomDays: 3, href: '/core/budgets' },
    { id: 'asset:1', domain: 'asset', title: 'Idle cash beleggen', savings: 600, freedomDays: 6, href: '/core/assets' },
    { id: 'tax:2', domain: 'tax', title: 'Aftrekpost missen', savings: 450, freedomDays: 4, href: '/overzicht/belasting' },
    { id: 'debt:2', domain: 'debt', title: 'Extra kaart', savings: 100, freedomDays: 1, href: '/core/debts' },
  ]
}

function makeRawInputs(overrides: Partial<TotaalplanRawInputs> = {}): TotaalplanRawInputs {
  return {
    generatedAt: '2026-07-13T00:00:00.000Z',
    dailyExpenseRate: 83,
    persoonlijkPlan: {
      profile: PROFILE,
      aowRows: [],
      events: [],
      budgetRows: [],
    },
    kernelContext: makeKernelContext(),
    aandachtspunten: makeAandachtspunten(),
    ...overrides,
  }
}

describe('assembleTotaalplan — projectie-parity (single source)', () => {
  it('rapport-projectiecijfers zijn identiek aan een onafhankelijke computeConvergentieProjection-run', () => {
    const raw = makeRawInputs()
    const report = assembleTotaalplan(raw)
    const outcome = computeConvergentieProjection({ rawContext: raw.kernelContext })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const sim = toSimResult(outcome.result)

    expect(report.projectie.ok).toBe(true)
    expect(report.projectie.fireAge).toBe(sim.fireAge)
    expect(report.projectie.fireAgeFractional).toBe(sim.fireAgeFractional)
    expect(report.projectie.doelbedragNettoVermogen).toBe(outcome.result.requiredFireNetWorth ?? null)
    expect(report.projectie.fireLiquidePot).toBe(Math.round(sim.requiredFirePortfolio))

    // B-043: het rapport-pad is de WEERGAVE-geclipte reeks (t/m displayEndAge − 1),
    // exact zoals /toekomst en /overzicht 'm tonen — niet de rauwe kernelreeks tot ~100.
    const displayRows = clipRowsToPlanEnd(outcome.result.rows, sim.displayEndAge)
    const lastRow = displayRows[displayRows.length - 1]
    expect(report.projectie.eindwaardeNettoVermogen).toBe(Math.round(lastRow.netWorth))
    expect(report.projectie.eindwaardeNettoLiquide).toBe(Math.round(lastRow.nettoLiquide))
    expect(report.projectie.vermogenspad.length).toBe(displayRows.length)
    expect(report.projectie.vermogenspad[report.projectie.vermogenspad.length - 1].nettoVermogen).toBe(
      Math.round(lastRow.netWorth),
    )
    // De deflator reist per punt mee (puur doorgeleid, jaar 0 = exact 1.0).
    expect(report.projectie.vermogenspad[0].inflationFactor).toBe(1)
    expect(report.projectie.vermogenspad[report.projectie.vermogenspad.length - 1].inflationFactor).toBe(lastRow.inflationFactor)
  })
})

describe('assembleTotaalplan — slagingskans-parity (single source)', () => {
  it('successProbability is exact gelijk aan een onafhankelijke runMonteCarlo-run op dezelfde kernel-input', () => {
    const raw = makeRawInputs()
    const report = assembleTotaalplan(raw)

    const input = buildTotaalplanKernelInput(raw.kernelContext)
    expect(input).not.toBeNull()
    const mc = runMonteCarlo(input!)

    expect(report.slagingskans.ok).toBe(true)
    expect(report.slagingskans.successProbability).toBe(
      Number.isNaN(mc.successProbability) ? null : mc.successProbability,
    )
    expect(report.slagingskans.runs).toBe(mc.runs)
  })

  it('runs zijn gecapt op TOTAALPLAN_MC_RUNS (of lager)', () => {
    const raw = makeRawInputs()
    const report = assembleTotaalplan(raw)
    expect(report.slagingskans.runs).toBeLessThanOrEqual(TOTAALPLAN_MC_RUNS)

    const input = buildTotaalplanKernelInput(raw.kernelContext)
    expect(input!.onzekerheid.mc.aantalRuns).toBeLessThanOrEqual(TOTAALPLAN_MC_RUNS)
  })
})

describe('buildTotaalplanKernelInput — marktVolatiliteit (ADR 0117) bereikt MC!B3', () => {
  it('jaarlaag op de context → σ in de kernel-invoer (dit exemplaar liet het veld tot 3 sep 2026 vallen)', () => {
    const input = buildTotaalplanKernelInput(makeKernelContext({ marktVolatiliteit: 0.22 }))
    expect(input).not.toBeNull()
    expect(input!.onzekerheid.mc.sigma).toBe(0.22)
  })

  it('zonder jaarlaag → DEFAULT_VOLATILITY (geen tweede hardcode)', () => {
    expect(buildTotaalplanKernelInput(makeKernelContext())!.onzekerheid.mc.sigma).toBe(DEFAULT_VOLATILITY)
  })
})

describe('assembleTotaalplan — regressie: totaalplan-projectie == /toekomst-projectie', () => {
  it('vermogenspad (lengte + eerste/laatste nettoVermogen) komt overeen met een directe kernel-run op dezelfde rawContext', () => {
    const raw = makeRawInputs()
    const report = assembleTotaalplan(raw)

    // Simuleert wat /toekomst zou doen: dezelfde rawContext, los aangeroepen, en
    // dezelfde weergave-clip (`clipRowsToPlanEnd` op de kernel-`displayEndAge`).
    const direct = computeConvergentieProjection({ rawContext: raw.kernelContext })
    expect(direct.ok).toBe(true)
    if (!direct.ok) return
    const toekomstRows = clipRowsToPlanEnd(direct.result.rows, direct.result.displayEndAge)

    expect(report.projectie.vermogenspad.length).toBe(toekomstRows.length)
    expect(report.projectie.vermogenspad[0].nettoVermogen).toBe(Math.round(toekomstRows[0].netWorth))
    expect(report.projectie.vermogenspad[report.projectie.vermogenspad.length - 1].nettoVermogen).toBe(
      Math.round(toekomstRows[toekomstRows.length - 1].netWorth),
    )
  })
})

/**
 * Regressieslot B-043 — "eindwaarde van −1 mln zonder leeftijd in het totaalplan".
 *
 * `buildProjectie` nam `result.rows` ongeknipt en las de eindwaarde van de laatste
 * kernelrij (~leeftijd 100). Bij opeten/nalatenschap met een eindleeftijd onder 100
 * is dat de staart van de tekort-lening: diep negatief en nominaal. Eigenaarsbesluit:
 * zoals /toekomst — de staart is modelmarge (4 juli 2026), dus pad én eindwaarde
 * knippen op `displayEndAge − 1` met dezelfde helper.
 */
describe('assembleTotaalplan — pad en eindwaarde stoppen op het planeinde (B-043)', () => {
  function projectieFor(plan: Partial<ConvergentieRawContext['profile']>) {
    const kernelContext = makeKernelContext({ profile: { ...makeKernelContext().profile, ...plan } })
    const report = assembleTotaalplan(makeRawInputs({ kernelContext }))
    const run = computeConvergentieProjection({ rawContext: kernelContext })
    if (!run.ok) throw new Error(`fixture: run niet ok (${run.reason})`)
    return { projectie: report.projectie, run: run.result }
  }

  it('opeten met eindleeftijd 90: de eindwaarde staat op het planeinde, niet op de tekort-lening-staart', () => {
    const { projectie, run } = projectieFor({ fire_end_strategy: 'deplete', fire_end_age: 90 })
    expect(projectie.ok).toBe(true)
    expect(projectie.displayEndAge).toBe(90)

    const laatste = projectie.vermogenspad[projectie.vermogenspad.length - 1]
    expect(laatste.age).toBe(89) // t/m displayEndAge − 1, zoals /toekomst
    expect(projectie.eindwaardeNettoVermogen).toBe(laatste.nettoVermogen)

    // De rauwe kernelstaart (tot ~100) IS diep negatief — precies het "−1 mln" uit de melding.
    const staart = run.rows[run.rows.length - 1]
    expect(staart.age).toBeGreaterThan(89)
    expect(staart.netWorth).toBeLessThan(0)
    expect(projectie.eindwaardeNettoVermogen).toBeGreaterThan(Math.round(staart.netWorth))
    // Opeten landt per constructie op ~€0 op het planeinde: geen miljoenen-tekort meer.
    expect(Math.abs(projectie.eindwaardeNettoVermogen)).toBeLessThan(Math.abs(staart.netWorth) / 10)
  })

  it.each([
    ['perpetual', { fire_end_strategy: 'perpetual', fire_end_age: 90 }],
    ['pensioen', { fire_end_strategy: 'pensioen', fire_end_age: 90 }],
    ['deplete', { fire_end_strategy: 'deplete', fire_end_age: 85 }],
    ['legacy', { fire_end_strategy: 'legacy', fire_end_age: 90, fire_legacy_amount: 100_000 }],
  ] as const)('%s: pad t/m displayEndAge − 1 en eindwaarde = eindstand van die rij', (_naam, plan) => {
    const { projectie, run } = projectieFor(plan)
    expect(projectie.ok).toBe(true)
    const verwacht = clipRowsToPlanEnd(run.rows, run.displayEndAge)
    expect(projectie.vermogenspad.map((p) => p.age)).toEqual(verwacht.map((r) => r.age))
    expect(projectie.vermogenspad[projectie.vermogenspad.length - 1].age).toBe(run.displayEndAge - 1)
    expect(projectie.eindwaardeNettoVermogen).toBe(Math.round(verwacht[verwacht.length - 1].netWorth))
    expect(projectie.eindwaardeNettoLiquide).toBe(Math.round(verwacht[verwacht.length - 1].nettoLiquide))
    // Elk punt draagt de canonieke deflator van zijn rij mee.
    projectie.vermogenspad.forEach((p, i) => expect(p.inflationFactor).toBe(verwacht[i].inflationFactor))
  })

  it('zonder tekort: geen anker-tekort-zin en geen tekort-lening-melding', () => {
    const { projectie } = projectieFor({ fire_end_strategy: 'deplete', fire_end_age: 90 })
    expect(projectie.ankerTekortZin).toBeNull()
    expect(projectie.tekortLening).toBeNull()
  })

  it('anker-tekort (arm + vast stopmoment): de /toekomst-zin komt mee in het rapport', () => {
    // Zelfde constructie als anker.test.ts ("arm + stop op 43 ⇒ anchor_shortfall"):
    // nauwelijks vermogen, geen inleg, stoppen op 43 → het liquide vermogen reikt niet.
    const kernelContext = makeKernelContext({
      profile: {
        ...makeKernelContext().profile,
        fire_end_strategy: 'deplete',
        fire_end_age: 90,
        fire_stop_anchor: 'age',
        fire_stop_age: 43,
      },
      assets: makeAssets().map((a) => ({ ...a, current_value: 5_000, monthly_contribution: 0 })),
    })
    const report = assembleTotaalplan(makeRawInputs({ kernelContext }))
    const run = computeConvergentieProjection({ rawContext: kernelContext })
    if (!run.ok) throw new Error('fixture: run niet ok')
    expect(['anchor_shortfall', 'pension_shortfall', 'stop_now_shortfall']).toContain(run.kernelStatus)

    const zin = report.projectie.ankerTekortZin
    expect(zin).not.toBeNull()
    expect(zin).toMatch(/liquide vermogen/)
    expect(zin).toMatch(/op 43 stopt/)
    // Beschrijvend, nooit aansporend (toon-invariant uit anker-copy).
    expect(zin).not.toMatch(/je kunt stoppen|oneindig|AOW/)
  })
})

describe('assembleTotaalplan — lege staat (geen geboortedatum)', () => {
  it('projectie.ok en slagingskans.ok zijn false, vermogenspad is leeg, aannames-blokken blijven gevuld', () => {
    const raw = makeRawInputs({
      persoonlijkPlan: {
        profile: { ...PROFILE, date_of_birth: null },
        aowRows: [],
        events: [],
        budgetRows: [],
      },
      kernelContext: makeKernelContext({
        profile: { ...makeKernelContext().profile, date_of_birth: null },
      }),
    })
    const report = assembleTotaalplan(raw)

    expect(report.projectie.ok).toBe(false)
    expect(report.projectie.reason).toBeTruthy()
    expect(report.projectie.vermogenspad).toEqual([])
    expect(report.slagingskans.ok).toBe(false)
    expect(report.slagingskans.successProbability).toBeNull()

    // De aannames-blokken (spiegel persoonlijk-plan) zijn onafhankelijk van de kernel.
    expect(report.demografie).toBeTruthy()
    expect(report.inkomen).toBeTruthy()
    expect(report.fireParams).toBeTruthy()
    expect(report.eindstrategie).toBeTruthy()
  })
})

describe('assembleTotaalplan — inzichten deterministisch', () => {
  it('top-5 aandachtspunten in dezelfde volgorde, 1-op-1 gemapt', () => {
    const raw = makeRawInputs()
    const report = assembleTotaalplan(raw)

    expect(report.inzichten.length).toBe(5)
    raw.aandachtspunten.slice(0, 5).forEach((a, i) => {
      expect(report.inzichten[i].id).toBe(a.id)
      expect(report.inzichten[i].title).toBe(a.title)
      expect(report.inzichten[i].freedomDays).toBe(a.freedomDays)
      expect(report.inzichten[i].savingsPerYear).toBe(a.savings)
    })
  })

  it('minder dan 5 aandachtspunten → allemaal getoond, geen crash', () => {
    const raw = makeRawInputs({ aandachtspunten: makeAandachtspunten().slice(0, 2) })
    const report = assembleTotaalplan(raw)
    expect(report.inzichten.length).toBe(2)
  })
})

/**
 * Regressieslot — Notion "Persoonlijk plan telt Inkomen + Sparen mee als
 * essentiële uitgave" (P1/S1). De bug zat in `buildPersoonlijkPlanSections`
 * (gedeelde aannames-assemblage), dus het TWEEDE rapport-oppervlak — het
 * gecomponeerde totaalplan — was even hard geraakt als /rapportages/persoonlijk-plan.
 * Deze suite pint dat het totaalplan de gecorrigeerde grondslag doorgeeft.
 * De directe consument staat in `lib/persoonlijk-plan-assembly.test.ts`.
 */
describe('assembleTotaalplan — essentiële uitgaven tellen alleen budget_type=expense', () => {
  const BUDGET_ROWS = [
    { id: 'b-inkomen', parent_id: null, name: 'Inkomen', default_limit: 6500, interval: 'monthly', budget_type: 'income', is_essential: true },
    { id: 'b-wonen', parent_id: null, name: 'Vaste lasten wonen', default_limit: 455, interval: 'monthly', budget_type: 'expense', is_essential: true },
    { id: 'b-dagelijks', parent_id: null, name: 'Dagelijkse uitgaven', default_limit: 410, interval: 'monthly', budget_type: 'expense', is_essential: true },
    { id: 'b-vervoer', parent_id: null, name: 'Vervoer', default_limit: 230, interval: 'monthly', budget_type: 'expense', is_essential: true },
    { id: 'b-sparen', parent_id: null, name: 'Sparen & investeren', default_limit: 3000, interval: 'monthly', budget_type: 'savings', is_essential: true },
  ]

  function reportWith(budgetRows: typeof BUDGET_ROWS) {
    return assembleTotaalplan(
      makeRawInputs({
        persoonlijkPlan: { profile: PROFILE, aowRows: [], events: [], budgetRows },
      }),
    )
  }

  it('Inkomen-/Sparen-parents tellen niet mee in het totaalplan (€13.140 i.p.v. €127.140/jaar)', () => {
    const report = reportWith(BUDGET_ROWS)
    expect(report.uitgaven.yearlyEssentialExpenses).toBe(13140)
    expect(report.uitgaven.yearlyEssentialExpenses).not.toBe(127140)
  })

  it('totaalplan en persoonlijk plan tonen byte-identieke aannames (één bron, geen drift)', () => {
    const budgetRows = BUDGET_ROWS
    const totaalplan = reportWith(budgetRows)
    const persoonlijk = buildPersoonlijkPlanSections({
      profile: PROFILE, aowRows: [], events: [], budgetRows,
    })
    expect(totaalplan.uitgaven).toEqual(persoonlijk.uitgaven)
  })
})
