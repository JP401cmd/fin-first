import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Aandachtspunt } from '@/lib/aandachtspunten'
import { toSimResult } from '@/lib/unified-projection'
import { computeConvergentieProjection, type ConvergentieRawContext } from '@/lib/horizon-kernel/convergentie-router'
import { runMonteCarlo } from '@/lib/horizon-kernel/wrappers/mc'
import {
  assembleTotaalplan,
  buildTotaalplanKernelInput,
  TOTAALPLAN_MC_RUNS,
  type TotaalplanRawInputs,
} from './totaalplan-data'
import type { PersoonlijkPlanProfileRow } from './persoonlijk-plan-assembly'

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
  marginaal_tarief: null,
  fire_end_strategy: 'perpetual',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  retirement_expense_method: 'current_expenses',
  retirement_expense_custom_amount: null,
  withdrawal_strategy: 'static',
  guardrail_floor: null,
  guardrail_ceiling: null,
  guardrail_cut_step: null,
  guardrail_raise_step: null,
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

    const lastRow = outcome.result.rows[outcome.result.rows.length - 1]
    expect(report.projectie.eindwaardeNettoVermogen).toBe(Math.round(lastRow.netWorth))
    expect(report.projectie.vermogenspad.length).toBe(outcome.result.rows.length)
    expect(report.projectie.vermogenspad[report.projectie.vermogenspad.length - 1].nettoVermogen).toBe(
      Math.round(lastRow.netWorth),
    )
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

describe('assembleTotaalplan — regressie: totaalplan-projectie == /toekomst-projectie', () => {
  it('vermogenspad (lengte + eerste/laatste nettoVermogen) komt overeen met een directe kernel-run op dezelfde rawContext', () => {
    const raw = makeRawInputs()
    const report = assembleTotaalplan(raw)

    // Simuleert wat /toekomst zou doen: dezelfde rawContext, los aangeroepen.
    const direct = computeConvergentieProjection({ rawContext: raw.kernelContext })
    expect(direct.ok).toBe(true)
    if (!direct.ok) return

    expect(report.projectie.vermogenspad.length).toBe(direct.result.rows.length)
    expect(report.projectie.vermogenspad[0].nettoVermogen).toBe(Math.round(direct.result.rows[0].netWorth))
    expect(report.projectie.vermogenspad[report.projectie.vermogenspad.length - 1].nettoVermogen).toBe(
      Math.round(direct.result.rows[direct.result.rows.length - 1].netWorth),
    )
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
