import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { ageAtDate, type FinancialInput } from '@/lib/horizon-data'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import { toSimResult } from '@/lib/unified-projection'
import { computeConvergentieProjection, type ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'
import { runForcedStopPath } from '@/lib/horizon/scenario-presets'
import { buildCoverageStrip } from '@/lib/horizon/coverage-strip'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import { buildSliderEvent } from '@/lib/scenario-events'
import type { WhatIfEvent } from '@/components/app/horizon/whatif-events'
import type { WhatIfOverrides } from '@/components/app/horizon/whatif-sliders'

/**
 * FASE 6, stap 5A — use-horizon-fire-sim: kernel-only contract-tests.
 *
 * De v2-grootboek-engine (`@/lib/horizon-engine/*`, `runSelectedProjection`) is fysiek
 * verwijderd; de hook heeft nu geen `engine`/vlag-tak meer — `kernelRawProfile` is
 * verplicht en de kernel is de enige motor (`computeConvergentieProjection`). Deze tests
 * bouwen de verwachte uitkomst met dezelfde router-aanroep (geen mock van de kernel zelf,
 * enkel van de Supabase-client voor het debounced snapshot-effect).
 *
 * De Supabase-mock is configureerbaar: `getUserImpl.current` staat standaard op een
 * NOOIT-resolvende promise (identiek aan de originele mock → bestaande tests schrijven
 * nooit), en `updatePayloads` legt elke `net_worth_snapshots`-update vast zodat de
 * scenario-tests kunnen bewijzen dát/wát er geschreven wordt (of niet).
 */
const { getUserImpl, updatePayloads } = vi.hoisted(() => ({
  getUserImpl: { current: (): Promise<{ data: { user: { id: string } | null } }> => new Promise(() => {}) },
  updatePayloads: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: () => getUserImpl.current() },
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        updatePayloads.push(payload)
        return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }
      },
    }),
  }),
}))

import { useHorizonFireSim, type HorizonScenarioOverrides } from './use-horizon-fire-sim'

const DOB = '1986-01-01'
const FIRE_STRATEGY: FireStrategyConfig = { strategy: 'perpetual', endAge: 90, legacyAmount: 0 }

