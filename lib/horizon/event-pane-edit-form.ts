// ── Event-pane edit: form-state + helpers ───────────────────────────
// Pure form-state-logica van de Toekomst-gebeurtenis-editor. Verhuisd uit
// components/app/horizon/event-pane-edit.tsx zodat lib (tests) ze kan
// importeren zonder terug naar components te reiken (import-richting UI→lib).

import { LIFE_EVENT_CATALOG, type LifeEvent } from '@/lib/horizon-data'
import { LIFE_EVENT_STORIES, hasStory, defaultStoryAnswers, type StoryAnswerValue } from '@/lib/life-event-stories'

/** Form-state voor de drie-blokken-edit-flow. */
export interface EditFormState {
  name: string
  event_type: string
  shared_age: number
  // Block 1
  oneTimeAmount: number
  oneTimeDirection: 'income' | 'expense'
  // Block 2 — tijdelijk
  tempEnabled: boolean
  tempAmount: number
  tempDirection: 'income' | 'expense'
  tempDurationYears: number
  tempIndexed: boolean
  // Block 3 — continu
  contEnabled: boolean
  contAmount: number
  contDirection: 'income' | 'expense'
  contIndexed: boolean
  /** Story-antwoorden (alleen voor types met een story-config). */
  storyAnswers?: Record<string, string | number | boolean>
}

/**
 * Pas een story-antwoorden-set toe op de form-state. De story `computeImpact`
 * berekent verse impact-velden (eenmalig/tijdelijk/continu); deze overschrijven
 * de huidige waarden — bewust, omdat de story de bron-van-waarheid is wanneer
 * gebruiker via de story aanvult. Handmatige tweaks in de blokken erna blijven
 * staan tot de gebruiker opnieuw een story-antwoord wijzigt.
 */
export function applyStory(
  state: EditFormState,
  type: string,
  answers: Record<string, StoryAnswerValue>,
  baseAge: number,
): EditFormState {
  const story = LIFE_EVENT_STORIES[type]
  if (!story) return { ...state, storyAnswers: answers }
  const impact = story.computeImpact(answers, baseAge)
  // Leeftijd: één waarde, twee vensters (veld bovenaan + story-vraag). Bewust
  // GEEN klem hier: een klem in de state-pijplijn springt via de tekst-sync van
  // het invoerveld terug in het veld en maakt tussenwaarden ontypbaar (de
  // gemelde bug). De validatie (ageValid in de editor) beslist of er opgeslagen
  // mag worden; een ongeldige default vangt initFormState af.
  const sharedAge = impact.suggestedAge ?? state.shared_age
  return {
    ...state,
    ...(impact.oneTimeAmount != null && { oneTimeAmount: impact.oneTimeAmount }),
    ...(impact.oneTimeDirection != null && { oneTimeDirection: impact.oneTimeDirection }),
    ...(impact.tempEnabled != null && { tempEnabled: impact.tempEnabled }),
    ...(impact.tempAmount != null && { tempAmount: impact.tempAmount }),
    ...(impact.tempDirection != null && { tempDirection: impact.tempDirection }),
    ...(impact.tempDurationYears != null && { tempDurationYears: impact.tempDurationYears }),
    ...(impact.tempIndexed != null && { tempIndexed: impact.tempIndexed }),
    ...(impact.contEnabled != null && { contEnabled: impact.contEnabled }),
    ...(impact.contAmount != null && { contAmount: impact.contAmount }),
    ...(impact.contDirection != null && { contDirection: impact.contDirection }),
    ...(impact.contIndexed != null && { contIndexed: impact.contIndexed }),
    shared_age: sharedAge,
    name: impact.suggestedName && (state.name === '' || isCatalogDefaultName(state)) ? impact.suggestedName : state.name,
    storyAnswers: answers,
  }
}

function isCatalogDefaultName(s: EditFormState): boolean {
  return s.name === LIFE_EVENT_CATALOG[s.event_type]?.label
}

