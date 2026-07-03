import { describe, it, expect } from 'vitest'
import {
  serializeDraft,
  sanitizeStoredDraft,
  hasResumableDraft,
  firstIncompleteRequiredStep,
  SENSITIVE_DRAFT_KEYS,
  type DraftStateSource,
  type NonSensitiveDraft,
} from './draft-persistence'

// Een volledige onboarding-state-achtige bron met GEVOELIGE velden erin, zoals
// de reducer 'm zou aanleveren. serializeDraft mag hier alléén de
// niet-gevoelige subset uit halen.
function makeFullState(): DraftStateSource & Record<string, unknown> {
  return {
    step: 'spaardoel',
    // Gevoelig — mag NOOIT geserialiseerd worden.
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
    // Niet-gevoelig.
    selectedGoals: ['grip-uitgaven'],
    activeModules: ['budgetteren', 'toekomstplannen'],
    deferredFields: ['income'],
    // Gemengd: keuze niet-gevoelig, bedrag/naam gevoelig.
    spaardoel: { presetKey: 'vakantie', name: 'Italië 2027', target_value: '3500', target_date: '2027-06', skipped: false },
    pension: { mode: 'estimate', grossMonthly: '1500', startAge: '67', parseResult: { aowBedrag: 1300 } },
    retirementExpense: { method: 'custom_amount', customAmount: '30.000', skipped: false },
    horizon: {
      fire_end_strategy: 'legacy',
      fire_end_age: 85,
      temporal_balance: 4,
      fire_legacy_amount: '100000',
      retirement_custom_amount: '32000',
      life_events: [{ id: 'x', amount: 5000 }],
    },
  } as unknown as DraftStateSource & Record<string, unknown>
}

describe('serializeDraft — geen gevoelige velden in het geserialiseerde draft', () => {
  it('bevat geen enkele gevoelige top-level key', () => {
    const draft = serializeDraft(makeFullState())
    const keys = Object.keys(draft)
    for (const sensitive of SENSITIVE_DRAFT_KEYS) {
      expect(keys).not.toContain(sensitive)
    }
    // Ook via een volledige serialisatie-roundtrip mogen gevoelige woorden niet
    // in de opgeslagen JSON zitten.
    const json = JSON.stringify(draft)
    expect(json).not.toContain('Jan Paul')
    expect(json).not.toContain('1986-04-05')
    expect(json).not.toContain('3500') // inkomen én spaardoel-bedrag
    expect(json).not.toContain('Italië 2027')
    expect(json).not.toContain('30.000')
    expect(json).not.toContain('1500') // pensioen brutobedrag
    expect(json).not.toContain('100000') // fire_legacy_amount
    expect(json).not.toContain('boodschappen') // budgetAmounts
    expect(json).not.toContain('DUO') // schuld
  })

  it('bevat wél de niet-gevoelige keuzes', () => {
    const draft = serializeDraft(makeFullState())
    expect(draft.lastStep).toBe('spaardoel')
    expect(draft.selectedGoals).toEqual(['grip-uitgaven'])
    expect(draft.activeModules).toEqual(['budgetteren', 'toekomstplannen'])
    expect(draft.deferredFields).toEqual(['income'])
    expect(draft.spaardoel).toEqual({ presetKey: 'vakantie', skipped: false })
    expect(draft.pension).toEqual({ mode: 'estimate' })
    expect(draft.retirementExpense).toEqual({ method: 'custom_amount', skipped: false })
    expect(draft.horizon).toEqual({ fire_end_strategy: 'legacy', fire_end_age: 85, temporal_balance: 4 })
  })
})

