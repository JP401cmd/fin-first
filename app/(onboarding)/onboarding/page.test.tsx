import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  _reducer,
  _initialState,
  _resolveRestoredStep,
  _firstNavigationRecoveryStep,
} from './page'

// The component module imports a CSS file and a chain of client components
// (onboarding-doel, onboarding-identity, etc.) plus `@/lib/supabase/client`.
// Vitest/Vite handle the CSS import natively. The component imports live at
// the top of the module but they don't execute at import time — their
// side-effect surface is limited to `createClient` being called inside the
// component body, which we never invoke here. So importing `_reducer` and the
// helpers should be safe in a jsdom environment.

const NEW_ACTIVE_ORDER = [
  'doel',
  'identity',
  'inkomen',
  'bezittingen',
  'spaardoel',
  'klaar',
  'saving',
  'success',
] as const

const NEWS_ONLY_ACTIVE_ORDER = [
  'doel',
  'nieuws_only',
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

  it('heals a legacy "intro" lastStep to "doel"', () => {
    const result = _resolveRestoredStep('intro', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'doel', healed: true })
  })

  it('heals a legacy "goal" lastStep to "doel"', () => {
    const result = _resolveRestoredStep('goal', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'doel', healed: true })
  })

  it('heals legacy "extras" step name directly to "bezittingen"', () => {
    const result = _resolveRestoredStep('extras', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'bezittingen', healed: true })
  })

  it('falls back from budgets to klaar in news-only mode (closest valid step)', () => {
    // News-only active order bevat alleen `doel` + `nieuws_only`. `budgets`
    // mapt naar `klaar` (LEGACY_STEP_MAP), maar `klaar` zit niet in de
    // news-only order — dus walk-forward landt op de eerste actieve stap
    // met canonical-idx ≥ klaar's idx. `nieuws_only` voldoet aan die
    // voorwaarde in CANONICAL_STEP_ORDER.
    const result = _resolveRestoredStep('budgets', [...NEWS_ONLY_ACTIVE_ORDER])
    expect(result.healed).toBe(true)
    expect(result.step).toBe('nieuws_only')
  })

  it('falls back to identity when the saved step is not in the canonical union', () => {
    const result = _resolveRestoredStep('verzonnen_stap', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'identity', healed: true })
  })

  it('never falls back to doel — identity is the minimum', () => {
    // Missing lastStep should also land on identity, not doel, because
    // the restore was triggered by the presence of saved data.
    const result = _resolveRestoredStep(undefined, [...NEW_ACTIVE_ORDER])
    expect(result.step).toBe('identity')
  })

  it('heals legacy "intent" step name directly to "doel"', () => {
    // The migration map renames the legacy 'intent' step to 'doel' via
    // LEGACY_STEP_MAP. Active order bevat `doel`, dus dat is de uitkomst.
    const result = _resolveRestoredStep('intent', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'doel', healed: true })
  })

  it('heals legacy "modules" step name directly to "doel"', () => {
    const result = _resolveRestoredStep('modules', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'doel', healed: true })
  })

  it('heals legacy "persona" step name directly to "doel"', () => {
    const result = _resolveRestoredStep('persona', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'doel', healed: true })
  })
})

describe('onboarding _reducer — SET_GOAL multi-select', () => {
  it('merges modules from multiple goals into a deduped union', () => {
    // 'grip-uitgaven' → ['budgetteren']
    // 'eerder-stoppen' → ['vermogensregistratie', 'toekomstplannen', 'inzicht_acties']
    // Verwachte unie (in volgorde van eerste voorkomen):
    const result = _reducer(_initialState, {
      type: 'SET_GOAL',
      goals: ['grip-uitgaven', 'eerder-stoppen'],
    })
    expect(result.selectedGoals).toEqual(['grip-uitgaven', 'eerder-stoppen'])
    expect(result.activeModules).toEqual([
      'budgetteren',
      'vermogensregistratie',
      'toekomstplannen',
      'inzicht_acties',
    ])
  })

  it('dedupes overlapping modules across goals', () => {
    // 'grip-uitgaven' → ['budgetteren']
    // 'noodfonds' → ['budgetteren', 'inzicht_acties']
    // budgetteren mag maar éénmaal in de unie staan.
    const result = _reducer(_initialState, {
      type: 'SET_GOAL',
      goals: ['grip-uitgaven', 'noodfonds'],
    })
    expect(result.activeModules).toEqual(['budgetteren', 'inzicht_acties'])
  })

  it('clears modules when goals array is empty', () => {
    // Start vanuit een state met actieve modules en zet vervolgens een
    // lege goal-array — modules moeten teruggaan naar []
    const withGoal = _reducer(_initialState, {
      type: 'SET_GOAL',
      goals: ['grip-uitgaven'],
    })
    const cleared = _reducer(withGoal, { type: 'SET_GOAL', goals: [] })
    expect(cleared.selectedGoals).toEqual([])
    expect(cleared.activeModules).toEqual([])
  })
})