const PROFILE: ConvergentieRawProfileRow = {
  date_of_birth: DOB,
  net_monthly_income: 4000,
  estimated_monthly_expenses: 2500,
  expected_return: 7,
  inflation_rate: 2,
  box3_method: 'forfaitair',
  fire_end_strategy: 'perpetual',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  withdrawal_strategy: 'static',
  housing_strategy_config: { mode: 'include_full' },
  retirement_expense_method: 'current_expenses',
  retirement_expense_custom_amount: null,
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

const FINANCIAL: FinancialInput = {
  totalAssets: 150_000,
  totalDebts: 0,
  monthlyIncome: 4000,
  monthlyExpenses: 2500,
  yearlyMustExpenses: 30_000,
  monthlyContributions: 800,
  dateOfBirth: DOB,
}

type HookParams = NonNullable<Parameters<typeof useHorizonFireSim>[0]>

/** Vaste kleine hook-invoer (pure beleggingsportefeuille, geen woning). */
function makeParams(overrides: Partial<HookParams> = {}): HookParams {
  return {
    horizonInput: FINANCIAL,
    lifeEvents: [],
    fireStrategy: FIRE_STRATEGY,
    withdrawalStrategy: WITHDRAWAL_DEFAULTS,
    grossReturn: 0.07,
    inflation: 0.02,
    assets: makeAssets(),
    debts: [],
    box3Method: 'forfaitair',
    hasPartner: false,
    housingStrategy: { mode: 'include_full' },
    kernelRawProfile: PROFILE,
    aowRows: [],
    ...overrides,
  }
}

describe('useHorizonFireSim — kernel-tak (rawProfile aanwezig)', () => {
  it('result deep-equals een directe computeConvergentieProjection-aanroep met dezelfde rawContext', () => {
    // yearlyExpenses zoals buildHorizonInput 'm afleidt: yearlyMustExpenses (30_000 > 0).
    const outcome = computeConvergentieProjection({
      rawContext: {
        profile: PROFILE,
        assets: makeAssets(),
        debts: [],
        lifeEvents: [],
        aowRows: [],
        yearlyExpenses: 30_000,
      },
    })
    if (!outcome.ok) throw new Error('kernel-outcome was niet ok — fixture ongeldig')
    const expected = toSimResult(outcome.result)

    const params = makeParams()
    const { result, unmount } = renderHook(() => useHorizonFireSim(params))

    expect(result.current.result).toEqual(expected)
    expect(result.current.unifiedRows).toEqual(outcome.result.rows)
    expect(result.current.kernelStatus).toBe(outcome.kernelStatus)
    expect(result.current.kernelMaandHint).toBe(outcome.kernelMaandHint)
    expect(result.current.kernelHousingSale).toEqual(outcome.kernelHousingSale ?? null)
    expect(['reached_now', 'reached_at', 'unreachable_within_horizon', 'pension_shortfall'])
      .toContain(result.current.kernelStatus)
    unmount()
  })
})

describe('useHorizonFireSim — kernelRawProfile ontbreekt', () => {
  it('levert een leeg resultaat zonder te crashen (geen kernel-run mogelijk)', () => {
    const params = makeParams({ kernelRawProfile: null })
    const { result, unmount } = renderHook(() => useHorizonFireSim(params))

    expect(result.current.result).toBeNull()
    expect(result.current.unifiedRows).toBeNull()
    expect(result.current.kernelStatus).toBeNull()
    expect(result.current.kernelMaandHint).toBeNull()
    expect(result.current.kernelHousingSale).toBeNull()
    // Zonder kernel-run vallen de effectieve events terug op de rauwe input-events.
    expect(result.current.effectiveLifeEvents).toEqual([])
    unmount()
  })
})

describe('useHorizonFireSim — kern-fout in de rawProfile (geen geboortedatum)', () => {
  it('degradeert netjes naar een leeg resultaat (computeConvergentieProjection { ok: false })', () => {
    const brokenProfile: ConvergentieRawProfileRow = { ...PROFILE, date_of_birth: null }
    const params = makeParams({ kernelRawProfile: brokenProfile })
    const { result, unmount } = renderHook(() => useHorizonFireSim(params))

    expect(result.current.result).toBeNull()
    expect(result.current.unifiedRows).toBeNull()
    unmount()
  })
})

describe('useHorizonFireSim — geen horizonInput', () => {
  it('isLoading=true en alle velden leeg/null', () => {
    const { result, unmount } = renderHook(() => useHorizonFireSim({ ...makeParams(), horizonInput: null }))

    expect(result.current.isLoading).toBe(true)
    expect(result.current.result).toBeNull()
    expect(result.current.unifiedRows).toBeNull()
    expect(result.current.scenario).toBeNull()
    unmount()
  })
})

// ── Stap 2: wat-als-scenario-laag (2e, gescheiden run) ──────────────────────
//
// De hook krijgt een optionele `scenarioOverrides`-input en een `scenario`-veld dat in
// een TWEEDE useMemo draait (zelfde motorpad als de hoofdlijn, plan §A/§B). Deze suite
// bewijst: geen/neutrale overrides ⇒ geen 2e run; een afwijkende slider of rendement-delta
// ⇒ afwijkend scenario terwijl de hoofdrun referentie-stabiel blijft; en de scenario-run
// schrijft NOOIT een eigen snapshot.

const CURRENT_AGE = ageAtDate(DOB) // reëel (real Date) — consistent met de kernel-leeftijd
const BASELINE_OVERRIDES: WhatIfOverrides = {
  monthlyIncome: 4000,
  workDaysPerWeek: 5,
  savingsRate: 20,
  expectedReturn: 7,
  extraContribution: 0,
}
// Echte slider-eventbouwer (de stap-4 wiring gebruikt exact deze): +€1.500/mnd extra inleg.
const extraInlegEvent = buildSliderEvent('extra_inleg', 1500, BASELINE_OVERRIDES, CURRENT_AGE) as WhatIfEvent

describe('useHorizonFireSim — wat-als-scenario (2e run)', () => {
  it('zonder scenarioOverrides ⇒ scenario === null (hoofdgedrag ongewijzigd)', () => {
    const params = makeParams()
    const { result, unmount } = renderHook(() => useHorizonFireSim(params))
    expect(result.current.scenario).toBeNull()
    // Hoofdrun draait onveranderd.
    expect(result.current.result).not.toBeNull()
    expect(result.current.unifiedRows).not.toBeNull()
    unmount()
  })

  it('neutrale overrides (lege events + lege delta) ⇒ scenario === null (geen 2e run)', () => {
    const overrides: HorizonScenarioOverrides = { extraLifeEvents: [], returnDeltaByCategorie: {} }
    const params = makeParams({ scenarioOverrides: overrides })
    const { result, unmount } = renderHook(() => useHorizonFireSim(params))
    expect(result.current.scenario).toBeNull()
    expect(result.current.result).not.toBeNull()
    unmount()
  })

  it('extra_inleg-slider-event ⇒ scenario wijkt af van de hoofdlijn (eerder vrij óf hoger eindvermogen)', () => {
    const params = makeParams({ scenarioOverrides: { extraLifeEvents: [extraInlegEvent] } })
    const { result, unmount } = renderHook(() => useHorizonFireSim(params))
    const main = result.current.result
    const mainRows = result.current.unifiedRows
    const scenario = result.current.scenario
    expect(main).not.toBeNull()
    expect(scenario).not.toBeNull()
    if (!main || !mainRows || !scenario) return

    // De projectie verschilt hoe dan ook (meer inleg ⇒ andere vermogensopbouw)…
    expect(scenario.unifiedRows).not.toEqual(mainRows)
    // …in de juiste richting: eerdere FIRE-leeftijd óf hoger eindvermogen.
    const scRows = scenario.unifiedRows
    const higherEnd = scRows[scRows.length - 1].netWorth > mainRows[mainRows.length - 1].netWorth
    const earlier =
      scenario.result.fireAgeFractional != null &&
      main.fireAgeFractional != null &&
      scenario.result.fireAgeFractional < main.fireAgeFractional
    expect(earlier || higherEnd).toBe(true)
    unmount()
  })

  it('alleen returnDeltaByCategorie {Beleggingen:+2pp} ⇒ scenario wijkt af; hoofdresultaat referentie-stabiel over een override-only rerender', () => {
    const params = makeParams({
      scenarioOverrides: { extraLifeEvents: [], returnDeltaByCategorie: { Beleggingen: 0.02 } },
    })
    const { result, rerender, unmount } = renderHook(
      (props: HookParams) => useHorizonFireSim(props),
      { initialProps: params },
    )

    const mainResultRef = result.current.result
    const mainRows = result.current.unifiedRows
    expect(mainResultRef).not.toBeNull()
    expect(result.current.scenario).not.toBeNull()
    // +2 pp rendement op de (enige) beleggings-asset ⇒ afwijkende vermogensopbouw.
    expect(result.current.scenario?.unifiedRows).not.toEqual(mainRows)

    // Rerender met ALLEEN een andere override (zelfde kernel-input-referenties): de
    // hoofd-memo mag NIET herrekenen ⇒ identiek result-object (identity-assert).
    rerender({ ...params, scenarioOverrides: { extraLifeEvents: [], returnDeltaByCategorie: { Beleggingen: 0.03 } } })
    expect(result.current.result).toBe(mainResultRef)
    expect(result.current.unifiedRows).toBe(mainRows)
    unmount()
  })

  it('een scenario-run schrijft NOOIT een eigen snapshot: precies één write, met de HOOFDrun-waarden', async () => {
    // Hoofdrun direct (voor de verwachte write-payload).
    const mainOut = computeConvergentieProjection({
      rawContext: { profile: PROFILE, assets: makeAssets(), debts: [], lifeEvents: [], aowRows: [], yearlyExpenses: 30_000 },
    })
    if (!mainOut.ok) throw new Error('kernel-outcome was niet ok — fixture ongeldig')
    const mainResult = toSimResult(mainOut.result)

    getUserImpl.current = () => Promise.resolve({ data: { user: { id: 'u1' } } })
    updatePayloads.length = 0
    // Alléén setTimeout/clearTimeout faken — Date blijft reëel zodat de kernel-leeftijd
    // consistent blijft met de bovenstaande directe run.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const params = makeParams({ scenarioOverrides: { extraLifeEvents: [extraInlegEvent] } })
      const { result, unmount } = renderHook(() => useHorizonFireSim(params))

      // Scenario is ACTIEF en afwijkend van de hoofdlijn…
      expect(result.current.scenario).not.toBeNull()
      expect(result.current.scenario?.unifiedRows).not.toEqual(result.current.unifiedRows)

      // …maar het debounced write-effect keyt uitsluitend op de hoofdrun.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })

      // Precies ÉÉN write (de hoofdrun); een eigen scenario-write zou er twee opleveren.
      expect(updatePayloads).toHaveLength(1)
      expect(updatePayloads[0]).toEqual({
        fire_age: mainResult.fireAgeFractional,
        fire_portfolio_required: mainResult.requiredFirePortfolio,
        engine_bron: 'kernel',
      })
      unmount()
    } finally {
      getUserImpl.current = () => new Promise(() => {})
      vi.useRealTimers()
    }
  })
})