describe('sanitizeStoredDraft — migratie stript een oud vol draft', () => {
  it('verwijdert alle gevoelige velden uit een bestaand oud (vol) draft', () => {
    // Een draft zoals de OUDE code die schreef: vol met gevoelige data.
    const oldFullDraft = {
      identity: { full_name: 'Jan Paul', date_of_birth: '1986-04-05', net_monthly_income: '3500' },
      budgetAmounts: { boodschappen: 400 },
      quickAssets: [{ asset_type: 'cash', name: 'Spaarrekening', current_value: 25000 }],
      quickDebts: [{ debt_type: 'mortgage', name: 'Hypotheek', current_balance: 250000 }],
      selectedGoals: ['grip-uitgaven'],
      activeModules: ['budgetteren'],
      deferredFields: ['assets'],
      spaardoel: { presetKey: 'noodfonds', name: 'Buffer', target_value: '10000', target_date: '2028-01', skipped: false },
      pension: { mode: 'upload', grossMonthly: '2000', startAge: '67', parseResult: { aowBedrag: 1400 } },
      retirementExpense: { method: 'current_income', customAmount: '40000', skipped: false },
      horizon: { fire_end_strategy: 'deplete', fire_end_age: 90, temporal_balance: 3, fire_legacy_amount: '50000', life_events: [{ id: 'y' }] },
      lastStep: 'pensioen',
    }
    const sanitized = sanitizeStoredDraft(oldFullDraft)
    expect(sanitized).not.toBeNull()
    const json = JSON.stringify(sanitized)
    // Geen enkele gevoelige waarde overleeft de strip.
    expect(json).not.toContain('Jan Paul')
    expect(json).not.toContain('3500')
    expect(json).not.toContain('25000')
    expect(json).not.toContain('250000')
    expect(json).not.toContain('Hypotheek')
    expect(json).not.toContain('Buffer')
    expect(json).not.toContain('10000')
    expect(json).not.toContain('2000') // pensioen bruto
    expect(json).not.toContain('40000')
    expect(json).not.toContain('50000') // fire_legacy_amount
    expect(json).not.toContain('boodschappen')
    // Niet-gevoelige keuzes blijven behouden.
    expect(sanitized!.selectedGoals).toEqual(['grip-uitgaven'])
    expect(sanitized!.deferredFields).toEqual(['assets'])
    expect(sanitized!.spaardoel).toEqual({ presetKey: 'noodfonds', skipped: false })
    expect(sanitized!.pension).toEqual({ mode: 'upload' })
    expect(sanitized!.retirementExpense).toEqual({ method: 'current_income', skipped: false })
    expect(sanitized!.horizon).toEqual({ fire_end_strategy: 'deplete', fire_end_age: 90, temporal_balance: 3 })
    expect(sanitized!.lastStep).toBe('pensioen')
  })

  it('migreert een legacy single-goal draft naar een selectedGoals-array', () => {
    const sanitized = sanitizeStoredDraft({ goal: 'grip-uitgaven', lastStep: 'bezittingen' })
    expect(sanitized!.selectedGoals).toEqual(['grip-uitgaven'])
  })

  it('valideert onbekende preset/strategie-waarden weg naar veilige defaults', () => {
    const sanitized = sanitizeStoredDraft({
      spaardoel: { presetKey: 'verzonnen', skipped: false },
      horizon: { fire_end_strategy: 'onzin', fire_end_age: 'x', temporal_balance: null },
      lastStep: 'spaardoel',
    })
    expect(sanitized!.spaardoel.presetKey).toBeNull()
    expect(sanitized!.horizon.fire_end_strategy).toBe('deplete')
    expect(sanitized!.horizon.fire_end_age).toBe(90)
    expect(sanitized!.horizon.temporal_balance).toBe(3)
  })

  it('geeft null terug voor niet-object input', () => {
    expect(sanitizeStoredDraft(null)).toBeNull()
    expect(sanitizeStoredDraft('kaas')).toBeNull()
    expect(sanitizeStoredDraft(42)).toBeNull()
  })
})

describe('hasResumableDraft — niet-gevoelig hervat-signaal', () => {
  function draft(overrides: Partial<NonSensitiveDraft> = {}): NonSensitiveDraft {
    return {
      selectedGoals: [],
      activeModules: [],
      deferredFields: [],
      spaardoel: { presetKey: null, skipped: false },
      pension: { mode: null },
      retirementExpense: { method: 'custom_amount', skipped: false },
      horizon: { fire_end_strategy: 'deplete', fire_end_age: 90, temporal_balance: 3 },
      ...overrides,
    }
  }

  it('false voor null', () => {
    expect(hasResumableDraft(null)).toBe(false)
  })

  it('false voor een leeg draft op de naam-stap zonder keuzes', () => {
    expect(hasResumableDraft(draft({ lastStep: 'naam' }))).toBe(false)
    expect(hasResumableDraft(draft())).toBe(false)
  })

  it('true zodra de gebruiker voorbij de naam-stap is', () => {
    expect(hasResumableDraft(draft({ lastStep: 'bezittingen' }))).toBe(true)
  })

  it('true zodra er een keuze gemaakt is (ook nog op de naam-stap)', () => {
    expect(hasResumableDraft(draft({ lastStep: 'naam', selectedGoals: ['grip-uitgaven'] }))).toBe(true)
    expect(hasResumableDraft(draft({ lastStep: 'naam', spaardoel: { presetKey: 'auto', skipped: false } }))).toBe(true)
    expect(hasResumableDraft(draft({ lastStep: 'naam', pension: { mode: 'estimate' } }))).toBe(true)
    expect(hasResumableDraft(draft({ lastStep: 'naam', deferredFields: ['income'] }))).toBe(true)
  })
})

describe('firstIncompleteRequiredStep — restore-guard', () => {
  const order = ['naam', 'geboortedatum', 'inkomen', 'klaar']

  it('geeft naam terug bij lege naam', () => {
    expect(firstIncompleteRequiredStep({ full_name: '', date_of_birth: '' }, order)).toBe('naam')
    expect(firstIncompleteRequiredStep({ full_name: '   ' }, order)).toBe('naam')
  })

  it('geeft geboortedatum terug wanneer naam gevuld maar dob leeg is', () => {
    expect(firstIncompleteRequiredStep({ full_name: 'Jan', date_of_birth: '' }, order)).toBe('geboortedatum')
  })

  it('geeft null terug wanneer beide verplichte velden aanwezig zijn', () => {
    expect(firstIncompleteRequiredStep({ full_name: 'Jan', date_of_birth: '1986-04-05' }, order)).toBeNull()
  })
})
