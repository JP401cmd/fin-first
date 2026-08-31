import { describe, it, expect } from 'vitest'
import {
  serializeDraft,
  sanitizeStoredDraft,
  hasResumableDraft,
  firstIncompleteRequiredStep,
  OnboardingDraftSchema,
  ONBOARDING_DRAFT_VERSION,
  type DraftStateSource,
  type OnboardingDraft,
} from './draft-persistence'

/**
 * Een volledige onboarding-state zoals de reducer 'm aanlevert. Sinds kaart
 * UR2-01 wordt hier ALLES uit bewaard (server-side, eigen profielrij) — met
 * precies één uitzondering: `pension.parseResult`, dat per ADR 0115 het toestel
 * niet verlaat.
 */
function makeFullState(): DraftStateSource & Record<string, unknown> {
  return {
    step: 'spaardoel',
    identity: {
      full_name: 'Jan Paul',
      date_of_birth: '1986-04-05',
      household_type: 'solo',
      number_of_children: 0,
      net_monthly_income: '3500',
      estimated_yearly_income: '42000',
      estimated_monthly_expenses: '2200',
    },
    budgetAmounts: { boodschappen: 400 },
    quickAssets: [{ asset_type: 'cash', name: 'Betaalrekening', current_value: 1200 }],
    quickDebts: [{ debt_type: 'student_loan', name: 'DUO', current_balance: 9000 }],
    bezittingenPhases: [{ kind: 'ask', qIndex: 0 }, { kind: 'review' }],
    schuldenPhases: [{ kind: 'ask', qIndex: 2 }],
    selectedGoals: ['grip-uitgaven'],
    activeModules: ['budgetteren', 'toekomstplannen'],
    deferredFields: ['income'],
    spaardoel: {
      presetKey: 'vakantie',
      name: 'Italië 2027',
      target_value: '3500',
      target_date: '2027-06',
      skipped: false,
    },
    pension: {
      mode: 'estimate',
      grossMonthly: '1500',
      startAge: '67',
      parseResult: { aowBedrag: 1300 },
    },
    retirementExpense: { method: 'custom_amount', customAmount: '30.000', skipped: false },
    horizon: {
      fire_end_strategy: 'legacy',
      fire_end_age: 85,
      temporal_balance: 4,
      fire_legacy_amount: '100000',
      retirement_expense_method: 'custom_amount',
      retirement_custom_amount: '32000',
      life_events: [
        { name: 'Sabbatical', event_type: 'break', target_age: 45, is_active: true },
      ],
    },
  } as unknown as DraftStateSource & Record<string, unknown>
}

describe('serializeDraft — het concept draagt alle antwoorden (UR2-01)', () => {
  it('bewaart identiteit, bedragen, bezittingen en schulden', () => {
    const draft = serializeDraft(makeFullState())
    expect(draft.lastStep).toBe('spaardoel')
    expect(draft.version).toBe(ONBOARDING_DRAFT_VERSION)
    expect(draft.identity.full_name).toBe('Jan Paul')
    expect(draft.identity.date_of_birth).toBe('1986-04-05')
    expect(draft.budgetAmounts).toEqual({ boodschappen: 400 })
    expect(draft.quickAssets).toEqual([
      { asset_type: 'cash', name: 'Betaalrekening', current_value: 1200 },
    ])
    expect(draft.quickDebts).toEqual([
      { debt_type: 'student_loan', name: 'DUO', current_balance: 9000 },
    ])
    expect(draft.spaardoel.name).toBe('Italië 2027')
    expect(draft.spaardoel.target_value).toBe('3500')
    expect(draft.retirementExpense.customAmount).toBe('30.000')
    expect(draft.horizon.fire_legacy_amount).toBe('100000')
    expect(draft.horizon.life_events).toHaveLength(1)
  })

  it('bewaart de gelifte fase-stacks, zodat een reload op hetzelfde scherm landt', () => {
    const draft = serializeDraft(makeFullState())
    expect(draft.bezittingenPhases).toEqual([{ kind: 'ask', qIndex: 0 }, { kind: 'review' }])
    expect(draft.schuldenPhases).toEqual([{ kind: 'ask', qIndex: 2 }])
  })

  it('laat het geparste pensioenoverzicht buiten het concept (ADR 0115)', () => {
    const draft = serializeDraft(makeFullState())
    expect(draft.pension).toEqual({ mode: 'estimate', grossMonthly: '1500', startAge: '67' })
    expect(JSON.stringify(draft)).not.toContain('aowBedrag')
  })

  it('kopieert diep — muteren van de state raakt een al verstuurd concept niet', () => {
    const state = makeFullState()
    const draft = serializeDraft(state)
    state.quickAssets[0].current_value = 999999
    state.identity.full_name = 'Iemand Anders'
    expect(draft.quickAssets[0].current_value).toBe(1200)
    expect(draft.identity.full_name).toBe('Jan Paul')
  })
})

