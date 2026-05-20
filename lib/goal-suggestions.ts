/**
 * Goal-suggestions — contextuele Will-tips per goal_type. Plan §6.3 Tab 2
 * "Detail-pane bij klik (slide-in, edit + bijdrage-monitor + acties van
 * Will)". MVP zonder DB-koppeling: per goal_type een vaste set tactics
 * die de gebruiker kan toepassen om sneller bij het doel te komen.
 *
 * Bron-inspiratie: Nibud-advies + boeken (Ramsey debt-snowball/avalanche,
 * Bogleheads index-portefeuille, NL-specifieke spaartaktieken). Bedragen
 * en percentages zijn voorzichtige NL-context-defaults.
 */

export type GoalKind = 'savings' | 'wealth' | 'debt'

export interface GoalSuggestion {
  /** Stable key voor React-list-key en analytics. */
  key: string
  /** Will-stem in 1 zin. */
  text: string
  /** Verwachte impact (vrij vorm — bv. "+30% consistentie"). */
  impact?: string
  /** Externe of interne deep-link voor de actie. */
  href?: string
  /** Vrije label voor de CTA. */
  ctaLabel?: string
}

const SAVINGS: GoalSuggestion[] = [
  {
    key: 'savings:auto-transfer',
    text: 'Stel een automatische maandoverboeking in op je doel-rekening — zo loop je niet meer achter op gedrag.',
    impact: '+30% consistentie',
    href: '/overzicht/cashflow',
    ctaLabel: 'Cashflow openen',
  },
  {
    key: 'savings:depo',
    text: 'Een termijndeposito (1-3 jaar) levert nu zo’n 2-3% méér rente dan een vrij opneembare rekening.',
    impact: '+€200/jr per €10k',
  },
]

const WEALTH: GoalSuggestion[] = [
  {
    key: 'wealth:etf-monthly',
    text: 'Maandelijks inleggen op een wereldwijde index-ETF (TER ≤ 0.25%) is statistisch de beste lange-termijn-keuze voor de gemiddelde NL‑belegger.',
    impact: '~7% gemiddeld jaarrendement',
    href: '/overzicht/bezittingen#asset-group-investment',
    ctaLabel: 'Beleggen openen',
  },
  {
    key: 'wealth:fees',
    text: 'Check je beheerkosten: 0.5% extra fee kost je over 30 jaar al snel €40k op een portefeuille van €100k.',
    href: '/overzicht/bezittingen#asset-group-investment',
    ctaLabel: 'Beheerkosten-impact',
  },
]

const DEBT: GoalSuggestion[] = [
  {
    key: 'debt:avalanche',
    text: 'Avalanche-methode: los eerst de schuld met de hoogste rente af — wiskundig de snelste route naar schuldvrij.',
    impact: 'Gemiddeld €1.200 minder rente over 5 jaar',
    href: '/overzicht/schulden',
    ctaLabel: 'Schulden openen',
  },
  {
    key: 'debt:extra-monthly',
    text: 'Eenmalig 1 maand-aflossing extra per jaar kort de looptijd van een 20-jarige hypotheek met ongeveer 2 jaar in.',
  },
]

const SUGGESTIONS: Record<GoalKind, GoalSuggestion[]> = {
  savings: SAVINGS,
  wealth: WEALTH,
  debt: DEBT,
}

/**
 * Suggesties voor één doel, max 2 stuks. Returnt een lege array voor
 * onbekende goal_type-waarden zodat de UI rustig blijft.
 */
export function getGoalSuggestions(
  goalType: string | null | undefined,
  limit = 2,
): GoalSuggestion[] {
  if (!goalType) return []
  const kind = goalType as GoalKind
  const all = SUGGESTIONS[kind]
  if (!all) return []
  return all.slice(0, limit)
}
