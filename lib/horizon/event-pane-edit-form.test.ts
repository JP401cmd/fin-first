import { describe, it, expect } from 'vitest'
import {
  initFormState,
  applyStory,
  setSharedAge,
  storyAgeKey,
  buildDraftEvent,
  formStateUitVoorstel,
} from './event-pane-edit-form'
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

/**
 * Given een catalogus-type zonder story met een NEGATIEVE defaultMonthlyIncome
 * (inkomensverlies: part_time −1000, early_retirement −2500),
 * When EventPane een nieuw formulier opent (initFormState zonder bestaand event),
 * Then staat het maandbedrag als UITGAVE (expense) in het formulier, niet als inkomst.
 * Zelfde tekenregel als computeSuggestedEventValues (event-prefill.ts): alleen een
 * positieve defaultMonthlyIncome is een inkomst. Gevonden 26 sep: part_time gaf
 * +€1.000/mnd en early_retirement +€2.500/mnd inkomsten, dus een te rooskleurig plan.
 */
describe('event-pane-edit-form — teken van het catalogus-maandbedrag', () => {
  for (const type of ['part_time', 'early_retirement'] as const) {
    it(`${type}: negatief maandinkomen wordt een uitgave`, () => {
      const s = initFormState(type, null, 40)
      const actief = s.tempEnabled ? { dir: s.tempDirection, amt: s.tempAmount } : { dir: s.contDirection, amt: s.contAmount }
      expect(actief.amt).toBeGreaterThan(0)
      expect(actief.dir).toBe('expense')
    })
  }
})

/**
 * Given een OPGESLAGEN gebeurtenis met een maandblok dat negatief is weggeschreven
 * (AI-extractie en onboarding schrijven een inkomensverlies als negatief
 * monthly_income_change; een besparing kan een negatief monthly_cost_change zijn),
 * When EventPane haar opent om te bewerken (initFormState met `existing`),
 * Then staat het maandblok aan, met een POSITIEF bedrag en de juiste richting:
 * minder inkomen = uitgave, minder kosten = inkomst. Anders gooit buildDraftEvent
 * (bedrag > 0) het blok bij opslaan stil weg. Gevonden 26 sep bij de backfill-afbakening.
 */
describe('event-pane-edit-form — bestaand negatief maandblok blijft behouden', () => {
  const rij = (m: { cost: number; income: number; duration: number }) => ({
    id: 'x', name: 'Minder werken', event_type: 'custom', target_age: 45, target_date: null,
    one_time_cost: 0, monthly_cost_change: m.cost, monthly_income_change: m.income, duration_months: m.duration,
    icon: 'Clock', is_active: true, sort_order: 0, is_indexed: true, metadata: {},
  })

  it('doorlopend inkomensverlies (income −1500) → uitgave 1500, blok aan', () => {
    const s = initFormState('custom', rij({ cost: 0, income: -1500, duration: 0 }), 40)
    expect(s.contEnabled).toBe(true)
    expect(s.contAmount).toBe(1500)
    expect(s.contDirection).toBe('expense')
  })

  it('tijdelijk inkomensverlies (income −1500, 24 mnd) → uitgave 1500', () => {
    const s = initFormState('custom', rij({ cost: 0, income: -1500, duration: 24 }), 40)
    expect(s.tempEnabled).toBe(true)
    expect(s.tempAmount).toBe(1500)
    expect(s.tempDirection).toBe('expense')
  })

  it('doorlopende besparing (cost −500) → inkomst 500', () => {
    const s = initFormState('custom', rij({ cost: -500, income: 0, duration: 0 }), 40)
    expect(s.contEnabled).toBe(true)
    expect(s.contAmount).toBe(500)
    expect(s.contDirection).toBe('income')
  })

  it('ongewijzigd: kosten +500 → uitgave 500; inkomen +800 → inkomst 800', () => {
    const k = initFormState('custom', rij({ cost: 500, income: 0, duration: 0 }), 40)
    expect([k.contEnabled, k.contAmount, k.contDirection]).toEqual([true, 500, 'expense'])
    const i = initFormState('custom', rij({ cost: 0, income: 800, duration: 12 }), 40)
    expect([i.tempEnabled, i.tempAmount, i.tempDirection]).toEqual([true, 800, 'income'])
  })

  it('opslaan na openen verliest het blok niet (round-trip via buildDraftEvent)', () => {
    const s = initFormState('custom', rij({ cost: 0, income: -1500, duration: 0 }), 40)
    const draft = buildDraftEvent(s, null)
    expect(draft.monthly_cost_change).toBe(1500)
    expect(draft.monthly_income_change).toBe(0)
  })
})

