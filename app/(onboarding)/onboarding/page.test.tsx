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
import type { OnboardingDraft } from './draft-persistence'

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
  'eindstrategie',
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

/**
 * Leeg conceptobject zoals `/api/onboarding/draft` het teruggeeft. Sinds kaart
 * UR2-01 draagt RESTORE_STATE ALLE antwoorden — identiteit, bedragen, posten.
 * Enige uitzondering: `pension.parseResult` (ADR 0115, blijft op het toestel).
 */
function makeRestoreDraft(overrides: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return {
    version: 2,
    identity: {
      full_name: '',
      date_of_birth: '',
      household_type: 'solo',
      number_of_children: 0,
      net_monthly_income: '',
      estimated_yearly_income: '',
      estimated_monthly_expenses: '',
    },
    selectedGoals: [],
    activeModules: [...ALL_MODULES],
    deferredFields: [],
    budgetAmounts: {},
    quickAssets: [],
    quickDebts: [],
    bezittingenPhases: [],
    schuldenPhases: [],
    spaardoel: { presetKey: null, name: '', target_value: '', target_date: '', skipped: false },
    pension: { mode: null, grossMonthly: '', startAge: '' },
    retirementExpense: { method: 'custom_amount', customAmount: '', skipped: false },
    horizon: {
      fire_end_strategy: 'deplete',
      fire_end_age: 90,
      fire_legacy_amount: '',
      retirement_expense_method: 'current_income',
      retirement_custom_amount: '',
      temporal_balance: 3,
      life_events: [],
    },
    ...overrides,
  }
}

