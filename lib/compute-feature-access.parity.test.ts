/**
 * lib/compute-feature-access.parity.test.ts
 *
 * PARITY-LOCK (AC2 van de layout-waterfall-refactor, jul 2026).
 *
 * De refactor "minder en slimmer laden bij elke paginawissel" verplaatst/schrapt
 * queries in app/(app)/layout.tsx, maar mag de INPUT van `computeFeatureAccess`
 * niet aanraken: assets/debts/transactions/activeSubscriptions/userFeaturePrefs
 * blijven exact hetzelfde, dus de feature-access-uitkomst moet BYTE-IDENTIEK
 * blijven.
 *
 * Deze test bevriest de uitkomst op twee representatieve fixtures
 * (met/zonder consumer-debt, met/zonder feature_preferences-overrides). Wijzigt
 * er iets aan de pure functie of aan de aannames, dan valt de snapshot om — dat
 * is precies de bewaking die AC2 vereist. `computeFeatureAccess` is puur en
 * deterministisch (geen tijd/DB), dus de snapshot is stabiel.
 */

import { describe, it, expect } from 'vitest'
import {
  computeFeatureAccess,
  type FinancialInput,
} from '@/lib/compute-feature-access'

// ── Fixture A: geen consumer-debt, geen feature_preferences-overrides ─────────
// Enkel een hypotheek (geen consumentenschuld) + gratis abonnement.
const FIXTURE_A: FinancialInput = {
  assets: [
    { current_value: 120_000 },
    { current_value: 30_000 },
  ],
  debts: [
    { current_balance: 200_000, debt_type: 'mortgage' },
  ],
  transactions: [
    { amount: 9_000, is_income: true },
    { amount: -3_000, is_income: false },
    { amount: -1_500, is_income: false },
  ],
  activeSubscriptions: [],
  userFeaturePrefs: null,
}

// ── Fixture B: mét consumer-debt én een feature_preferences-override ──────────
// Consumentenlening (raakt het hasConsumerDebt-pad in het niveau) + connected+ai
// abonnementen + één handmatig uitgezette feature (budgetbeheer).
const FIXTURE_B: FinancialInput = {
  assets: [
    { current_value: 50_000 },
  ],
  debts: [
    { current_balance: 8_000, debt_type: 'personal_loan' },
    { current_balance: 12_000, debt_type: 'car_loan' },
  ],
  transactions: [
    { amount: 6_000, is_income: true },
    { amount: -2_400, is_income: false },
  ],
  activeSubscriptions: ['connected', 'ai'],
  userFeaturePrefs: { budgetbeheer: false },
}

describe('computeFeatureAccess — parity-lock (AC2 layout-waterfall-refactor)', () => {
  it('is deterministisch: twee calls op dezelfde input zijn byte-identiek', () => {
    expect(JSON.stringify(computeFeatureAccess(FIXTURE_A))).toBe(
      JSON.stringify(computeFeatureAccess(FIXTURE_A)),
    )
    expect(JSON.stringify(computeFeatureAccess(FIXTURE_B))).toBe(
      JSON.stringify(computeFeatureAccess(FIXTURE_B)),
    )
  })

  it('fixture A (geen consumer-debt, geen overrides) — bevroren uitkomst', () => {
    const r = computeFeatureAccess(FIXTURE_A)
    // Afgeleide kerngetallen (aggregatie ongewijzigd door de refactor).
    // totalAssets 150k − debts 200k = −50k
    expect(r.netWorth).toBe(-50_000)
    // expenses = 4_500 over 3 maanden → 1_500/maand
    expect(r.monthlyExpenses).toBe(1_500)
    // Gratis-abonnement: gratis-features toegankelijk, betaalde tier-locked.
    expect(r.features.vermogensbeheer).toEqual({
      accessible: true,
      reason: 'accessible',
      defaultEnabled: true,
    })
    expect(r.features.bankintegratie).toEqual({
      accessible: false,
      reason: 'tier_locked',
      requiredTier: 'connected',
      defaultEnabled: false,
    })
    expect(r.features.ai_assistent.reason).toBe('tier_locked')
    // Volledige map bevroren (byte-identiek lock).
    expect(JSON.stringify(r)).toMatchSnapshot()
  })

  it('fixture B (consumer-debt + feature_preferences-override) — bevroren uitkomst', () => {
    const r = computeFeatureAccess(FIXTURE_B)
    expect(r.netWorth).toBe(30_000)
    expect(r.monthlyExpenses).toBe(800)
    // connected + ai actief → betaalde features toegankelijk.
    expect(r.features.bankintegratie.accessible).toBe(true)
    expect(r.features.ai_assistent.accessible).toBe(true)
    // Handmatig uitgezette feature → user_disabled (override respecteert prefs).
    expect(r.features.budgetbeheer).toEqual({
      accessible: false,
      reason: 'user_disabled',
      defaultEnabled: true,
    })
    // Volledige map bevroren (byte-identiek lock).
    expect(JSON.stringify(r)).toMatchSnapshot()
  })
})