// ── Ronde 3: gekozen-stop-pad (3e, gescheiden run) ──────────────────────────
//
// De hook krijgt een optionele `stopPadAge`-input en een `stopPad`-veld dat in een DERDE
// useMemo draait (het geforceerde-stop-recept, gedeeld met scenario-presets). Deze suite
// bewijst: geen stopPadAge ⇒ geen 3e run; met stopPadAge ⇒ deep-equal met een directe
// runForcedStopPath; een stopPadAge-wijziging laat de hoofd- én scenario-run referentie-
// stabiel; en het stop-pad schrijft NOOIT een eigen snapshot.

describe('useHorizonFireSim — gekozen-stop-pad (3e run)', () => {
  it('zonder stopPadAge ⇒ stopPad === null (hoofdgedrag ongewijzigd)', () => {
    const { result, unmount } = renderHook(() => useHorizonFireSim(makeParams()))
    expect(result.current.stopPad).toBeNull()
    expect(result.current.result).not.toBeNull()
    unmount()
  })

  it('stopPadAge gezet ⇒ stopPad deep-equals een directe runForcedStopPath op dezelfde context', () => {
    const stopAge = 60
    const expected = runForcedStopPath({
      profile: PROFILE,
      assets: makeAssets(),
      debts: [],
      lifeEvents: [],
      aowRows: [],
      yearlyExpenses: 30_000, // zoals buildHorizonInput 'm afleidt (yearlyMustExpenses)
      stopAge,
      fireEndAge: FIRE_STRATEGY.endAge,
    })
    expect(expected).not.toBeNull()

    const { result, unmount } = renderHook(() => useHorizonFireSim(makeParams({ stopPadAge: stopAge })))
    expect(result.current.stopPad).toEqual(expected)
    unmount()
  })

  it('een stopPadAge-wijziging laat de hoofd- én scenario-run referentie-stabiel', () => {
    const params = makeParams({ scenarioOverrides: { extraLifeEvents: [extraInlegEvent] }, stopPadAge: 60 })
    const { result, rerender, unmount } = renderHook(
      (props: HookParams) => useHorizonFireSim(props),
      { initialProps: params },
    )
    const mainRef = result.current.result
    const rowsRef = result.current.unifiedRows
    const scenarioRef = result.current.scenario
    expect(mainRef).not.toBeNull()
    expect(scenarioRef).not.toBeNull()
    expect(result.current.stopPad).not.toBeNull()

    // Alléén de stopleeftijd wijzigt (zelfde kernel-input- én override-referenties): de
    // hoofd- en scenario-memo mogen NIET herrekenen ⇒ identieke objecten (identity-assert).
    rerender({ ...params, stopPadAge: 61 })
    expect(result.current.result).toBe(mainRef)
    expect(result.current.unifiedRows).toBe(rowsRef)
    expect(result.current.scenario).toBe(scenarioRef)
    unmount()
  })

  it('een stop-pad-run schrijft NOOIT een eigen snapshot: precies één write, met de HOOFDrun-waarden', async () => {
    const mainOut = computeConvergentieProjection({
      rawContext: { profile: PROFILE, assets: makeAssets(), debts: [], lifeEvents: [], aowRows: [], yearlyExpenses: 30_000 },
    })
    if (!mainOut.ok) throw new Error('kernel-outcome was niet ok — fixture ongeldig')
    const mainResult = toSimResult(mainOut.result)

    getUserImpl.current = () => Promise.resolve({ data: { user: { id: 'u1' } } })
    updatePayloads.length = 0
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const { result, unmount } = renderHook(() => useHorizonFireSim(makeParams({ stopPadAge: 60 })))
      expect(result.current.stopPad).not.toBeNull()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })

      expect(updatePayloads).toHaveLength(1)
      expect(updatePayloads[0]).toEqual({
        fire_age: mainResult.fireAgeFractional,
        fire_portfolio_required: mainResult.requiredFirePortfolio,
        engine_bron: 'kernel',
      })
      unmount()
    } finally {
      getUserImpl.current = () => new Promise(() => {})
      vi.useRealTimers()
    }
  })
})