/** Key van de story-vraag die de leeftijd draagt, of null als het type geen story (met leeftijd) heeft. */
export function storyAgeKey(type: string): string | null {
  return LIFE_EVENT_STORIES[type]?.ageKey ?? null
}

/**
 * Zet de leeftijd vanuit het veld bovenaan het formulier en spiegel 'm naar de
 * story-vraag. Bewust ZONDER klem: een tussenwaarde tijdens typen ("4" op weg
 * naar "45") moet in de state kunnen landen — de validatie (ageValid in de
 * editor) beslist of er opgeslagen mag worden, niet de invoer.
 */
export function setSharedAge(state: EditFormState, age: number): EditFormState {
  const key = storyAgeKey(state.event_type)
  if (!key || !state.storyAnswers) return { ...state, shared_age: age }
  return { ...state, shared_age: age, storyAnswers: { ...state.storyAnswers, [key]: age } }
}

/** Map een form-state naar een LifeEvent (zonder id/sort_order). */
export function buildDraftEvent(
  s: EditFormState,
  existingEvent: LifeEvent | null,
): LifeEvent {
  let monthlyCost = 0
  let monthlyIncome = 0
  let duration = 0
  let indexed = false
  // Block 2 (tijdelijk) wint van Block 3 als beide aan staan
  if (s.tempEnabled && s.tempAmount > 0) {
    if (s.tempDirection === 'expense') monthlyCost = s.tempAmount
    else monthlyIncome = s.tempAmount
    duration = Math.round(s.tempDurationYears * 12)
    indexed = s.tempIndexed
  } else if (s.contEnabled && s.contAmount > 0) {
    if (s.contDirection === 'expense') monthlyCost = s.contAmount
    else monthlyIncome = s.contAmount
    duration = 0
    indexed = s.contIndexed
  }
  const oneTimeSigned =
    s.oneTimeAmount > 0
      ? s.oneTimeDirection === 'expense'
        ? s.oneTimeAmount
        : -s.oneTimeAmount
      : 0

  const catalogEntry = LIFE_EVENT_CATALOG[s.event_type]
  return {
    id: existingEvent?.id ?? 'draft',
    name: s.name,
    event_type: s.event_type,
    target_age: s.shared_age,
    target_date: existingEvent?.target_date ?? null,
    one_time_cost: oneTimeSigned,
    monthly_cost_change: monthlyCost,
    monthly_income_change: monthlyIncome,
    duration_months: duration,
    icon: catalogEntry?.icon ?? 'Calendar',
    is_active: true,
    sort_order: existingEvent?.sort_order ?? 0,
    is_indexed: indexed,
    metadata: {
      ...(existingEvent?.metadata ?? {}),
      ...(s.storyAnswers ? { story_answers: s.storyAnswers } : {}),
    },
  }
}