describe('onboarding _reducer — SET_NEWS_ONLY', () => {
  it('clears selectedGoals and sets activeModules to [nieuws]', () => {
    const withGoals = _reducer(_initialState, {
      type: 'SET_GOAL',
      goals: ['grip-uitgaven', 'eerder-stoppen'],
    })
    const result = _reducer(withGoals, { type: 'SET_NEWS_ONLY' })
    expect(result.selectedGoals).toEqual([])
    expect(result.activeModules).toEqual(['nieuws'])
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

  // HorizonData shape — pass-through only; we only care about restore behavior.
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
        selectedGoals: ['grip-uitgaven'],
        activeModules: ['budgetteren'],
        horizon: baseHorizon,
        newsDescription: '',
        extraction: null,
        budgetAmounts: {},
        quickAssets: [],
        quickDebts: [],
        lastStep: 'bezittingen',
      },
    })
    expect(result.step).toBe('bezittingen')
    expect(result.activeModules).toEqual(['budgetteren'])
    expect(result.selectedGoals).toEqual(['grip-uitgaven'])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('migrates a legacy single-goal draft to a selectedGoals array', () => {
    // Een draft van vóór fase 3 had `goal: GoalSlug | null`. RESTORE_STATE
    // wrapt single → array en zet activeModules op de daarbij horende
    // preset.
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: {
        identity: baseIdentity as (typeof _initialState)['identity'],
        selectedGoals: [],
        goal: 'grip-uitgaven',
        activeModules: ['budgetteren'],
        horizon: baseHorizon,
        newsDescription: '',
        extraction: null,
        budgetAmounts: {},
        quickAssets: [],
        quickDebts: [],
        lastStep: 'bezittingen',
      },
    })
    expect(result.selectedGoals).toEqual(['grip-uitgaven'])
    expect(result.activeModules).toEqual(['budgetteren'])
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
        newsDescription: '',
        extraction: null,
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

  it('heals a lastStep that no longer belongs in the news-only active order', () => {
    // News-only flow heeft alleen doel + nieuws_only — een legacy
    // bezittingen-lastStep moet healen naar nieuws_only (eerste actieve stap
    // ≥ bezittingen in canonical).
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: {
        identity: baseIdentity as (typeof _initialState)['identity'],
        selectedGoals: [],
        activeModules: ['nieuws'],
        horizon: baseHorizon,
        newsDescription: '',
        extraction: null,
        budgetAmounts: {},
        quickAssets: [],
        quickDebts: [],
        lastStep: 'bezittingen' as (typeof _initialState)['step'],
      },
    })
    expect(result.step).toBe('nieuws_only')
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
        newsDescription: '',
        extraction: null,
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
    // Start vanuit een state met goals + identity, dispatch spaardoel, check
    // dat selectedGoals / identity / quickAssets ongemoeid blijven.
    const withGoal = _reducer(_initialState, {
      type: 'SET_GOAL',
      goals: ['noodfonds'],
    })
    const result = _reducer(withGoal, {
      type: 'SET_SPAARDOEL',
      data: {
        presetKey: 'vakantie',
        name: 'Zomer',
        target_value: '2500',
        target_date: '',
        skipped: false,
      },
    })
    expect(result.selectedGoals).toEqual(['noodfonds'])
    expect(result.activeModules).toEqual(withGoal.activeModules)
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
        newsDescription: '',
        extraction: null,
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
        newsDescription: '',
        extraction: null,
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
    // Eerste niet-terminal step is `doel` — saving/success worden
    // overgeslagen, intro bestaat niet meer.
    expect(result).toBe('doel')
  })

  it('returns the first selectable step when news-only mode is active', () => {
    const result = _firstNavigationRecoveryStep([...NEWS_ONLY_ACTIVE_ORDER])
    expect(result).toBe('doel')
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
    expect(fallback).toBe('doel')
  })
})
