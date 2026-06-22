import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  _reducer,
  _initialState,
  _resolveRestoredStep,
  _firstNavigationRecoveryStep,
} from './page'
import { ALL_MODULES } from '@/lib/module-registry'

// The component module imports a CSS file and a chain of client components
// (onboarding-identity, onboarding-inkomen, etc.) plus `@/lib/supabase/client`.
// Vitest/Vite handle the CSS import natively. The component imports live at
// the top of the module but they don't execute at import time — their
// side-effect surface is limited to `createClient` being called inside the
// component body, which we never invoke here. So importing `_reducer` and the
// helpers should be safe in a jsdom environment.

// Actieve volgorde sinds jun 2026: doel-stap ("Waar help ik je mee?") en het
// news-only-pad zijn verwijderd — identity is de eerste content-stap.
const NEW_ACTIVE_ORDER = [
  'identity',
  'inkomen',
  'bezittingen',
  'spaardoel',
  'klaar',
  'saving',
  'success',
] as const

describe('onboarding _resolveRestoredStep (self-healing restore)', () => {
  it('returns the saved step unchanged when it is in the active order', () => {
    const result = _resolveRestoredStep('bezittingen', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'bezittingen', healed: false })
  })

  it('heals a legacy "budgets" lastStep to the new "klaar" step', () => {
    // Sinds fase 3 (mei 2026) is `budgets` geen actieve stap meer. Drafts
    // van vóór de redesign hebben 'm wel als laatste positie. LEGACY_STEP_MAP
    // mapt 'm naar de dichtstbijzijnde nieuwe stap — `klaar`.
    const result = _resolveRestoredStep('budgets', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'klaar', healed: true })
  })

  it('heals a legacy "horizon" lastStep to "klaar"', () => {
    const result = _resolveRestoredStep('horizon', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'klaar', healed: true })
  })

  it('heals a legacy "intro" lastStep to "identity"', () => {
    const result = _resolveRestoredStep('intro', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'identity', healed: true })
  })

  it('heals a legacy "goal" lastStep to "identity"', () => {
    const result = _resolveRestoredStep('goal', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'identity', healed: true })
  })

  it('heals the removed "doel" step to "identity"', () => {
    // De doel-stap is in jun 2026 verwijderd — drafts die daar gepauzeerd
    // waren landen op de nieuwe eerste stap.
    const result = _resolveRestoredStep('doel', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'identity', healed: true })
  })

  it('heals the removed "nieuws_only" step to "identity"', () => {
    // Het news-only-pad is samen met de doel-stap verwijderd.
    const result = _resolveRestoredStep('nieuws_only', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'identity', healed: true })
  })

  it('heals legacy "extras" step name directly to "bezittingen"', () => {
    const result = _resolveRestoredStep('extras', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'bezittingen', healed: true })
  })

  it('falls back to identity when the saved step is not in the canonical union', () => {
    const result = _resolveRestoredStep('verzonnen_stap', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'identity', healed: true })
  })

  it('lands on identity when there is no saved step', () => {
    const result = _resolveRestoredStep(undefined, [...NEW_ACTIVE_ORDER])
    expect(result.step).toBe('identity')
  })

  it('heals legacy "intent" step name directly to "identity"', () => {
    const result = _resolveRestoredStep('intent', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'identity', healed: true })
  })

  it('heals legacy "modules" step name directly to "identity"', () => {
    const result = _resolveRestoredStep('modules', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'identity', healed: true })
  })

  it('heals legacy "persona" step name directly to "identity"', () => {
    const result = _resolveRestoredStep('persona', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'identity', healed: true })
  })
})

describe('onboarding _initialState — modules default aan', () => {
  it('starts on identity with all modules active', () => {
    // Sinds jun 2026 is er geen doel-/module-keuze meer in onboarding:
    // alle modules staan default aan, gating gebeurt via abonnement +
    // user-toggles buiten de onboarding.
    expect(_initialState.step).toBe('identity')
    expect(_initialState.activeModules).toEqual([...ALL_MODULES])
    expect(_initialState.selectedGoals).toEqual([])
  })
})