describe('onboarding _reducer — RESTORE_STATE', () => {
  const makeDraft = makeRestoreDraft

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
      data: makeDraft({ selectedGoals: ['grip-uitgaven'], lastStep: 'bezittingen' }),
    })
    expect(result.step).toBe('bezittingen')
    expect(result.activeModules).toEqual([...ALL_MODULES])
    expect(result.selectedGoals).toEqual(['grip-uitgaven'])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('herstelt de identiteit — de kern van UR2-01', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: makeDraft({
        lastStep: 'schulden',
        identity: {
          full_name: 'Jan Paul',
          date_of_birth: '1986-04-05',
          household_type: 'solo',
          number_of_children: 0,
          net_monthly_income: '',
          estimated_yearly_income: '42000',
          estimated_monthly_expenses: '2200',
        },
      }),
    })
    expect(result.step).toBe('schulden')
    expect(result.identity.full_name).toBe('Jan Paul')
    expect(result.identity.date_of_birth).toBe('1986-04-05')
    expect(result.identity.estimated_yearly_income).toBe('42000')
  })

  it('herstelt bezittingen, schulden en budgetbedragen', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: makeDraft({
        lastStep: 'schulden',
        quickAssets: [{ asset_type: 'cash', name: 'Betaalrekening', current_value: 1800 }],
        quickDebts: [{ debt_type: 'mortgage', name: 'Hypotheek', current_balance: 285000 }],
        budgetAmounts: { boodschappen: 400 },
      }),
    })
    expect(result.quickAssets).toEqual([
      { asset_type: 'cash', name: 'Betaalrekening', current_value: 1800 },
    ])
    expect(result.quickDebts).toEqual([
      { debt_type: 'mortgage', name: 'Hypotheek', current_balance: 285000 },
    ])
    expect(result.budgetAmounts).toEqual({ boodschappen: 400 })
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('herstelt het pensioenpad en de schatting, maar nooit een parseResult (ADR 0115)', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: makeDraft({
        lastStep: 'pensioen',
        pension: { mode: 'estimate', grossMonthly: '1500', startAge: '67' },
      }),
    })
    expect(result.pension.mode).toBe('estimate')
    expect(result.pension.grossMonthly).toBe('1500')
    expect(result.pension.startAge).toBe('67')
    expect(result.pension.parseResult).toBeNull()
  })

  it('valt terug op de begin-fasestack wanneer het concept er geen draagt', () => {
    // Een oud v1-concept (of een sectie waar de gebruiker nog niet was) heeft
    // een lege stack; de sub-machine zou dan zonder scherm staan.
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: makeDraft({ lastStep: 'bezittingen', bezittingenPhases: [], schuldenPhases: [] }),
    })
    expect(result.bezittingenPhases).toEqual(_initialState.bezittingenPhases)
    expect(result.schuldenPhases).toEqual(_initialState.schuldenPhases)
  })

  it('herstelt een bewaarde fase-stack ongewijzigd', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: makeDraft({
        lastStep: 'bezittingen',
        bezittingenPhases: [{ kind: 'ask', qIndex: 0 }, { kind: 'review' }],
      }),
    })
    expect(result.bezittingenPhases).toEqual([{ kind: 'ask', qIndex: 0 }, { kind: 'review' }])
  })

  it('herstelt de niet-gevoelige keuzes (selectedGoals, deferredFields)', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: makeDraft({
        selectedGoals: ['grip-uitgaven'],
        deferredFields: ['income', 'assets'],
        lastStep: 'bezittingen',
      }),
    })
    expect(result.selectedGoals).toEqual(['grip-uitgaven'])
    expect(result.deferredFields).toEqual(['income', 'assets'])
  })

  it('herstelt de volledige horizon-substate, inclusief de bedragen', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: makeDraft({
        horizon: {
          fire_end_strategy: 'legacy',
          fire_end_age: 85,
          fire_legacy_amount: '100000',
          retirement_expense_method: 'custom_amount',
          retirement_custom_amount: '32000',
          temporal_balance: 4,
          life_events: [],
        },
        lastStep: 'klaar',
      }),
    })
    expect(result.horizon.fire_end_strategy).toBe('legacy')
    expect(result.horizon.fire_end_age).toBe(85)
    expect(result.horizon.temporal_balance).toBe(4)
    expect(result.horizon.fire_legacy_amount).toBe('100000')
    expect(result.horizon.retirement_custom_amount).toBe('32000')
  })

  it('migrates a legacy "identity" lastStep to "naam"', () => {
    // Een draft van vóór de profiel-split. LEGACY_STEP_MAP mapt identity → naam.
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: makeDraft({ lastStep: 'identity' }),
    })
    expect(result.step).toBe('naam')
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy.mock.calls[0][0]).toContain('identity')
    expect(warnSpy.mock.calls[0][0]).toContain('naam')
  })

  it('migrates a legacy "budgets" lastStep to "klaar"', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: makeDraft({ selectedGoals: ['grip-uitgaven'], lastStep: 'budgets' }),
    })
    expect(result.step).toBe('klaar')
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy.mock.calls[0][0]).toContain('budgets')
    expect(warnSpy.mock.calls[0][0]).toContain('klaar')
  })

  it('heals a news-only draft (lastStep nieuws_only) back to naam', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: makeDraft({ lastStep: 'nieuws_only' }),
    })
    expect(result.step).toBe('naam')
    expect(result.activeModules).toEqual([...ALL_MODULES])
    expect(warnSpy).toHaveBeenCalledOnce()
  })

  it('falls back to naam for an unknown lastStep', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: makeDraft({ lastStep: 'verzonnen_stap' }),
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

  it('restores a draft saved on the new eindstrategie step verbatim', () => {
    const result = _resolveRestoredStep('eindstrategie', [...NEW_ACTIVE_ORDER])
    expect(result).toEqual({ step: 'eindstrategie', healed: false })
  })

  it('places eindstrategie between spaardoel and klaar in the active order', () => {
    const order = [...NEW_ACTIVE_ORDER]
    expect(order.indexOf('eindstrategie')).toBeGreaterThan(order.indexOf('spaardoel'))
    expect(order.indexOf('eindstrategie')).toBeLessThan(order.indexOf('klaar'))
  })
})

describe('onboarding _reducer — SET_HORIZON (eindstrategie-keuze)', () => {
  // De eindstrategie-stap mapt tegel 1 (FIRE) → 'deplete' en tegel 2
  // (pensioen) → 'pensioen' via SET_HORIZON. Geen nieuwe state-slice; de keuze
  // rijdt op het bestaande horizon-veld en wordt bij save als
  // horizonData.fire_end_strategy meegestuurd.
  it('zet fire_end_strategy op deplete (keuze 1 — FIRE)', () => {
    const result = _reducer(_initialState, {
      type: 'SET_HORIZON',
      data: { ..._initialState.horizon, fire_end_strategy: 'deplete' },
    })
    expect(result.horizon.fire_end_strategy).toBe('deplete')
  })

  it('zet fire_end_strategy op pensioen (keuze 2 — werken tot pensioen)', () => {
    const result = _reducer(_initialState, {
      type: 'SET_HORIZON',
      data: { ..._initialState.horizon, fire_end_strategy: 'pensioen' },
    })
    expect(result.horizon.fire_end_strategy).toBe('pensioen')
    // fire_end_age blijft de bestaande default (niet functioneel voor pensioen).
    expect(result.horizon.fire_end_age).toBe(90)
  })

  it('laat de identiteit + overige velden ongemoeid', () => {
    const result = _reducer(_initialState, {
      type: 'SET_HORIZON',
      data: { ..._initialState.horizon, fire_end_strategy: 'pensioen' },
    })
    expect(result.identity).toEqual(_initialState.identity)
    expect(result.spaardoel).toEqual(_initialState.spaardoel)
  })
})

