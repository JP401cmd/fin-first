import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { FinancialInput, LifeEvent } from '@/lib/horizon-data'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import { runSelectedProjection } from '@/lib/horizon-engine/select'
import { lifeEventsToCashflows } from '@/lib/fire-simulation'
import { toSimResult, type UnifiedProjectionInput } from '@/lib/unified-projection'
import type { ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'
import {
  previewFireAge,
  computeFreedomShift,
  type PreviewBaseline,
  type PreviewKernelRawContext,
} from './strategy-preview'

/**
 * FASE 6, stap 1 — strategy-preview-tests. Kernpunt (harde eis): met de kernel-vlag
 * AFWEZIG of `false` geeft `previewFireAge`/`computeFreedomShift` EXACT hetzelfde
 * resultaat als de directe `runSelectedProjection`-aanroep van vóór de kernel-
 * threading. We mocken niets — de referentie ís de letterlijke pre-wijziging-logica
 * (hieronder als `legacyPreviewFireAge`), en de kernel-context is bewust aanwezig
 * om te bewijzen dat een uitgeschakelde vlag de context negeert.
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

/**
 * Bouw een `PreviewBaseline` (pure beleggingsportefeuille) via dezelfde
 * `buildHorizonInput`-assemblage als de server-page. `kernel` = optioneel de
 * kernel-velden zoals de server-page ze zet.
 */
function makeBaseline(kernel?: {
  enabled: boolean
  context?: PreviewKernelRawContext
}): { baseline: PreviewBaseline; input: UnifiedProjectionInput; useV2: boolean; strategyOptions: PreviewBaseline['strategyOptions'] } {
  const assets = makeAssets()
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
    assets,
    debts: [],
    box3Method: 'forfaitair',
    hasPartner: false,
    housingStrategy: { mode: 'include_full' },
    horizonEngineV2: true,
  })
  if (!built) throw new Error('buildHorizonInput gaf null')
  const baseline: PreviewBaseline = {
    input: built.input,
    useV2: true,
    strategyOptions: built.strategyOptions,
    pensioenFireAgeFractional: null,
    ...(kernel
      ? { kernelEnabled: kernel.enabled, kernelRawContext: kernel.context }
      : {}),
  }
  return { baseline, input: built.input, useV2: true, strategyOptions: built.strategyOptions }
}

/**
 * Referentie: de LETTERLIJKE `previewFireAge`-logica van vóór de kernel-threading
 * (commit 4b000b365). Elke afwijking hiervan bij vlag-uit is een regressie.
 */
function legacyPreviewFireAge(
  baseline: PreviewBaseline,
  events: LifeEvent[],
): number | null {
  const input: UnifiedProjectionInput = {
    ...baseline.input,
    cashflows: lifeEventsToCashflows(events),
  }
  const sim = toSimResult(runSelectedProjection(input, baseline.useV2, baseline.strategyOptions))
  if (baseline.pensioenFireAgeFractional != null) return baseline.pensioenFireAgeFractional
  return sim.fireAgeFractional
}

/** Een simpel inkomens-verhogend event (erfenis-achtig) om cashflows te vullen. */
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

describe('previewFireAge — byte-identiteit bij vlag afwezig/false', () => {
  it.each(Object.keys(EVENT_SETS))(
    'kernel-velden AFWEZIG → identiek aan de legacy runSelectedProjection-aanroep (%s)',
    (label) => {
      const { baseline } = makeBaseline() // geen kernel-velden
      const events = EVENT_SETS[label]!
      expect(previewFireAge(baseline, events)).toBe(legacyPreviewFireAge(baseline, events))
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
      const { baseline } = makeBaseline({ enabled: false, context })
      const events = EVENT_SETS[label]!
      expect(previewFireAge(baseline, events)).toBe(legacyPreviewFireAge(baseline, events))
    },
  )

  it('pensioen-baseline (pensioenFireAgeFractional gezet) blijft byte-identiek bij vlag uit', () => {
    const { baseline: base } = makeBaseline()
    const baseline: PreviewBaseline = { ...base, pensioenFireAgeFractional: 67.25 }
    const events = EVENT_SETS['één inkomens-event']!
    expect(previewFireAge(baseline, events)).toBe(legacyPreviewFireAge(baseline, events))
    // De pensioen-override wint óók hier (engine !== 'kernel').
    expect(previewFireAge(baseline, events)).toBe(67.25)
  })
})

describe('computeFreedomShift — byte-identiteit bij vlag afwezig/false', () => {
  it('kernelEnabled=false (mét context) → deep-equals de legacy-shift', () => {
    const context: PreviewKernelRawContext = {
      profile: PROFILE,
      assets: makeAssets(),
      debts: [],
    }
    const { baseline } = makeBaseline({ enabled: false, context })
    const otherEvents = [makeEvent('a', 50, 500)]
    const draftEvent = makeEvent('draft', 55, 800)

    const actual = computeFreedomShift(baseline, otherEvents, draftEvent)
    const legacyBaselineAge = legacyPreviewFireAge(baseline, otherEvents)
    const legacyDraftAge = legacyPreviewFireAge(baseline, [...otherEvents, draftEvent])
    const legacyDelta =
      legacyBaselineAge != null && legacyDraftAge != null
        ? Math.round((legacyDraftAge - legacyBaselineAge) * 12)
        : null

    expect(actual).toEqual({
      baselineAge: legacyBaselineAge,
      draftAge: legacyDraftAge,
      deltaMonths: legacyDelta,
    })
  })

  it('draftEvent = null (verwijderen) → byte-identiek aan legacy', () => {
    const { baseline } = makeBaseline() // geen kernel-velden
    const otherEvents = [makeEvent('a', 50, 500)]

    const actual = computeFreedomShift(baseline, otherEvents, null)
    const legacyAge = legacyPreviewFireAge(baseline, otherEvents)

    expect(actual).toEqual({
      baselineAge: legacyAge,
      draftAge: legacyAge,
      deltaMonths: 0,
    })
  })
})
