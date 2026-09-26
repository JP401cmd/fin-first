/**
 * Props-als-bron voor de gezondheidspijlers op /toekomst (ADR 0179 fase 1 stap 3).
 *
 * Given `useToekomstSim` seedde `healthScoreInput` en `budgetingActive` met
 *       `useState(initialData…)`, en het herreken-effect spreidde die state,
 * When  een mutatie `router.refresh()` doet en de pagina een nieuwe `initialData` krijgt,
 * Then  moeten de pijlers (noodfonds, spaarquote, budgetteren) de nieuwe bundel volgen —
 *       niet de eerste lading. `useState` negeert een nieuwe beginwaarde; de oude code
 *       bleef daardoor op de eerste lading hangen.
 *
 * De kernel zelf doet hier niet mee (gemockt): het gaat om de grondslag die het
 * herreken-effect uit de bundel leest. Zie ook `lib/hooks/use-horizon-bron.test.tsx`.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { HorizonPageData } from '@/lib/horizon-data-loader'
import type { HealthScoreInput } from '@/lib/financial-health'
import type { ToekomstPerspectief } from './use-toekomst-perspectief'
import type { ToekomstScenarioState } from './use-toekomst-scenario'
import { useToekomstSim } from './use-toekomst-sim'

const router = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}))

// Geen kernel-run: de first-paint-staat (alles nog leeg) is genoeg voor het pijler-effect.
vi.mock('@/lib/hooks/use-horizon-fire-sim', () => ({
  useHorizonFireSim: () => ({
    result: null,
    cashflows: null,
    error: null,
    unifiedRows: null,
    effectiveLifeEvents: [],
    kernelPensionPots: [],
    isLoading: false,
    kernelStatus: 'idle',
    kernelMaandHint: null,
    kernelHousingSale: null,
    aowOntbreekt: false,
    scenario: null,
    stopPad: null,
    scenarioPending: false,
    stopPadPending: false,
    mainPending: false,
    isRefining: false,
    firstPaintFireAge: null,
    firstPaintFreedomPct: null,
    firstPaintRequiredPortfolio: null,
    firstPaintRequiredNetWorth: null,
  }),
}))

vi.mock('@/lib/horizon-kernel/worker/run-in-worker', () => ({
  runScenarioPresetsAsync: () => new Promise(() => {}),
}))

const PERSPECTIEF = { isHouseholdView: false } as unknown as ToekomstPerspectief
const SCENARIO_STATE = { scenarioStopAge: null, scenarioOverrides: null } as unknown as ToekomstScenarioState

function healthInput(over: Partial<HealthScoreInput>): HealthScoreInput {
  return {
    effectiveSavingsRatePct: 20,
    totalAssets: 100_000,
    totalDebts: 10_000,
    emergencyFundMonths: 2,
    emergencyTargetMonths: 3,
    debtMonthlyPayments: 0,
    netMonthlyIncome: 4000,
    currentAge: 41,
    fireAgeFractional: null,
    largestAssetTypeShare: null,
    // Eén budget met data, zodat de budget-pijler alleen nog aan `budgetingActive` hangt.
    budgetCategories: [{ limit: 300, spent: 200 }],
    freedomPct: 10,
    incomeBasis: 'transactions',
    expensesBasis: 'transactions',
    ...over,
  } as unknown as HealthScoreInput
}

/** Een verse bundel per aanroep, zoals elke `router.refresh()` nieuwe objecten levert. */
function bundel(over: { healthScoreInput: HealthScoreInput; budgetingActive: boolean }): HorizonPageData {
  return {
    effectiveInput: {
      monthlyIncome: 4000,
      monthlyExpenses: 2500,
      yearlyMustExpenses: 30_000,
      totalAssets: 100_000,
      totalDebts: 10_000,
      dateOfBirth: '1985-06-15',
    },
    fireParams: { grossReturn: 0.06, inflationRate: 0.02, effectiveSwr: 0.04 },
    withdrawalStrategy: undefined,
    fireStrategy: { strategy: 'deplete', endAge: 90 },
    rawProfile: { fire_stop_age: 55, expected_return: 0.06 },
    aowRows: [],
    debts: [],
    actions: [],
    resilienceSnapshots: [],
    avgIncome6m: 4000,
    avgExpenses6m: 2500,
    retirementExpenseMethod: null,
    events: [],
    assets: [],
    housingContext: { hasEigenHuis: false, eigenHuisMortgages: [] },
    housingStrategy: { mode: 'include' },
    healthScore: null,
    healthScoreInput: over.healthScoreInput,
    budgetingActive: over.budgetingActive,
    dailyExpenseRate: 80,
    freedomPct: 10,
    firePlan: null,
  } as unknown as HorizonPageData
}

describe('useToekomstSim — de gezondheidspijlers volgen een nieuwe initialData', () => {
  it('neemt noodfonds, spaarquote en budgetteren over uit de ververste bundel', () => {
    const eerste = bundel({
      healthScoreInput: healthInput({ emergencyFundMonths: 2, effectiveSavingsRatePct: 20 }),
      budgetingActive: false,
    })
    const { result, rerender } = renderHook(
      ({ initialData }) => useToekomstSim({ initialData, perspectief: PERSPECTIEF, scenarioState: SCENARIO_STATE }),
      { initialProps: { initialData: eerste } },
    )
    expect(result.current.healthScoreInput.emergencyFundMonths).toBe(2)
    expect(result.current.healthScore?.budgetingActive).toBe(false)

    // Een mutatie elders + `router.refresh()`: nieuwe bundel met een gevulde buffer
    // en een net gestart budget.
    rerender({
      initialData: bundel({
        healthScoreInput: healthInput({ emergencyFundMonths: 7, effectiveSavingsRatePct: 35 }),
        budgetingActive: true,
      }),
    })
    expect(result.current.healthScoreInput.emergencyFundMonths).toBe(7)
    expect(result.current.healthScoreInput.effectiveSavingsRatePct).toBe(35)
    expect(result.current.healthScore?.budgetingActive).toBe(true)
  })
})