describe('onboarding _reducer — RESTORE_STATE keuzes (spaardoel + pensioen)', () => {
  const makeDraft = makeRestoreDraft

  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('herstelt de volledige spaardoel-substate — preset én naam/bedrag/datum', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: makeDraft({
        selectedGoals: ['noodfonds'],
        spaardoel: {
          presetKey: 'vakantie',
          name: 'Italië 2027',
          target_value: '3500',
          target_date: '2027-06',
          skipped: false,
        },
        lastStep: 'spaardoel',
      }),
    })
    expect(result.step).toBe('spaardoel')
    expect(result.spaardoel.presetKey).toBe('vakantie')
    expect(result.spaardoel.name).toBe('Italië 2027')
    expect(result.spaardoel.target_value).toBe('3500')
    expect(result.spaardoel.target_date).toBe('2027-06')
  })

  it('herstelt de spaardoel-skip-vlag', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: makeDraft({
        spaardoel: { presetKey: null, name: '', target_value: '', target_date: '', skipped: true },
        lastStep: 'spaardoel',
      }),
    })
    expect(result.spaardoel.skipped).toBe(true)
    expect(result.spaardoel.name).toBe('')
  })

  it('herstelt de retirementExpense inclusief het ingevulde bedrag', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: makeDraft({
        retirementExpense: { method: 'custom_amount', customAmount: '30.000', skipped: false },
        lastStep: 'uitgaven_pensioen',
      }),
    })
    expect(result.step).toBe('uitgaven_pensioen')
    expect(result.retirementExpense.method).toBe('custom_amount')
    expect(result.retirementExpense.skipped).toBe(false)
    expect(result.retirementExpense.customAmount).toBe('30.000')
  })

  it('valt terug op de initiële retirementExpense bij default keuzes', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: makeDraft({ lastStep: 'klaar' }),
    })
    expect(result.retirementExpense).toEqual(_initialState.retirementExpense)
  })

  it('herstelt pad én schatting, maar nooit het geparste overzicht (ADR 0115)', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: makeDraft({
        pension: { mode: 'estimate', grossMonthly: '1500', startAge: '67' },
        lastStep: 'pensioen',
      }),
    })
    expect(result.step).toBe('pensioen')
    expect(result.pension.mode).toBe('estimate')
    expect(result.pension.grossMonthly).toBe('1500')
    expect(result.pension.startAge).toBe('67')
    // Blijft op het toestel — nooit in het concept, dus nooit hersteld.
    expect(result.pension.parseResult).toBeNull()
  })

  it('valt terug op de initiële pension-shape wanneer geen pad gekozen is', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: makeDraft({
        pension: { mode: null, grossMonthly: '', startAge: '' },
        lastStep: 'klaar',
      }),
    })
    expect(result.step).toBe('klaar')
    expect(result.pension).toEqual(_initialState.pension)
  })

  it('valt terug op de initiële spaardoel-shape bij geen keuze', () => {
    const result = _reducer(_initialState, {
      type: 'RESTORE_STATE',
      data: makeDraft({ lastStep: 'klaar' }),
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

  it('lege startAge + expliciete AOW-fallback → ingangLeeftijd = AOW-leeftijd', () => {
    const result = buildPensionParseResult(
      { mode: 'estimate', grossMonthly: '1200', startAge: '', parseResult: null },
      68,
    )
    expect(result!.regelingen[0].ingangLeeftijd).toBe(68)
  })

  it('ingevulde startAge wint van de AOW-fallback; onzinnige fallback klemt op 67', () => {
    const explicit = buildPensionParseResult(
      { mode: 'estimate', grossMonthly: '1200', startAge: '63', parseResult: null },
      68,
    )
    expect(explicit!.regelingen[0].ingangLeeftijd).toBe(63)

    const weird = buildPensionParseResult(
      { mode: 'estimate', grossMonthly: '1200', startAge: '', parseResult: null },
      120,
    )
    expect(weird!.regelingen[0].ingangLeeftijd).toBe(67)
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
