import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  _reducer,
  _initialState,
  _resolveRestoredStep,
  _firstNavigationRecoveryStep,
  buildPensionParseResult,
} from './page'
import { ALL_MODULES } from '@/lib/module-registry'
import type { PensionDraft } from '@/components/onboarding/onboarding-pensioen'

// The component module imports a CSS file and a chain of client components
// (onboarding-identity, onboarding-inkomen, etc.) plus `@/lib/supabase/client`.
// Vitest/Vite handle the CSS import natively. The component imports live at the
// top of the module but they don't execute at import time, so importing
// `_reducer` and the helpers is safe in a jsdom environment.

// Actieve volgorde sinds jun 2026 — begeleide één-vraag-tegelijk flow
// (Boldin-stijl): identity gesplitst in naam+geboortedatum, inkomen gesplitst
// in inkomen+uitgaven, en nieuwe stappen schulden + pensioen.
const NEW_ACTIVE_ORDER = [
  'naam',
  'geboortedatum',
  'inkomen',
  'uitgaven',
  'uitgaven_pensioen',
  'bezittingen',
  'schulden',
  'pensioen',
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

  it('restores the new micro-steps verbatim (geboortedatum / uitgaven / schulden / pensioen)', () => {
    for (const step of ['geboortedatum', 'uitgaven', 'schulden', 'pensioen'] as const) {
      const result = _resolveRestoredStep(step, [...NEW_ACTIVE_ORDER])
      expect(result).toEqual({ step, healed: false })
    }
  })

  it('heals a legacy "identity" lastStep to the split "naam" step', () => {
    // identity is jun 2026 gesplitst in naam + geboortedatum; een oude draft op
    // identity heelt naar de eerste micro-stap ervan.
    const result = _resolveRestoredStep('identity', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'naam', healed: true })
  })

  it('heals a legacy "budgets" lastStep to the new "klaar" step', () => {
    const result = _resolveRestoredStep('budgets', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'klaar', healed: true })
  })

  it('heals a legacy "horizon" lastStep to "klaar"', () => {
    const result = _resolveRestoredStep('horizon', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'klaar', healed: true })
  })

  it('heals a legacy "intro" lastStep to "naam"', () => {
    const result = _resolveRestoredStep('intro', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'naam', healed: true })
  })

  it('heals a legacy "goal" lastStep to "naam"', () => {
    const result = _resolveRestoredStep('goal', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'naam', healed: true })
  })

  it('heals the removed "doel" step to "naam"', () => {
    const result = _resolveRestoredStep('doel', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'naam', healed: true })
  })

  it('heals the removed "nieuws_only" step to "naam"', () => {
    const result = _resolveRestoredStep('nieuws_only', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'naam', healed: true })
  })

  it('heals legacy "extras" step name directly to "bezittingen"', () => {
    const result = _resolveRestoredStep('extras', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'bezittingen', healed: true })
  })

  it('falls back to naam when the saved step is not in the canonical union', () => {
    const result = _resolveRestoredStep('verzonnen_stap', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'naam', healed: true })
  })

  it('lands on naam when there is no saved step', () => {
    const result = _resolveRestoredStep(undefined, [...NEW_ACTIVE_ORDER])
    expect(result.step).toBe('naam')
  })

  it('heals legacy "intent" step name directly to "naam"', () => {
    const result = _resolveRestoredStep('intent', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'naam', healed: true })
  })

  it('heals legacy "modules" step name directly to "naam"', () => {
    const result = _resolveRestoredStep('modules', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'naam', healed: true })
  })

  it('heals legacy "persona" step name directly to "naam"', () => {
    const result = _resolveRestoredStep('persona', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'naam', healed: true })
  })
})