describe('onboarding _reducer — RESTORE_STATE', () => {
  const baseIdentity = {
    full_name: 'Jan Paul',
    date_of_birth: '1986-04-05',
    household_type: 'solo',
    number_of_children: 0,
    net_monthly_income: '3500',
    estimated_yearly_income: '42000',
    estimated_monthly_expenses: '2200',
  }

  // HorizonData shape — pass-through only; we only care about restore behavior.
  const baseHorizon = _initialState.horizon

  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('restores a valid lastStep without warning and forces all modules on', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: {
        identity: baseIdentity as (typeof _initialState)['identity'],
        selectedGoals: ['grip-uitgaven'],
        activeModules: ['budgetteren'],
        horizon: baseHorizon,
        budgetAmounts: {},
        quickAssets: [],
        quickDebts: [],
        lastStep: 'bezittingen',
      },
    })
    expect(result.step).toBe('bezittingen')
    // Module-keuze uit oude drafts wordt genegeerd — alles aan.
    expect(result.activeModules).toEqual([...ALL_MODULES])
    expect(result.selectedGoals).toEqual(['grip-uitgaven'])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('behoudt het maand-inkomensveld bij restore (jun 2026: inkomen per maand)', () => {
    // Sinds jun 2026 is `net_monthly_income` het primaire inkomensveld in de
    // onboarding (uitgevraagd per maand, net als de uitgaven). RESTORE_STATE
    // merget over de _initialState-shape, dus het maandbedrag moet behouden
    // blijven én het canonieke jaarveld (×12) consistent meekomen.
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: {
        identity: {
          full_name: 'Jan Paul',
          date_of_birth: '1986-04-05',
          household_type: 'solo',
          number_of_children: 0,
          net_monthly_income: '3000',
          estimated_yearly_income: '36000',
          estimated_monthly_expenses: '2100',
        } as (typeof _initialState)['identity'],
        selectedGoals: [],
        activeModules: ['budgetteren'],
        horizon: baseHorizon,
        budgetAmounts: {},
        quickAssets: [],
        quickDebts: [],
        lastStep: 'inkomen',
      },
    })
    expect(result.identity.net_monthly_income).toBe('3000')
    // Jaarveld blijft de canonieke spiegel (3000 × 12).
    expect(result.identity.estimated_yearly_income).toBe('36000')
  })

  it('migrates a legacy single-goal draft to a selectedGoals array', () => {
    // Een draft van vóór fase 3 had `goal: GoalSlug | null`. RESTORE_STATE
    // wrapt single → array.
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: {
        identity: baseIdentity as (typeof _initialState)['identity'],
        selectedGoals: [],
        goal: 'grip-uitgaven',
        activeModules: ['budgetteren'],
        horizon: baseHorizon,
        budgetAmounts: {},
        quickAssets: [],
        quickDebts: [],
        lastStep: 'bezittingen',
      },
    })
    expect(result.selectedGoals).toEqual(['grip-uitgaven'])
  })

  it('migrates a legacy "budgets" lastStep to "klaar"', () => {
    // Een draft die was opgeslagen op de oude `budgets`-stap. Sinds fase 3
    // mapt die naar `klaar` — bewust een healed-fallback zodat de gebruiker
    // niet terug naar het begin gestuurd wordt.
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: {
        identity: baseIdentity as (typeof _initialState)['identity'],
        selectedGoals: ['grip-uitgaven'],
        activeModules: ['budgetteren'],
        horizon: baseHorizon,
        budgetAmounts: {},
        quickAssets: [],
        quickDebts: [],
        // Cast omdat de persisted shape getypeerd is op de huidige union,
        // maar we simuleren een draft van vóór de flow-change.
        lastStep: 'budgets' as (typeof _initialState)['step'],
      },
    })
    expect(result.step).toBe('klaar')
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy.mock.calls[0][0]).toContain('budgets')
    expect(warnSpy.mock.calls[0][0]).toContain('klaar')
  })

  it('heals a news-only draft (lastStep nieuws_only) back to identity', () => {
    // News-only-pad is verwijderd: een draft die daar gepauzeerd was gaat
    // de normale flow in, met alle modules aan.
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: {
        identity: baseIdentity as (typeof _initialState)['identity'],
        selectedGoals: [],
        activeModules: ['nieuws'],
        horizon: baseHorizon,
        budgetAmounts: {},
        quickAssets: [],
        quickDebts: [],
        lastStep: 'nieuws_only' as unknown as (typeof _initialState)['step'],
      },
    })
    expect(result.step).toBe('identity')
    expect(result.activeModules).toEqual([...ALL_MODULES])
    expect(warnSpy).toHaveBeenCalledOnce()
  })

  it('falls back to identity for an unknown lastStep', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: {
        identity: baseIdentity as (typeof _initialState)['identity'],
        selectedGoals: [],
        activeModules: ['budgetteren'],
        horizon: baseHorizon,
        budgetAmounts: {},
        quickAssets: [],
        quickDebts: [],
        lastStep: 'verzonnen_stap' as unknown as (typeof _initialState)['step'],
      },
    })
    expect(result.step).toBe('identity')
    expect(warnSpy).toHaveBeenCalledOnce()
  })
})

