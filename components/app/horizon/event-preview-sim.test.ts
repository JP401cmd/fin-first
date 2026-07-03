import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { FinancialInput, LifeEvent } from '@/lib/horizon-data'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import { runSelectedProjection } from '@/lib/horizon-engine/select'
import { lifeEventsToCashflows } from '@/lib/fire-simulation'
import { toSimResult, type UnifiedProjectionInput } from '@/lib/unified-projection'
import type {
  ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import type { PreviewBaseline, PreviewKernelRawContext } from '@/lib/strategy-preview'
import { previewSimResult } from './event-preview-sim'

/**
 * FASE 6, stap 1 — `previewSimResult`-tests. Harde eis: met de kernel-vlag AFWEZIG
 * of `false` levert `previewSimResult` EXACT hetzelfde `SimResult` als de directe
 * `runSelectedProjection`-aanroep die de EventPane-previews vóór de kernel-threading
 * deden. We mocken niets — de referentie ís de letterlijke pre-wijziging-logica
 * (`legacyPreviewSim`), en de kernel-context is bewust aanwezig om te bewijzen dat
 * een uitgeschakelde vlag de context negeert (byte-identiek).
 */

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
  yearly_essential_expenses: 30_000,
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

/** Bouw een `PreviewBaseline` via dezelfde `buildHorizonInput`-assemblage als de client. */
function makeBaseline(kernel?: {
  enabled: boolean
  context?: PreviewKernelRawContext
}): PreviewBaseline {
  const financial: FinancialInput = {
    totalAssets: 150_000,
    totalDebts: 0,
    monthlyIncome: 4000,
    monthlyExpenses: 2500,
    yearlyMustExpenses: 30_000,
    monthlyContributions: 800,
    dateOfBirth: DOB,
  }
  const built = buildHorizonInput({
    horizonInput: financial,
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
    horizonEngineV2: true,
  })
  if (!built) throw new Error('buildHorizonInput gaf null')
  return {
    input: built.input,
    useV2: true,
    strategyOptions: built.strategyOptions,
    pensioenFireAgeFractional: null,
    ...(kernel ? { kernelEnabled: kernel.enabled, kernelRawContext: kernel.context } : {}),
  }
}

/** Referentie: de LETTERLIJKE pre-wijziging-logica van de EventPane-previews. */
function legacyPreviewSim(baseline: PreviewBaseline, events: LifeEvent[]) {
  const input: UnifiedProjectionInput = {
    ...baseline.input,
    cashflows: lifeEventsToCashflows(events),
  }
  return toSimResult(
    runSelectedProjection(input, baseline.useV2, baseline.strategyOptions),
  )
}

function makeEvent(id: string, targetAge: number, monthlyIncomeChange: number): LifeEvent {
  return {
    id,
    name: `event-${id}`,
    event_type: 'other',
    target_age: targetAge,
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: monthlyIncomeChange,
    duration_months: 0,
    icon: 'Sparkles',
    is_active: true,
    sort_order: 0,
    is_indexed: false,
    metadata: {},
  }
}

const EVENT_SETS: Record<string, LifeEvent[]> = {
  'geen events': [],
  'één inkomens-event': [makeEvent('a', 50, 500)],
  'meerdere events': [makeEvent('a', 50, 500), makeEvent('b', 60, -200)],
}

describe('previewSimResult — byte-identiteit bij vlag afwezig/false', () => {
  it.each(Object.keys(EVENT_SETS))(
    'kernel-velden AFWEZIG → identiek SimResult aan de legacy runSelectedProjection-aanroep (%s)',
    (label) => {
      const baseline = makeBaseline()
      const events = EVENT_SETS[label]!
      expect(previewSimResult(baseline, events)).toEqual(legacyPreviewSim(baseline, events))
    },
  )

  it.each(Object.keys(EVENT_SETS))(
    'kernelEnabled=false (mét aanwezige context) → context genegeerd, identiek aan legacy (%s)',
    (label) => {
      const context: PreviewKernelRawContext = {
        profile: PROFILE,
        assets: makeAssets(),
        debts: [],
      }
      const baseline = makeBaseline({ enabled: false, context })
      const events = EVENT_SETS[label]!
      expect(previewSimResult(baseline, events)).toEqual(legacyPreviewSim(baseline, events))
    },
  )

  it('de FIRE-impact-delta (baseline vs. mét event) blijft byte-identiek bij vlag uit', () => {
    const baseline = makeBaseline()
    const without = EVENT_SETS['geen events']!
    const withEvent = EVENT_SETS['één inkomens-event']!

    const baselineSim = previewSimResult(baseline, without)
    const withSim = previewSimResult(baseline, withEvent)
    const legacyBaseline = legacyPreviewSim(baseline, without)
    const legacyWith = legacyPreviewSim(baseline, withEvent)

    expect(baselineSim.fireAgeFractional).toBe(legacyBaseline.fireAgeFractional)
    expect(withSim.fireAgeFractional).toBe(legacyWith.fireAgeFractional)
  })
})
