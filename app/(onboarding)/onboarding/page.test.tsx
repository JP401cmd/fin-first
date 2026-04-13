import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  _reducer,
  _initialState,
  _resolveRestoredStep,
  _firstNavigationRecoveryStep,
} from './page'

// The component module imports a CSS file and a chain of client components
// (onboarding-intro, onboarding-horizon, etc.) plus `@/lib/supabase/client`.
// Vitest/Vite handle the CSS import natively. The component imports live at
// the top of the module but they don't execute at import time — their
// side-effect surface is limited to `createClient` being called inside the
// component body, which we never invoke here. So importing `_reducer` and the
// helpers should be safe in a jsdom environment.

describe('onboarding _resolveRestoredStep (self-healing restore)', () => {
  it('returns the saved step unchanged when it is in the active order', () => {
    const result = _resolveRestoredStep('budgets', [
      'intro',
      'identity',
      'intent',
      'bezittingen',
      'budgets',
      'saving',
      'success',
    ])
    expect(result).toEqual({ step: 'budgets', healed: false })
  })

  it('falls back from budgets to nieuws_only when the user is in nieuws-only mode', () => {
    // Simulates: user previously had a draft on the `budgets` step, then
    // changed module selection to just "nieuws", so the active flow now
    // only contains `nieuws_only` between modules and saving.
    const result = _resolveRestoredStep('budgets', [
      'intro',
      'identity',
      'intent',
      'nieuws_only',
      'saving',
      'success',
    ])
    // budgets (canonical idx 4) is past nieuws_only (canonical idx 7) in
    // the canonical order? No — nieuws_only is 7, budgets is 4, so
    // nieuws_only IS >= budgets. The walk-forward lands on nieuws_only.
    expect(result.healed).toBe(true)
    expect(result.step).toBe('nieuws_only')
  })

  it('falls back to identity when the saved step is not in the canonical union', () => {
    const result = _resolveRestoredStep('verzonnen_stap', [
      'intro',
      'identity',
      'intent',
      'bezittingen',
      'budgets',
      'saving',
      'success',
    ])
    expect(result).toEqual({ step: 'identity', healed: true })
  })

  it('never falls back to intro — identity is the minimum', () => {
    // Missing lastStep should also land on identity, not intro, because
    // the restore was triggered by the presence of saved data.
    const result = _resolveRestoredStep(undefined, [
      'intro',
      'identity',
      'intent',
      'saving',
      'success',
    ])
    expect(result.step).toBe('identity')
  })

  it('preserves the existing migration path (persona → intent handled upstream)', () => {
    // The migration map in `loadFromLocalStorage` renames 'persona'/'modules'
    // to 'intent' before dispatch, so by the time `_resolveRestoredStep`
    // sees it, it should be a valid 'intent' step.
    const result = _resolveRestoredStep('intent', [
      'intro',
      'identity',
      'intent',
      'bezittingen',
      'saving',
      'success',
    ])
    expect(result).toEqual({ step: 'intent', healed: false })
  })

  it('walks forward past removed steps to find the next valid one', () => {
    // Imagine a user who had `horizon` saved but the flow was reduced to
    // no toekomstplannen. Canonical-wise horizon is between budgets and
    // preferences. The walk should land on the first active step whose
    // canonical index is >= horizon's — there is none here, so identity.
    const result = _resolveRestoredStep('horizon', [
      'intro',
      'identity',
      'intent',
      'bezittingen',
      'saving',
      'success',
    ])
    expect(result).toEqual({ step: 'identity', healed: true })
  })
})

describe('onboarding _reducer — RESTORE_STATE', () => {
  const baseIdentity = {
    full_name: 'Jan Paul',
    date_of_birth: '1986-04-05',
    household_type: 'solo',
    number_of_children: 0,
    net_monthly_income: '3500',
    estimated_monthly_expenses: '2200',
  }

  // PreferencesData and HorizonData shapes — use `as any` because the full
  // shapes aren't exported and we only care about pass-through here.
  const basePreferences = {} as unknown as (typeof _initialState)['preferences']
  const baseHorizon = _initialState.horizon

  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('restores a valid lastStep without warning', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: {
        identity: baseIdentity as (typeof _initialState)['identity'],
        intent: null,
        activeModules: ['budgetteren'],
        horizon: baseHorizon,
        newsDescription: '',
        extraction: null,
        budgetAmounts: {},
        bankAccounts: [],
        assets: [],
        debts: [],
        preferences: basePreferences,
        lastStep: 'budgets',
      },
    })
    expect(result.step).toBe('budgets')
    expect(result.activeModules).toEqual(['budgetteren'])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('heals a lastStep that no longer belongs in the active order', () => {
    // News-only flow: saved step was `budgets` but the active order now
    // only has `nieuws_only` between `modules` and `saving`.
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: {
        identity: baseIdentity as (typeof _initialState)['identity'],
        intent: null,
        activeModules: ['nieuws'],
        horizon: baseHorizon,
        newsDescription: '',
        extraction: null,
        budgetAmounts: {},
        bankAccounts: [],
        assets: [],
        debts: [],
        preferences: basePreferences,
        // Cast because the persisted shape is typed to the current union,
        // but we're simulating a draft saved before the flow changed.
        lastStep: 'budgets' as (typeof _initialState)['step'],
      },
    })
    expect(result.step).toBe('nieuws_only')
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy.mock.calls[0][0]).toContain('budgets')
    expect(warnSpy.mock.calls[0][0]).toContain('nieuws_only')
  })

  it('falls back to identity for an unknown lastStep', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: {
        identity: baseIdentity as (typeof _initialState)['identity'],
        intent: null,
        activeModules: ['budgetteren'],
        horizon: baseHorizon,
        newsDescription: '',
        extraction: null,
        budgetAmounts: {},
        bankAccounts: [],
        assets: [],
        debts: [],
        preferences: basePreferences,
        lastStep: 'verzonnen_stap' as unknown as (typeof _initialState)['step'],
      },
    })
    expect(result.step).toBe('identity')
    expect(warnSpy).toHaveBeenCalledOnce()
  })
})

describe('onboarding _firstNavigationRecoveryStep', () => {
  it('returns identity for a full flow', () => {
    const result = _firstNavigationRecoveryStep([
      'intro',
      'identity',
      'intent',
      'bezittingen',
      'budgets',
      'saving',
      'success',
    ])
    // First non-intro / non-terminal step is identity.
    expect(result).toBe('identity')
  })

  it('returns the first selectable step when identity is absent', () => {
    const result = _firstNavigationRecoveryStep([
      'intro',
      'intent',
      'nieuws_only',
      'saving',
      'success',
    ])
    expect(result).toBe('intent')
  })

  it('falls back to identity when the active order is empty', () => {
    const result = _firstNavigationRecoveryStep([])
    expect(result).toBe('identity')
  })

  it('mirrors the behaviour goToNext/goToBack rely on for an orphaned step', () => {
    // This covers the navigation spec requirement: when state.step is not
    // in activeStepOrder (idx === -1), the recovery helper produces the
    // first valid non-intro step for SET_STEP to dispatch to.
    const activeStepOrder = [
      'intro',
      'identity',
      'intent',
      'bezittingen',
      'saving',
      'success',
    ] as const
    // `state.step` would be something like 'budgets' here — not in the
    // active order. The helper is what the component dispatches to.
    const fallback = _firstNavigationRecoveryStep([...activeStepOrder])
    expect(fallback).toBe('identity')
  })
})
