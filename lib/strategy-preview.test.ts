import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import { toSimResult } from '@/lib/unified-projection'
import {
  computeConvergentieProjection,
  type ConvergentieRawProfileRow,
  type ConvergentieRawContext,
} from '@/lib/horizon-kernel/convergentie-router'
import {
  previewFireAge,
  previewProjection,
  computeFreedomShift,
  type PreviewBaseline,
} from './strategy-preview'

/**
 * FASE 6, stap 5A — strategy-preview kernel-only contract-tests.
 *
 * De v2-grootboek-engine (`buildHorizonInput`/`runSelectedProjection` uit
 * `@/lib/horizon-engine/*`) is fysiek verwijderd; `strategy-preview.ts` routeert nu
 * onvoorwaardelijk via `computeConvergentieProjection` — dezelfde motor als de
 * /toekomst-hoofdgrafiek. De vorige "byte-identiek aan de legacy runSelectedProjection"
 * -opzet is vervangen door: previewFireAge/previewProjection/computeFreedomShift zijn
 * dunne wrappers om computeConvergentieProjection — we bewijzen dat met een directe
 * kernel-run op dezelfde rawContext (geen mock van de kernel zelf).
 */

const DOB = '1986-01-01'

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

function makeBaseline(profile: ConvergentieRawProfileRow = PROFILE): PreviewBaseline {
  return {
    rawContext: {
      profile,
      assets: makeAssets(),
      debts: [] as Debt[],
      aowRows: [],
      yearlyExpenses: 30_000,
    },
  }
}

/** Directe kernel-run met dezelfde rawContext (+ events) — spiegelt wat de preview intern doet. */
function directOutcome(baseline: PreviewBaseline, events: LifeEvent[]) {
  const rawContext: ConvergentieRawContext = { ...baseline.rawContext, lifeEvents: events }
  return computeConvergentieProjection({ rawContext })
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

describe('previewFireAge — dunne wrapper om computeConvergentieProjection', () => {
  it.each(Object.keys(EVENT_SETS))(
    'levert exact de fireAgeFractional van een directe kernel-run op dezelfde rawContext (%s)',
    (label) => {
      const baseline = makeBaseline()
      const events = EVENT_SETS[label]!
      const outcome = directOutcome(baseline, events)
      if (!outcome.ok) throw new Error('kernel-outcome was niet ok — fixture ongeldig')
      expect(previewFireAge(baseline, events)).toBe(toSimResult(outcome.result).fireAgeFractional)
    },
  )

  it('kern-fout (geen geboortedatum) → null (geen crash)', () => {
    const baseline = makeBaseline({ ...PROFILE, date_of_birth: null })
    expect(previewFireAge(baseline, [])).toBeNull()
  })
})

describe('previewProjection — dunne wrapper om computeConvergentieProjection', () => {
  it('levert het volledige UnifiedProjectionResult van de kernel-run', () => {
    const baseline = makeBaseline()
    const events = EVENT_SETS['één inkomens-event']!
    const outcome = directOutcome(baseline, events)
    if (!outcome.ok) throw new Error('kernel-outcome was niet ok — fixture ongeldig')
    expect(previewProjection(baseline, events)).toEqual(outcome.result)
  })

  it('kern-fout → null', () => {
    const baseline = makeBaseline({ ...PROFILE, date_of_birth: null })
    expect(previewProjection(baseline, [])).toBeNull()
  })
})

describe('computeFreedomShift', () => {
  it('deltaMonths = afgeronde maand-verschuiving tussen baseline en draft', () => {
    const baseline = makeBaseline()
    const otherEvents = [makeEvent('a', 50, 500)]
    const draftEvent = makeEvent('draft', 55, 800)

    const actual = computeFreedomShift(baseline, otherEvents, draftEvent)
    const baselineOutcome = directOutcome(baseline, otherEvents)
    const draftOutcome = directOutcome(baseline, [...otherEvents, draftEvent])
    if (!baselineOutcome.ok || !draftOutcome.ok) throw new Error('kernel-outcome was niet ok — fixture ongeldig')
    const baselineAge = toSimResult(baselineOutcome.result).fireAgeFractional
    const draftAge = toSimResult(draftOutcome.result).fireAgeFractional
    const expectedDelta =
      baselineAge != null && draftAge != null ? Math.round((draftAge - baselineAge) * 12) : null

    expect(actual).toEqual({ baselineAge, draftAge, deltaMonths: expectedDelta })
  })

  it('draftEvent = null (verwijderen) → baselineAge === draftAge, deltaMonths 0', () => {
    const baseline = makeBaseline()
    const otherEvents = [makeEvent('a', 50, 500)]

    const actual = computeFreedomShift(baseline, otherEvents, null)
    const outcome = directOutcome(baseline, otherEvents)
    if (!outcome.ok) throw new Error('kernel-outcome was niet ok — fixture ongeldig')
    const age = toSimResult(outcome.result).fireAgeFractional

    expect(actual).toEqual({ baselineAge: age, draftAge: age, deltaMonths: 0 })
  })

  it('kern-fout op de baseline → beide leeftijden null, deltaMonths null', () => {
    const baseline = makeBaseline({ ...PROFILE, date_of_birth: null })
    const actual = computeFreedomShift(baseline, [], makeEvent('a', 50, 500))
    expect(actual).toEqual({ baselineAge: null, draftAge: null, deltaMonths: null })
  })
})