/**
 * Given een geaccepteerd Fin-voorstel (`suggest_life_event`) waarvan het schema zegt
 * "monthly_income_change: negatief = minder inkomen",
 * When EventPane het voorstel in een vers formulier zet (`formStateUitVoorstel`),
 * Then volgt het maandblok dezelfde tekenregel als een opgeslagen rij: minder inkomen is
 * een UITGAVE, meer inkomen een inkomst, minder kosten een inkomst. Gevonden 26 sep
 * (FX-D): elk voorstel met monthly_income_change ≠ 0 werd als inkomst opgeslagen, voor
 * elk type, dus een inkomensverlies maakte het plan rooskleuriger.
 */
describe('event-pane-edit-form — teken van een Fin-voorstel', () => {
  const voorstel = (m: { cost?: number; income?: number; duration?: number }) => ({
    name: 'Minder werken',
    target_age: 50,
    one_time_cost: 0,
    monthly_cost_change: m.cost ?? 0,
    monthly_income_change: m.income ?? 0,
    duration_months: m.duration ?? 0,
  })
  const vers = () => initFormState('custom', null, 40)

  it('doorlopend inkomensverlies (income −800) → uitgave 800, en zo opgeslagen', () => {
    const s = formStateUitVoorstel(vers(), voorstel({ income: -800 }))
    expect(s.contEnabled).toBe(true)
    expect(s.contAmount).toBe(800)
    expect(s.contDirection).toBe('expense')
    const draft = buildDraftEvent(s, null)
    expect(draft.monthly_cost_change).toBe(800)
    expect(draft.monthly_income_change).toBe(0)
  })

  it('tijdelijk inkomensverlies (income −1200, 18 mnd) → uitgave 1200', () => {
    const s = formStateUitVoorstel(vers(), voorstel({ income: -1200, duration: 18 }))
    expect(s.tempEnabled).toBe(true)
    expect(s.tempAmount).toBe(1200)
    expect(s.tempDirection).toBe('expense')
    expect(s.tempDurationYears).toBe(2)
    expect(s.contEnabled).toBe(false)
  })

  it('meer inkomen (income +500) blijft een inkomst', () => {
    const s = formStateUitVoorstel(vers(), voorstel({ income: 500 }))
    expect(s.contAmount).toBe(500)
    expect(s.contDirection).toBe('income')
  })

  it('extra kosten (cost +300) blijven een uitgave; een besparing (cost −300) is een inkomst', () => {
    expect(formStateUitVoorstel(vers(), voorstel({ cost: 300 })).contDirection).toBe('expense')
    expect(formStateUitVoorstel(vers(), voorstel({ cost: -300 })).contDirection).toBe('income')
  })

  it('neemt naam, leeftijd en eenmalig bedrag over', () => {
    const s = formStateUitVoorstel(vers(), { ...voorstel({}), one_time_cost: 4000 })
    expect(s.name).toBe('Minder werken')
    expect(s.shared_age).toBe(50)
    expect(s.oneTimeAmount).toBe(4000)
    expect(s.oneTimeDirection).toBe('expense')
    expect(s.contEnabled).toBe(false)
  })
})
