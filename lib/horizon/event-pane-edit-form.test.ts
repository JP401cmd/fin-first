import { describe, it, expect } from 'vitest'
import { initFormState, applyStory, setSharedAge, storyAgeKey, buildDraftEvent } from './event-pane-edit-form'
import { LIFE_EVENT_STORIES, defaultStoryAnswers } from '@/lib/life-event-stories'
import { isTotStopmoment } from '@/lib/horizon-data'

/**
 * Leeftijd is één waarde met twee vensters: het veld "Leeftijd" bovenaan het
 * formulier en de story-vraag ("Vanaf welke leeftijd?"). Beide moeten altijd
 * dezelfde waarde tonen en de waarde mag nooit onder de huidige leeftijd
 * uitkomen — anders blokkeert Opslaan op een default die de gebruiker niet
 * zelf koos (wereldreis: story-default 35 bij een 40-jarige).
 */
describe('event-pane-edit-form — leeftijd is één bron met twee vensters', () => {
  it('storyAgeKey wijst voor elke story met suggestedAge naar een bestaande vraag', () => {
    for (const [type, story] of Object.entries(LIFE_EVENT_STORIES)) {
      const impact = story.computeImpact(defaultStoryAnswers(type), 40)
      if (impact.suggestedAge == null) continue
      const key = storyAgeKey(type)
      expect(key, `${type} mist ageKey`).toBeTruthy()
      expect(story.questions.some(q => q.key === key), `${type}: ageKey ${key} is geen vraag`).toBe(true)
    }
  })

  it('initFormState: story-default onder de huidige leeftijd valt terug op een geldige leeftijd', () => {
    // Given een 40-jarige, When world_trip wordt gekozen (story-default 35)
    const s = initFormState('world_trip', null, 40)
    // Then ligt de leeftijd op of na nu, en staat de story-vraag op dezelfde waarde
    expect(s.shared_age).toBeGreaterThanOrEqual(40)
    expect(s.storyAnswers?.startAge).toBe(s.shared_age)
  })

  it('initFormState: story-default boven de huidige leeftijd blijft staan', () => {
    const s = initFormState('world_trip', null, 30)
    expect(s.shared_age).toBe(35)
    expect(s.storyAnswers?.startAge).toBe(35)
  })

  it('applyStory klemt NIET: een tussenwaarde in de story-vraag landt ongewijzigd (validatie beslist)', () => {
    // Een klem hier springt via de tekst-sync terug in het veld en maakt "4" op
    // weg naar "45" ontypbaar — precies de gemelde bug in het tweede venster.
    const base = initFormState('world_trip', null, 40)
    const next = applyStory(base, 'world_trip', { ...base.storyAnswers, startAge: 4 }, 40)
    expect(next.shared_age).toBe(4)
    expect(next.storyAnswers?.startAge).toBe(4)
  })

  it('initFormState(existing): een oud event met afwijkend story-antwoord neemt target_age als waarheid', () => {
    const existing = {
      id: 'x', name: 'Mijn wereldreis', event_type: 'world_trip', target_age: 52, target_date: null,
      one_time_cost: 30000, monthly_cost_change: 0, monthly_income_change: 0, duration_months: 0,
      icon: 'Globe', is_active: true, sort_order: 0, is_indexed: false,
      metadata: { story_answers: { ...defaultStoryAnswers('world_trip'), startAge: 35 } },
    }
    const s = initFormState('world_trip', existing, 40)
    expect(s.shared_age).toBe(52)
    expect(s.storyAnswers?.startAge).toBe(52)
  })

  it('applyStory: een geldige story-leeftijd wint van het bovenste veld', () => {
    const base = initFormState('world_trip', null, 40)
    const next = applyStory(base, 'world_trip', { ...base.storyAnswers, startAge: 52 }, 40)
    expect(next.shared_age).toBe(52)
  })

  it('initFormState(existing): een story-rij zonder bewaarde antwoorden krijgt defaults met target_age als leeftijd', () => {
    const existing = {
      id: 'y', name: 'Wereldreis', event_type: 'world_trip', target_age: 47, target_date: null,
      one_time_cost: 20000, monthly_cost_change: 0, monthly_income_change: 0, duration_months: 0,
      icon: 'Globe', is_active: true, sort_order: 0, is_indexed: false, metadata: {},
    }
    const s = initFormState('world_trip', existing, 40)
    expect(s.storyAnswers?.startAge).toBe(47)
    expect(setSharedAge(s, 50).storyAnswers?.startAge).toBe(50)
  })

  it('setSharedAge spiegelt het bovenste veld naar de story-vraag', () => {
    const base = initFormState('world_trip', null, 40)
    const next = setSharedAge(base, 55)
    expect(next.shared_age).toBe(55)
    expect(next.storyAnswers?.startAge).toBe(55)
  })

  it('setSharedAge laat een type zonder story met rust', () => {
    const base = initFormState('custom', null, 40)
    const next = setSharedAge(base, 55)
    expect(next.shared_age).toBe(55)
    expect(next.storyAnswers).toBeUndefined()
  })

  it('setSharedAge accepteert een tussenwaarde tijdens typen zonder te klemmen', () => {
    // De klem hoort in de validatie (ageValid), niet in de invoer — anders kan
    // "45" nooit getypt worden (leeg → 40, "4" erachter → 404 → 90).
    const base = initFormState('world_trip', null, 40)
    expect(setSharedAge(base, 4).shared_age).toBe(4)
  })
})