/** Initialiseer form-state uit catalog-defaults of een bestaand event. */
export function initFormState(
  type: string,
  existing: LifeEvent | null,
  currentAge: number,
): EditFormState {
  if (existing) {
    const rawStoryAnswers =
      (existing.metadata as Record<string, unknown> | undefined)?.story_answers as
        | Record<string, StoryAnswerValue>
        | undefined
    // Reconcilieer de twee leeftijd-vensters: vóór de sync (sep 2026) kon het
    // veld bovenaan afwijken van de story-vraag. target_age is wat de motor
    // gebruikte, dus die wint — anders springt de leeftijd bij de eerste
    // story-wijziging stil terug naar het oude story-antwoord.
    // Story-rijen zónder bewaarde antwoorden (bv. uit de scenario-bibliotheek)
    // krijgen de defaults, zodat de spiegeling ook daar werkt.
    const ageKey = storyAgeKey(existing.event_type)
    const baseAnswers = rawStoryAnswers ?? (hasStory(existing.event_type) ? defaultStoryAnswers(existing.event_type) : undefined)
    const savedStoryAnswers =
      baseAnswers && ageKey && existing.target_age != null && baseAnswers[ageKey] !== existing.target_age
        ? { ...baseAnswers, [ageKey]: existing.target_age }
        : baseAnswers
    return {
      name: existing.name,
      event_type: existing.event_type,
      shared_age: existing.target_age ?? currentAge,
      oneTimeAmount: Math.abs(existing.one_time_cost),
      oneTimeDirection: existing.one_time_cost >= 0 ? 'expense' : 'income',
      tempEnabled: existing.duration_months > 0,
      tempAmount:
        existing.duration_months > 0
          ? existing.monthly_cost_change || existing.monthly_income_change
          : 0,
      tempDirection: existing.monthly_income_change > 0 ? 'income' : 'expense',
      tempDurationYears:
        existing.duration_months > 0 ? Math.max(1, Math.round(existing.duration_months / 12)) : 5,
      tempIndexed: existing.is_indexed,
      contEnabled:
        existing.duration_months === 0 &&
        (existing.monthly_cost_change > 0 || existing.monthly_income_change > 0),
      contAmount:
        existing.duration_months === 0
          ? existing.monthly_cost_change || existing.monthly_income_change
          : 0,
      contDirection: existing.monthly_income_change > 0 ? 'income' : 'expense',
      contIndexed: existing.is_indexed,
      storyAnswers: savedStoryAnswers,
    }
  }
  const entry = LIFE_EVENT_CATALOG[type]
  if (!entry) {
    return {
      name: 'Eigen gebeurtenis',
      event_type: type,
      shared_age: currentAge + 5,
      oneTimeAmount: 0,
      oneTimeDirection: 'expense',
      tempEnabled: false,
      tempAmount: 0,
      tempDirection: 'expense',
      tempDurationYears: 5,
      tempIndexed: true,
      contEnabled: false,
      contAmount: 0,
      contDirection: 'expense',
      contIndexed: true,
    }
  }
  const oneTimeSigned = entry.defaultCost
  const oneTimeAbs = Math.abs(oneTimeSigned)
  // monthly: pak de niet-nul waarde uit catalog
  const monthlyAmount = Math.abs(entry.defaultMonthlyCost) || Math.abs(entry.defaultMonthlyIncome)
  const monthlyDirection: 'income' | 'expense' =
    entry.defaultMonthlyIncome > 0 || entry.defaultMonthlyIncome < 0 ? 'income' : 'expense'
  const isContinuous = entry.defaultDuration === 0 && monthlyAmount > 0
  const isTemporary = entry.defaultDuration > 0 && monthlyAmount > 0
  const baseState: EditFormState = {
    name: entry.label,
    event_type: type,
    shared_age: entry.defaultAge ?? currentAge + 5,
    oneTimeAmount: oneTimeAbs,
    oneTimeDirection: oneTimeSigned >= 0 ? 'expense' : 'income',
    tempEnabled: isTemporary,
    tempAmount: isTemporary ? monthlyAmount : 0,
    tempDirection: monthlyDirection,
    tempDurationYears: isTemporary ? Math.max(1, Math.round(entry.defaultDuration / 12)) : 5,
    tempIndexed: true,
    contEnabled: isContinuous,
    contAmount: isContinuous ? monthlyAmount : 0,
    contDirection: monthlyDirection,
    contIndexed: true,
  }
  // Als dit type een inspirerende story heeft: initialiseer met story-defaults
  // en pas computeImpact toe — zo zien gebruikers direct de berekende cijfers
  // gebaseerd op de aanbevolen antwoorden i.p.v. ruwe catalog-defaults.
  if (hasStory(type)) {
    const answers = defaultStoryAnswers(type)
    // Story-leeftijd-default (bv. wereldreis: 35) kan onder de huidige leeftijd
    // liggen → neem dan dezelfde startleeftijd als een type zonder story zou
    // krijgen (catalog-defaultAge of nu+5), anders is het formulier meteen ongeldig.
    const ageKey = storyAgeKey(type)
    if (ageKey) {
      const proposed = Number(answers[ageKey])
      if (!Number.isFinite(proposed) || proposed < currentAge) {
        answers[ageKey] = Math.max(currentAge, baseState.shared_age)
      }
    }
    return applyStory(baseState, type, answers, currentAge)
  }
  return baseState
}