describe('OnboardingDraftSchema — vormcontrole op de PUT-route', () => {
  it('accepteert een vers geserialiseerd concept', () => {
    const result = OnboardingDraftSchema.safeParse(serializeDraft(makeFullState()))
    expect(result.success).toBe(true)
  })

  it('weigert een onbekend veld — de vangrail onder ADR 0115', () => {
    const draft = serializeDraft(makeFullState()) as OnboardingDraft & Record<string, unknown>
    const smuggled = {
      ...draft,
      pension: { ...draft.pension, parseResult: { aowBedrag: 1300 } },
    }
    expect(OnboardingDraftSchema.safeParse(smuggled).success).toBe(false)
  })

  it('accepteert een halfaf concept — een concept mag nooit geweigerd worden', () => {
    const draft = serializeDraft(makeFullState())
    draft.identity.full_name = ''
    draft.quickAssets = [{ asset_type: 'cash', name: '', current_value: 0 }]
    expect(OnboardingDraftSchema.safeParse(draft).success).toBe(true)
  })
})

describe('sanitizeStoredDraft — herstel + migratie van oude concepten', () => {
  it('herstelt een volledig concept ongeschonden', () => {
    const draft = serializeDraft(makeFullState())
    const restored = sanitizeStoredDraft(JSON.parse(JSON.stringify(draft)))
    expect(restored).toEqual(draft)
  })

  it('migreert een v1-concept (alleen stap + keuzes) zonder te breken', () => {
    // Zoals de code van vóór aug 2026 het schreef: geen identiteit, geen posten.
    const v1 = {
      lastStep: 'pensioen',
      selectedGoals: ['grip-uitgaven'],
      activeModules: ['budgetteren'],
      deferredFields: ['assets'],
      spaardoel: { presetKey: 'noodfonds', skipped: false },
      pension: { mode: 'upload' },
      retirementExpense: { method: 'current_income', skipped: false },
      horizon: { fire_end_strategy: 'deplete', fire_end_age: 90, temporal_balance: 3 },
    }
    const restored = sanitizeStoredDraft(v1)
    expect(restored).not.toBeNull()
    expect(restored!.lastStep).toBe('pensioen')
    expect(restored!.version).toBe(1)
    expect(restored!.selectedGoals).toEqual(['grip-uitgaven'])
    expect(restored!.spaardoel.presetKey).toBe('noodfonds')
    expect(restored!.pension.mode).toBe('upload')
    // Ontbrekende velden krijgen hun lege beginwaarde, geen undefined.
    expect(restored!.identity.full_name).toBe('')
    expect(restored!.identity.household_type).toBe('solo')
    expect(restored!.quickAssets).toEqual([])
    expect(restored!.quickDebts).toEqual([])
    expect(restored!.budgetAmounts).toEqual({})
    expect(restored!.bezittingenPhases).toEqual([])
  })

  it('negeert een gesmokkeld pensioenoverzicht bij het lezen', () => {
    const restored = sanitizeStoredDraft({
      lastStep: 'pensioen',
      pension: { mode: 'upload', grossMonthly: '2000', startAge: '', parseResult: { x: 1 } },
    })
    expect(restored!.pension).toEqual({ mode: 'upload', grossMonthly: '2000', startAge: '' })
  })

  it('migreert een legacy single-goal concept naar een selectedGoals-array', () => {
    const restored = sanitizeStoredDraft({ goal: 'grip-uitgaven', lastStep: 'bezittingen' })
    expect(restored!.selectedGoals).toEqual(['grip-uitgaven'])
  })

  it('valideert onbekende preset/strategie/fase-waarden weg naar veilige defaults', () => {
    const restored = sanitizeStoredDraft({
      spaardoel: { presetKey: 'verzonnen', skipped: false },
      horizon: { fire_end_strategy: 'onzin', fire_end_age: 'x', temporal_balance: null },
      bezittingenPhases: [{ kind: 'verzonnen' }, { kind: 'review' }],
      identity: { household_type: 'buitenaards', number_of_children: 'twee' },
      budgetAmounts: { boodschappen: 400, kapot: 'veel' },
      quickAssets: [{ name: 'geen type' }, { asset_type: 'cash', name: 'Buffer', current_value: 5 }],
      lastStep: 'spaardoel',
    })
    expect(restored!.spaardoel.presetKey).toBeNull()
    expect(restored!.horizon.fire_end_strategy).toBe('deplete')
    expect(restored!.horizon.fire_end_age).toBe(90)
    expect(restored!.horizon.temporal_balance).toBe(3)
    expect(restored!.bezittingenPhases).toEqual([{ kind: 'review' }])
    expect(restored!.identity.household_type).toBe('solo')
    expect(restored!.identity.number_of_children).toBe(0)
    expect(restored!.budgetAmounts).toEqual({ boodschappen: 400 })
    expect(restored!.quickAssets).toEqual([
      { asset_type: 'cash', name: 'Buffer', current_value: 5 },
    ])
  })

  it('geeft null terug voor niet-object input', () => {
    expect(sanitizeStoredDraft(null)).toBeNull()
    expect(sanitizeStoredDraft('kaas')).toBeNull()
    expect(sanitizeStoredDraft(42)).toBeNull()
    expect(sanitizeStoredDraft([])).toBeNull()
  })
})

