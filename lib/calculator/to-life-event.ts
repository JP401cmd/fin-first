/**
 * Rekenhulp → levensgebeurtenis-brug (fase 2).
 *
 * Een calculator staat los van de projectie, maar de gebruiker kan de
 * uitkomst optioneel "destilleren" tot een levensgebeurtenis die wél de
 * tijdas/projectie voedt. Deze helper bouwt het `life_events`-insert-
 * formaat met veilige defaults; de UI vult naam/leeftijd/bedrag in.
 */

export type LifeEventImpactKind = 'one_time_cost' | 'monthly_cost' | 'monthly_income'

export interface LifeEventDraft {
  name: string
  event_type: string
  target_age: number | null
  one_time_cost: number
  monthly_cost_change: number
  monthly_income_change: number
  duration_months: number
  is_indexed: boolean
  icon: string
}

export interface LifeEventDraftInput {
  name: string
  targetAge: number | null
  impactKind: LifeEventImpactKind
  /** Bedrag (altijd positief opgegeven; teken wordt hier bepaald). */
  amount: number
  /** Alleen relevant voor maandelijkse impact. */
  durationMonths?: number
}

/**
 * Bouw een life_events-insert-payload uit de door de gebruiker gekozen
 * mapping. Eénmalige kosten → one_time_cost; maandelijkse kosten/inkomen
 * → de bijbehorende delta + duur. Het bedrag wordt als absolute waarde
 * behandeld en op het juiste veld gezet.
 */
export function buildLifeEventDraft(input: LifeEventDraftInput): LifeEventDraft {
  const amount = Math.abs(input.amount)
  const draft: LifeEventDraft = {
    name: input.name.trim() || 'Rekenhulp-uitkomst',
    event_type: 'custom',
    target_age: input.targetAge,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: 0,
    duration_months: 0,
    is_indexed: false,
    icon: 'Calculator',
  }
  switch (input.impactKind) {
    case 'one_time_cost':
      draft.one_time_cost = amount
      break
    case 'monthly_cost':
      draft.monthly_cost_change = amount
      draft.duration_months = Math.max(0, Math.round(input.durationMonths ?? 0))
      break
    case 'monthly_income':
      draft.monthly_income_change = amount
      draft.duration_months = Math.max(0, Math.round(input.durationMonths ?? 0))
      break
  }
  return draft
}