// ── Variantenmatrix-item (bug-fix stap 6): hook-stopPad-rijen delen de salaris-gate ──
//
// `stopPad` is een dunne wrapper om `runForcedStopPath` (al gedekt in
// coverage-strip-forced-stop.test.ts); dit bewijst dat het GEDRAG ook via de hook zelf
// klopt — mét dezelfde 20x-verkleinde persona-fixture (brugperiode tussen de geforceerde
// stopleeftijd en de AOW-fallback zonder salaris die de portefeuille niet volledig dekt).

const HOOK_PINNED_AGE = 42
const HOOK_SCALE = 20
const HOOK_AOW_FALLBACK_AGE = 67
const HOOK_STOP_AGE = 43

function scaleHookAsset(a: Asset): Asset {
  return {
    ...a,
    current_value: a.current_value / HOOK_SCALE,
    purchase_value: a.purchase_value != null ? a.purchase_value / HOOK_SCALE : a.purchase_value,
    woz_value: a.woz_value != null ? a.woz_value / HOOK_SCALE : a.woz_value,
    rental_income: a.rental_income != null ? a.rental_income / HOOK_SCALE : a.rental_income,
  }
}
function scaleHookDebt(d: Debt): Debt {
  return {
    ...d,
    current_balance: d.current_balance / HOOK_SCALE,
    original_amount: d.original_amount / HOOK_SCALE,
    monthly_payment: d.monthly_payment != null ? d.monthly_payment / HOOK_SCALE : d.monthly_payment,
    minimum_payment: d.minimum_payment != null ? d.minimum_payment / HOOK_SCALE : d.minimum_payment,
  }
}