describe('onboarding _reducer — SET_SPAARDOEL', () => {
  it('replaces the spaardoel substate with the dispatched payload', () => {
    const result = _reducer(_initialState, {
      type: 'SET_SPAARDOEL',
      data: {
        presetKey: 'noodfonds',
        name: 'Mijn buffer',
        target_value: '7500',
        target_date: '2027-01',
        skipped: false,
      },
    })
    expect(result.spaardoel).toEqual({
      presetKey: 'noodfonds',
      name: 'Mijn buffer',
      target_value: '7500',
      target_date: '2027-01',
      skipped: false,
    })
  })

  it('marks the spaardoel as skipped without persisting a partial entry', () => {
    // Skip-flow dispatch — wis pre-fill velden zodat handleSaveOwnData
    // niet alsnog een onboardingGoal-payload bouwt.
    const result = _reducer(_initialState, {
      type: 'SET_SPAARDOEL',
      data: {
        presetKey: null,
        name: '',
        target_value: '',
        target_date: '',
        skipped: true,
      },
    })
    expect(result.spaardoel.skipped).toBe(true)
    expect(result.spaardoel.presetKey).toBeNull()
    expect(result.spaardoel.name).toBe('')
  })

  it('does not affect other state fields', () => {
    const result = _reducer(_initialState, {
      type: 'SET_SPAARDOEL',
      data: {
        presetKey: 'vakantie',
        name: 'Zomer',
        target_value: '2500',
        target_date: '',
        skipped: false,
      },
    })
    expect(result.selectedGoals).toEqual(_initialState.selectedGoals)
    expect(result.activeModules).toEqual(_initialState.activeModules)
    expect(result.identity).toEqual(_initialState.identity)
  })
})

describe('onboarding _resolveRestoredStep — spaardoel + klaar', () => {
  it('keeps a klaar lastStep on klaar without retroactively routing to spaardoel', () => {
    // Belangrijke check: een gebruiker die de vorige flow op `klaar` had
    // afgesloten moet daar landen, niet stilzwijgend terug naar de nieuwe
    // tussenstap `spaardoel`. De membership-check in active-order matched
    // direct op `klaar`, dus geen healing nodig.
    const result = _resolveRestoredStep('klaar', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'klaar', healed: false })
  })

  it('restores a draft saved on spaardoel without warning', () => {
    const result = _resolveRestoredStep('spaardoel', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'spaardoel', healed: false })
  })
})

describe('onboarding _reducer — RESTORE_STATE met spaardoel', () => {
  const baseIdentity = {
    full_name: 'Jan Paul',
    date_of_birth: '1986-04-05',
    household_type: 'solo',
    number_of_children: 0,
    net_monthly_income: '3500',
    estimated_yearly_income: '42000',
    estimated_monthly_expenses: '2200',
  }
  const baseHorizon = _initialState.horizon

  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('restores a saved spaardoel substate verbatim', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: {
        identity: baseIdentity as (typeof _initialState)['identity'],
        selectedGoals: ['noodfonds'],
        activeModules: ['budgetteren', 'inzicht_acties'],
        horizon: baseHorizon,
        budgetAmounts: {},
        quickAssets: [],
        quickDebts: [],
        spaardoel: {
          presetKey: 'vakantie',
          name: 'Italië 2027',
          target_value: '3500',
          target_date: '2027-06',
          skipped: false,
        },
        lastStep: 'spaardoel',
      },
    })
    expect(result.step).toBe('spaardoel')
    expect(result.spaardoel.presetKey).toBe('vakantie')
    expect(result.spaardoel.name).toBe('Italië 2027')
  })

  it('falls back to the initial spaardoel state when missing from a legacy draft', () => {
    // Een draft van vóór de spaardoel-stap kent het veld niet. RESTORE_STATE
    // moet dan terugvallen op `_initialState.spaardoel`.
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: {
        identity: baseIdentity as (typeof _initialState)['identity'],
        selectedGoals: ['grip-uitgaven'],
        activeModules: ['budgetteren'],
        horizon: baseHorizon,
        budgetAmounts: {},
        quickAssets: [],
        quickDebts: [],
        // spaardoel ontbreekt bewust — legacy draft simulatie
        lastStep: 'klaar',
      },
    })
    expect(result.step).toBe('klaar')
    expect(result.spaardoel).toEqual(_initialState.spaardoel)
  })
})

describe('onboarding _firstNavigationRecoveryStep', () => {
  it('returns the first content step for the new active order', () => {
    const result = _firstNavigationRecoveryStep([...NEW_ACTIVE_ORDER])
    // Eerste niet-terminal step is `identity` — saving/success worden
    // overgeslagen, doel bestaat niet meer.
    expect(result).toBe('identity')
  })

  it('falls back to identity when the active order is empty', () => {
    const result = _firstNavigationRecoveryStep([])
    expect(result).toBe('identity')
  })

  it('mirrors the behaviour goToNext/goToBack rely on for an orphaned step', () => {
    // This covers the navigation spec requirement: when state.step is not
    // in activeStepOrder (idx === -1), the recovery helper produces the
    // first valid non-terminal step for SET_STEP to dispatch to.
    const fallback = _firstNavigationRecoveryStep([...NEW_ACTIVE_ORDER])
    expect(fallback).toBe('identity')
  })
})