/**
 * ADR 0143 — "Tot wanneer?" bij een blijvende verandering. De keuze staat expliciet in de
 * gebeurtenis (`metadata.tot_stopmoment`) en overleeft opslaan → opnieuw openen.
 */
describe('event-pane-edit-form — tot wanneer loopt een blijvende verandering', () => {
  const existing = {
    id: 'inleg', name: 'Extra beleggen €1.700/mnd', event_type: 'custom', target_age: 46, target_date: null,
    one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: 1700, duration_months: 0,
    icon: 'Calculator', is_active: true, sort_order: 0, is_indexed: false,
    metadata: { story_answers: undefined, andere_sleutel: 'blijft' } as Record<string, unknown>,
  }

  it('een bestaand event zonder keuze opent als "blijft doorlopen" en slaat geen sleutel op', () => {
    const s = initFormState('custom', existing, 46)
    expect(s.contEnabled).toBe(true)
    expect(s.contUntilStop).toBe(false)
    const draft = buildDraftEvent(s, existing)
    expect(draft.metadata).not.toHaveProperty('tot_stopmoment')
    expect(draft.metadata).toHaveProperty('andere_sleutel', 'blijft')
  })

  it('"tot ik stop met werken" wordt opgeslagen en komt terug bij opnieuw openen', () => {
    const s = { ...initFormState('custom', existing, 46), contUntilStop: true }
    const draft = buildDraftEvent(s, existing)
    expect(draft.metadata).toHaveProperty('tot_stopmoment', true)
    expect(draft.duration_months).toBe(0)
    expect(initFormState('custom', draft, 46).contUntilStop).toBe(true)
  })

  it('bij een type met eigen maandlogica (kinderen) wordt de keuze niet opgeslagen — hij zou niets doen', () => {
    const kind = { ...existing, event_type: 'children' }
    const draft = buildDraftEvent({ ...initFormState('children', kind, 46), contEnabled: true, contAmount: 500, contUntilStop: true }, kind)
    expect(draft.metadata).not.toHaveProperty('tot_stopmoment')
  })

  it('isTotStopmoment negeert een achtergebleven sleutel op een tijdelijk event', () => {
    expect(isTotStopmoment({ metadata: { tot_stopmoment: true }, duration_months: 24 })).toBe(false)
    expect(isTotStopmoment({ metadata: { tot_stopmoment: true }, duration_months: 0 })).toBe(true)
  })

  it('omzetten naar tijdelijk wist de stopmoment-keuze (geen stille erfenis uit de oude metadata)', () => {
    const metKeuze = { ...existing, metadata: { tot_stopmoment: true } }
    const s = {
      ...initFormState('custom', metKeuze, 46),
      contEnabled: false,
      tempEnabled: true,
      tempAmount: 1700,
      tempDirection: 'income' as const,
      tempDurationYears: 5,
    }
    const draft = buildDraftEvent(s, metKeuze)
    expect(draft.duration_months).toBe(60)
    expect(draft.metadata).not.toHaveProperty('tot_stopmoment')
  })
})