const hookFx = buildCompleetHorizonFixture(HOOK_PINNED_AGE)
const hookAssets = hookFx.assets.map(scaleHookAsset)
const hookDebts = hookFx.debts.map(scaleHookDebt)
const hookProfile: ConvergentieRawProfileRow = {
  ...buildCompleetKernelProfileBase(HOOK_PINNED_AGE),
  yearly_essential_expenses: 30_000,
  retirement_expense_method: 'essential_budgets',
  fire_end_strategy: 'perpetual',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  housing_strategy_config: { mode: 'include_full' },
}
// Alleen dateOfBirth + yearlyMustExpenses zijn load-bearing voor buildHorizonInput se
// guard/yearlyExpenses-afleiding; de overige velden zijn ongebruikte vulling.
const hookHorizonInput: FinancialInput = { ...hookFx.financialInput, yearlyMustExpenses: 30_000 }

describe('useHorizonFireSim — stopPad deelt de post-FIRE-salaris-gate (variantenmatrix)', () => {
  it('stopPad-rijen in de brugjaren (vóór AOW) hebben geen salaris meer', () => {
    const params = makeParams({
      horizonInput: hookHorizonInput,
      lifeEvents: hookFx.lifeEvents,
      assets: hookAssets,
      debts: hookDebts,
      kernelRawProfile: hookProfile,
      aowRows: [],
      stopPadAge: HOOK_STOP_AGE,
    })
    const { result, unmount } = renderHook(() => useHorizonFireSim(params))
    expect(result.current.stopPad).not.toBeNull()

    const postStopPreAow = result.current.stopPad!.unifiedRows.filter(
      (r) => r.phase !== 'accumulation' && r.age < HOOK_AOW_FALLBACK_AGE,
    )
    expect(postStopPreAow.length).toBeGreaterThan(0)
    for (const row of postStopPreAow) {
      expect(row.grossIncomeBySource?.salaris ?? 0).toBeCloseTo(0, 0)
    }
    unmount()
  })

  it('de coverage-strip op die stopPad-rijen toont het dekkingsgat (<100%) in de brugperiode', () => {
    const params = makeParams({
      horizonInput: hookHorizonInput,
      lifeEvents: hookFx.lifeEvents,
      assets: hookAssets,
      debts: hookDebts,
      kernelRawProfile: hookProfile,
      aowRows: [],
      stopPadAge: HOOK_STOP_AGE,
    })
    const { result, unmount } = renderHook(() => useHorizonFireSim(params))
    expect(result.current.stopPad).not.toBeNull()

    const nodes = buildCoverageStrip(result.current.stopPad!.unifiedRows)
    expect(nodes.some((n) => n.coveragePct < 100)).toBe(true)
    unmount()
  })
})
