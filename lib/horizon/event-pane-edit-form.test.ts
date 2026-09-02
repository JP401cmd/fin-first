import { describe, it, expect } from 'vitest'
import { initFormState, applyStory, setSharedAge, storyAgeKey } from './event-pane-edit-form'
import { LIFE_EVENT_STORIES, defaultStoryAnswers } from '@/lib/life-event-stories'

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
