/**
 * Roadmap M — flex-spending: adapter-afleiding + MC-richting (ADR 0042).
 *
 *  - `parseWithdrawalProfileConfig` leest de flex-velden uit de JSONB-kolom.
 *  - `buildInkomenUitgaven` leidt de nice-fractie af uit de budgetten (`is_essential`
 *    → `yearly_essential_expenses`), met override-voorrang; zonder de vlag zijn de
 *    flex-velden weggelaten (byte-identiek aan vóór roadmap M).
 *  - Integratie (MC, deterministisch — sin-hash-shocks): op een gestreste projectie
 *    geeft flex-op-nice-guardrails een ≥ slaagkans dan géén regel (Vast), omdat de
 *    nice-onttrekking in slechte runs meebeweegt terwijl must beschermd blijft.
 */

import { describe, it, expect } from 'vitest'
import { parseWithdrawalProfileConfig } from '@/lib/withdrawal-strategy'
import { buildInkomenUitgaven, type KernelAdapterProfile } from './index'
import { buildKernelInputFromApp } from './index'
import { runMonteCarlo } from '../wrappers/mc'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import type { KernelInput } from '../types'

// ── parse ────────────────────────────────────────────────────────────────────────

describe('parseWithdrawalProfileConfig — flex-velden', () => {
  it('leest flex_nice_only/flex_nice_fractie/flex_cut_step', () => {
    const c = parseWithdrawalProfileConfig({
      withdrawal_profile_config: { flex_nice_only: true, flex_nice_fractie: 0.4, flex_cut_step: 0.6 },
    })
    expect(c?.flexNiceOnly).toBe(true)
    expect(c?.flexNiceFractie).toBe(0.4)
    expect(c?.flexCutStep).toBe(0.6)
  })

  it('flex-velden afwezig → flexNiceOnly false, fractie/cut-step null', () => {
    const c = parseWithdrawalProfileConfig({ withdrawal_profile_config: { profiel: 'vast' } })
    expect(c?.flexNiceOnly).toBe(false)
    expect(c?.flexNiceFractie).toBeNull()
    expect(c?.flexCutStep).toBeNull()
  })

  it('flex_nice_only alleen bij een échte boolean true', () => {
    expect(
      parseWithdrawalProfileConfig({ withdrawal_profile_config: { flex_nice_only: 'true' } })
        ?.flexNiceOnly,
    ).toBe(false)
  })
})

// ── buildInkomenUitgaven — nice-fractie-afleiding ──────────────────────────────────

function profile(over: Partial<KernelAdapterProfile>): KernelAdapterProfile {
  return { date_of_birth: '1985-01-01', ...over }
}

describe('buildInkomenUitgaven — flex-spending', () => {
  it('vlag UIT → byte-identiek (geen flex-velden)', () => {
    const iu = buildInkomenUitgaven(
      profile({
        net_monthly_income: 4000,
        estimated_monthly_expenses: 3000,
        yearly_essential_expenses: 24_000,
        retirement_expense_method: 'custom_amount',
        retirement_custom_amount: 40_000,
      }),
    )
    expect(iu.flexNiceOnly).toBeUndefined()
    expect(iu).toEqual({
      nettoJaarinkomen: 48_000,
      nettoJaaruitgaven: 36_000,
      uitgaveNaPensioenPerJaar: 40_000,
    })
  })

  it('vlag AAN → nice-fractie afgeleid uit (uitgave − must)/uitgave', () => {
    const iu = buildInkomenUitgaven(
      profile({
        yearly_essential_expenses: 24_000,
        retirement_expense_method: 'custom_amount',
        retirement_custom_amount: 40_000,
        withdrawal_profile_config: { flex_nice_only: true },
      }),
    )
    expect(iu.flexNiceOnly).toBe(true)
    // (40000 − 24000)/40000 = 0,4.
    expect(iu.flexNiceFractiePerJaar).toBeCloseTo(0.4, 9)
    expect(iu.flexNiceCutStep).toBeUndefined()
  })

  it('expliciete override wint van de afleiding', () => {
    const iu = buildInkomenUitgaven(
      profile({
        yearly_essential_expenses: 24_000,
        retirement_expense_method: 'custom_amount',
        retirement_custom_amount: 40_000,
        withdrawal_profile_config: { flex_nice_only: true, flex_nice_fractie: 0.7, flex_cut_step: 0.6 },
      }),
    )
    expect(iu.flexNiceFractiePerJaar).toBe(0.7)
    expect(iu.flexNiceCutStep).toBe(0.6)
  })

  it('methode essential_budgets → uitgave == must → nice-fractie 0 (regel informatief)', () => {
    const iu = buildInkomenUitgaven(
      profile({
        yearly_essential_expenses: 24_000,
        retirement_expense_method: 'essential_budgets',
        withdrawal_profile_config: { flex_nice_only: true },
      }),
    )
    expect(iu.flexNiceOnly).toBe(true)
    expect(iu.flexNiceFractiePerJaar).toBe(0)
  })
})

// ── MC-richting (integratie, deterministisch) ──────────────────────────────────────

/** Persona-kernel-invoer met een flex/onttrekkings-config + een gestreste MC. */
function personaInput(cfg: {
  strategy: 'static' | 'guardrails'
  withdrawal_profile_config?: Record<string, unknown>
}): KernelInput {
  const fx = buildCompleetHorizonFixture()
  const base = buildCompleetKernelProfileBase()
  // Custom pensioenuitgave > must, zodat er een echt nice-deel is om te flexen.
  const profileRow = {
    ...base,
    withdrawal_strategy: cfg.strategy,
    retirement_expense_method: 'custom_amount' as const,
    retirement_expense_custom_amount: 60_000,
    withdrawal_profile_config: cfg.withdrawal_profile_config ?? null,
  }
  const input = buildKernelInputFromApp({
    profile: profileRow as unknown as KernelAdapterProfile,
    assets: fx.assets,
    debts: fx.debts,
    lifeEvents: fx.lifeEvents,
    aowRows: [],
  })
  // Gestreste, deterministische MC: klein aantal runs + forse sigma (sin-hash → reproduceerbaar).
  return {
    ...input,
    onzekerheid: {
      ...input.onzekerheid,
      mc: { aantalRuns: 60, sigma: 0.18, actief: true },
    },
  }
}

describe('flex-spending — MC-richting (deterministisch)', () => {
  it('flex-op-nice-guardrails ≥ slaagkans van géén regel (Vast) op een gestreste projectie', () => {
    const vast = runMonteCarlo(personaInput({ strategy: 'static' }))
    const flex = runMonteCarlo(
      personaInput({
        strategy: 'guardrails',
        withdrawal_profile_config: {
          profiel: 'guardrails',
          flex_nice_only: true,
          flex_nice_fractie: 0.4,
          flex_cut_step: 0.5,
        },
      }),
    )
    // Nice knijpt in slechte runs → minder onttrekking → hogere/gelijke slaagkans.
    expect(flex.successProbability).toBeGreaterThanOrEqual(vast.successProbability)
  })
})
