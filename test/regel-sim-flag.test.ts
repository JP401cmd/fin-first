import { describe, it, expect } from 'vitest'
import { runRegelProjection, type RegelSimSnapshot } from '@/lib/future/regel-sim'
import { DEFAULT_FIRE_STRATEGY, type FireStrategyConfig } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import type { ConvergentieRawContext } from '@/lib/horizon-kernel/convergentie-router'

/**
 * FASE 6 stap 5A — kernel-only. `runRegelProjection` (de /toekomst-Voorkeuren live-sim-
 * editors) draait uitsluitend via `computeConvergentieProjection` (de horizon-kernel) op
 * de meegegeven `rawContext`. Er is geen v2-tak/`kernelEnabled`-schakelaar meer — de
 * `RegelSimSnapshot` draagt de rauwe kernel-context direct (`rawContext`), niet meer een
 * `unifiedInput`/`useV2`-paar.
 */

const YEARLY_EXPENSES = 30_000
const ANNUAL_SAVINGS = 24_000
const DOB = '1986-01-01'

const fireStrategy: FireStrategyConfig = {
  ...DEFAULT_FIRE_STRATEGY,
  strategy: 'deplete',
  endAge: 90,
  legacyAmount: 0,
}

const rawContext: ConvergentieRawContext = {
  profile: {
    date_of_birth: DOB,
    net_monthly_income: (YEARLY_EXPENSES + ANNUAL_SAVINGS) / 12,
    estimated_monthly_expenses: YEARLY_EXPENSES / 12,
    yearly_essential_expenses: YEARLY_EXPENSES,
    retirement_expense_method: 'essential_budgets',
    expected_return: 0.07,
    inflation_rate: 0.02,
    box3_method: 'forfaitair',
    fire_end_strategy: 'deplete',
    fire_end_age: 90,
    fire_legacy_amount: 0,
  },
  assets: [],
  debts: [],
  lifeEvents: [],
  yearlyExpenses: YEARLY_EXPENSES,
}

const baseSnapshot: RegelSimSnapshot = {
  rawContext,
  fireStrategy,
  withdrawalStrategy: WITHDRAWAL_DEFAULTS,
  aowAgeInt: 67,
  aowFractional: 67,
}

describe('runRegelProjection — kernel-only', () => {
  it('is deterministisch op dezelfde snapshot (twee runs identiek)', () => {
    const a = runRegelProjection(baseSnapshot)
    const b = runRegelProjection(baseSnapshot)
    expect(a).toEqual(b)
  })

  it('levert rijen en een bereikbare vrijheidsleeftijd op een geldige rawContext', () => {
    const r = runRegelProjection(baseSnapshot)
    expect(r.rows.length).toBeGreaterThan(0)
    expect(r.fireAgeFractional).not.toBeNull()
  })

  it('zonder geboortedatum (kern-fout) levert lege rijen + null fireAge', () => {
    const noDob: RegelSimSnapshot = {
      ...baseSnapshot,
      rawContext: { ...rawContext, profile: { ...rawContext.profile, date_of_birth: null } },
    }
    const r = runRegelProjection(noDob)
    expect(r.rows).toEqual([])
    expect(r.fireAgeFractional).toBeNull()
  })

  it('draft-eindstrategie werkt via het profiel door in de kernel-run', () => {
    const baseline = runRegelProjection(baseSnapshot)
    const draft = runRegelProjection(baseSnapshot, {
      fireStrategy: { ...DEFAULT_FIRE_STRATEGY, strategy: 'legacy', endAge: 90, legacyAmount: 500_000 },
    })
    // Een fors nalatenschapsdoel verandert de projectie t.o.v. de deplete-baseline.
    expect(draft).not.toEqual(baseline)
  })

  it('baseline zonder override laat de meegegeven rawContext ongewijzigd (geen default-drift)', () => {
    const before = JSON.parse(JSON.stringify(baseSnapshot.rawContext))
    runRegelProjection(baseSnapshot)
    expect(baseSnapshot.rawContext).toEqual(before)
  })
})
