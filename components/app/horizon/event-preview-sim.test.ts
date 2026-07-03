import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'
import type { PreviewBaseline } from '@/lib/strategy-preview'
import { previewSimResult } from './event-preview-sim'

/**
 * `previewSimResult`-tests (FASE 6 stap 5A — kernel-only). Sinds de v2-verwijdering
 * draait de EventPane-preview onvoorwaardelijk via de horizon-kernel
 * (`computeConvergentieProjection`). Deze rooktest bewijst dat de preview op een geldige
 * rauwe kernel-context een bruikbaar `SimResult` levert en dat een extra inkomens-event
 * de vrijheidsdatum niet naar achteren schuift (monotone richting) — geen exacte
 * golden-getallen (die bewaakt de kernel-parity-suite).
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

/** Rauwe kernel-context (mínus lifeEvents) waarmee de EventPane de preview voedt. */
function makeBaseline(): PreviewBaseline {
  return {
    rawContext: {
      profile: PROFILE,
      assets: makeAssets(),
      debts: [],
      aowRows: [],
      yearlyExpenses: 30_000,
    },
  }
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

describe('previewSimResult — kernel-doorrekening', () => {
  it.each(Object.keys(EVENT_SETS))(
    'levert een niet-lege SimResult voor de kernel-context (%s)',
    (label) => {
      const result = previewSimResult(makeBaseline(), EVENT_SETS[label]!)
      expect(result.rows.length).toBeGreaterThan(0)
    },
  )

  it('extra maandinkomen brengt de vrijheidsdatum niet later (monotone richting)', () => {
    const baseline = makeBaseline()
    const zonder = previewSimResult(baseline, EVENT_SETS['geen events']!)
    const met = previewSimResult(baseline, [makeEvent('extra', 45, 1000)])
    if (zonder.fireAgeFractional !== null && met.fireAgeFractional !== null) {
      expect(met.fireAgeFractional).toBeLessThanOrEqual(zonder.fireAgeFractional + 1e-6)
    }
  })
})