describe('onboarding _initialState — modules default aan', () => {
  it('starts on naam with all modules active', () => {
    // Sinds jun 2026 is er geen doel-/module-keuze meer in onboarding: alle
    // modules staan default aan, gating gebeurt via abonnement + user-toggles
    // buiten de onboarding. Eerste micro-stap = `naam`.
    expect(_initialState.step).toBe('naam')
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
    expect(result.activeModules).toEqual([...ALL_MODULES])
    expect(result.selectedGoals).toEqual(['grip-uitgaven'])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('restores a draft saved mid-flow on the new schulden step without warning', () => {
    // Mid-loop restore landt op groep-niveau met de reeds-toegevoegde posten
    // intact (data-behoudend); de schulden-stap zelf is gewoon herstelbaar.
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: {
        identity: baseIdentity as (typeof _initialState)['identity'],
        selectedGoals: [],
        activeModules: ['budgetteren'],
        horizon: baseHorizon,
        budgetAmounts: {},
        quickAssets: [{ asset_type: 'cash', name: 'Betaalrekening', current_value: 1200 }],
        quickDebts: [{ debt_type: 'student_loan', name: 'DUO', current_balance: 9000 }],
        lastStep: 'schulden',
      },
    })
    expect(result.step).toBe('schulden')
    // Reeds toegevoegde posten blijven behouden bij restore.
    expect(result.quickAssets).toHaveLength(1)
    expect(result.quickDebts).toHaveLength(1)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('behoudt het maand-inkomensveld bij restore (jun 2026: inkomen per maand)', () => {
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
    expect(result.identity.estimated_yearly_income).toBe('36000')
  })

  it('migrates a legacy single-goal draft to a selectedGoals array', () => {
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

  it('migrates a legacy "identity" lastStep to "naam"', () => {
    // Een draft van vóór de profiel-split. LEGACY_STEP_MAP mapt identity → naam.
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
        lastStep: 'identity' as (typeof _initialState)['step'],
      },
    })
    expect(result.step).toBe('naam')
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy.mock.calls[0][0]).toContain('identity')
    expect(warnSpy.mock.calls[0][0]).toContain('naam')
  })

  it('migrates a legacy "budgets" lastStep to "klaar"', () => {
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
        lastStep: 'budgets' as (typeof _initialState)['step'],
      },
    })
    expect(result.step).toBe('klaar')
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy.mock.calls[0][0]).toContain('budgets')
    expect(warnSpy.mock.calls[0][0]).toContain('klaar')
  })

  it('heals a news-only draft (lastStep nieuws_only) back to naam', () => {
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
    expect(result.step).toBe('naam')
    expect(result.activeModules).toEqual([...ALL_MODULES])
    expect(warnSpy).toHaveBeenCalledOnce()
  })

  it('falls back to naam for an unknown lastStep', () => {
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
    expect(result.step).toBe('naam')
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

describe('onboarding _reducer — SET_PENSION', () => {
  it('replaces the pension substate with the dispatched payload', () => {
    const draft: PensionDraft = {
      mode: 'estimate',
      grossMonthly: '1500',
      startAge: '67',
      parseResult: null,
    }
    const result = _reducer(_initialState, { type: 'SET_PENSION', data: draft })
    expect(result.pension).toEqual(draft)
  })

  it('does not affect other state fields', () => {
    const result = _reducer(_initialState, {
      type: 'SET_PENSION',
      data: { mode: 'upload', grossMonthly: '', startAge: '', parseResult: null },
    })
    expect(result.identity).toEqual(_initialState.identity)
    expect(result.quickAssets).toEqual(_initialState.quickAssets)
  })
})

describe('onboarding _reducer — SET_RETIREMENT_EXPENSE', () => {
  it('replaces the retirementExpense substate with the dispatched payload', () => {
    const result = _reducer(_initialState, {
      type: 'SET_RETIREMENT_EXPENSE',
      data: { method: 'custom_amount', customAmount: '32.400', skipped: false },
    })
    expect(result.retirementExpense).toEqual({
      method: 'custom_amount',
      customAmount: '32.400',
      skipped: false,
    })
  })

  it('marks the step as skipped without persisting an amount', () => {
    const result = _reducer(_initialState, {
      type: 'SET_RETIREMENT_EXPENSE',
      data: { method: 'custom_amount', customAmount: '', skipped: true },
    })
    expect(result.retirementExpense.skipped).toBe(true)
    expect(result.retirementExpense.customAmount).toBe('')
  })

  it('does not affect other state fields', () => {
    const result = _reducer(_initialState, {
      type: 'SET_RETIREMENT_EXPENSE',
      data: { method: 'current_income', customAmount: '', skipped: false },
    })
    expect(result.identity).toEqual(_initialState.identity)
    expect(result.pension).toEqual(_initialState.pension)
  })
})

describe('onboarding _resolveRestoredStep — uitgaven_pensioen', () => {
  it('restores a draft saved on uitgaven_pensioen without healing', () => {
    const result = _resolveRestoredStep('uitgaven_pensioen', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'uitgaven_pensioen', healed: false })
  })

  it('heals an old draft saved on uitgaven forward into the active order', () => {
    // An old draft on `uitgaven` is still a valid active step, so it stays put
    // — the new step sits AFTER it and the user simply continues into it.
    const result = _resolveRestoredStep('uitgaven', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'uitgaven', healed: false })
  })
})

describe('onboarding _resolveRestoredStep — spaardoel + klaar', () => {
  it('keeps a klaar lastStep on klaar without retroactively routing to spaardoel', () => {
    const result = _resolveRestoredStep('klaar', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'klaar', healed: false })
  })

  it('restores a draft saved on spaardoel without warning', () => {
    const result = _resolveRestoredStep('spaardoel', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'spaardoel', healed: false })
  })
})