describe('hasResumableDraft — hervat-signaal', () => {
  function draft(overrides: Partial<OnboardingDraft> = {}): OnboardingDraft {
    return {
      ...sanitizeStoredDraft({})!,
      ...overrides,
    }
  }

  it('false voor null', () => {
    expect(hasResumableDraft(null)).toBe(false)
  })

  it('false voor een leeg concept op de naam-stap zonder keuzes', () => {
    expect(hasResumableDraft(draft({ lastStep: 'naam' }))).toBe(false)
    expect(hasResumableDraft(draft())).toBe(false)
  })

  it('true zodra de gebruiker voorbij de naam-stap is', () => {
    expect(hasResumableDraft(draft({ lastStep: 'bezittingen' }))).toBe(true)
  })

  it('true zodra er een keuze gemaakt is (ook nog op de naam-stap)', () => {
    expect(hasResumableDraft(draft({ lastStep: 'naam', selectedGoals: ['grip-uitgaven'] }))).toBe(
      true,
    )
    expect(hasResumableDraft(draft({ lastStep: 'naam', deferredFields: ['income'] }))).toBe(true)
  })

  it('true zodra er echt iets is ingevuld — ook op de naam-stap zelf', () => {
    const withName = draft({ lastStep: 'naam' })
    withName.identity.full_name = 'Jan'
    expect(hasResumableDraft(withName)).toBe(true)

    expect(
      hasResumableDraft(
        draft({
          lastStep: 'naam',
          quickAssets: [{ asset_type: 'cash', name: 'Buffer', current_value: 10 }],
        }),
      ),
    ).toBe(true)
    expect(hasResumableDraft(draft({ lastStep: 'naam', budgetAmounts: { eten: 300 } }))).toBe(true)
  })
})

describe('firstIncompleteRequiredStep — finish-guard', () => {
  const order = ['naam', 'geboortedatum', 'inkomen', 'klaar']

  it('geeft naam terug bij lege naam', () => {
    expect(firstIncompleteRequiredStep({ full_name: '', date_of_birth: '' }, order)).toBe('naam')
    expect(firstIncompleteRequiredStep({ full_name: '   ' }, order)).toBe('naam')
  })

  it('geeft geboortedatum terug wanneer naam gevuld maar dob leeg is', () => {
    expect(firstIncompleteRequiredStep({ full_name: 'Jan', date_of_birth: '' }, order)).toBe(
      'geboortedatum',
    )
  })

  it('geeft null terug wanneer beide verplichte velden aanwezig zijn', () => {
    expect(
      firstIncompleteRequiredStep({ full_name: 'Jan', date_of_birth: '1986-04-05' }, order),
    ).toBeNull()
  })
})