describe('onboarding _reducer — RESTORE_STATE met spaardoel + pensioen', () => {
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

  it('restores a saved retirementExpense substate verbatim', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: {
        identity: baseIdentity as (typeof _initialState)['identity'],
        selectedGoals: [],
        activeModules: ['toekomstplannen'],
        horizon: baseHorizon,
        budgetAmounts: {},
        quickAssets: [],
        quickDebts: [],
        retirementExpense: {
          method: 'custom_amount',
          customAmount: '30.000',
          skipped: false,
        },
        lastStep: 'uitgaven_pensioen',
      },
    })
    expect(result.step).toBe('uitgaven_pensioen')
    expect(result.retirementExpense).toEqual({
      method: 'custom_amount',
      customAmount: '30.000',
      skipped: false,
    })
  })

  it('falls back to the initial retirementExpense state for a legacy draft without it', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: {
        identity: baseIdentity as (typeof _initialState)['identity'],
        selectedGoals: [],
        activeModules: ['toekomstplannen'],
        horizon: baseHorizon,
        budgetAmounts: {},
        quickAssets: [],
        quickDebts: [],
        // retirementExpense ontbreekt bewust — legacy draft simulatie
        lastStep: 'klaar',
      },
    })
    expect(result.retirementExpense).toEqual(_initialState.retirementExpense)
  })

  it('restores a saved pension substate verbatim', () => {
    const pension: PensionDraft = {
      mode: 'estimate',
      grossMonthly: '1400',
      startAge: '68',
      parseResult: null,
    }
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
        pension,
        lastStep: 'pensioen',
      },
    })
    expect(result.step).toBe('pensioen')
    expect(result.pension).toEqual(pension)
  })

  it('falls back to the initial pension state when missing from a legacy draft', () => {
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
        // pension ontbreekt bewust — legacy draft simulatie
        lastStep: 'klaar',
      },
    })
    expect(result.step).toBe('klaar')
    expect(result.pension).toEqual(_initialState.pension)
  })

  it('falls back to the initial spaardoel state when missing from a legacy draft', () => {
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
        lastStep: 'klaar',
      },
    })
    expect(result.step).toBe('klaar')
    expect(result.spaardoel).toEqual(_initialState.spaardoel)
  })
})

describe('onboarding buildPensionParseResult', () => {
  it('maps an estimate to a single ouderdomspensioen-regeling', () => {
    const result = buildPensionParseResult({
      mode: 'estimate',
      grossMonthly: '1.500',
      startAge: '68',
      parseResult: null,
    })
    expect(result).not.toBeNull()
    expect(result!.regelingen).toHaveLength(1)
    expect(result!.regelingen[0]).toMatchObject({
      brutoBedrag: 1500,
      ingangLeeftijd: 68,
      type: 'ouderdomspensioen',
    })
  })

  it('defaults the ingangsleeftijd to 67 when out of range or missing', () => {
    const result = buildPensionParseResult({
      mode: 'estimate',
      grossMonthly: '1200',
      startAge: '',
      parseResult: null,
    })
    expect(result!.regelingen[0].ingangLeeftijd).toBe(67)
  })

  it('returns null for an empty/zero estimate', () => {
    expect(
      buildPensionParseResult({ mode: 'estimate', grossMonthly: '', startAge: '', parseResult: null }),
    ).toBeNull()
    expect(
      buildPensionParseResult({ mode: 'estimate', grossMonthly: '0', startAge: '', parseResult: null }),
    ).toBeNull()
  })

  it('passes an uploaded parseResult through unchanged', () => {
    const parseResult = {
      aowBedrag: 1300,
      regelingen: [
        { fondsNaam: 'ABP', brutoBedrag: 900, ingangLeeftijd: 67, isGeindexeerd: true, type: 'ouderdomspensioen' as const },
      ],
      nabestaandenpensioen: null,
      samenvatting: 'Test',
    }
    const result = buildPensionParseResult({
      mode: 'upload',
      grossMonthly: '',
      startAge: '',
      parseResult,
    })
    expect(result).toBe(parseResult)
  })

  it('returns null when the user skipped (mode null)', () => {
    expect(
      buildPensionParseResult({ mode: null, grossMonthly: '', startAge: '', parseResult: null }),
    ).toBeNull()
  })
})

describe('onboarding _firstNavigationRecoveryStep', () => {
  it('returns the first content step (naam) for the new active order', () => {
    const result = _firstNavigationRecoveryStep([...NEW_ACTIVE_ORDER])
    expect(result).toBe('naam')
  })

  it('falls back to naam when the active order is empty', () => {
    const result = _firstNavigationRecoveryStep([])
    expect(result).toBe('naam')
  })
})
