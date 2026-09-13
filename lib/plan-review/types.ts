/**
 * Plan-review Toekomst (TPR-01, ADR 0142) — de vijf stappen en de bevestigd-markering.
 *
 * De review is een OPTIONELE, hervatbare herbevestiging van de keuzes waarmee de
 * Toekomst-grafiek rekent. Ze introduceert géén nieuwe rekenweg en géén nieuw
 * schrijfpad voor de keuzes zelf: bevestigen schrijft de waarde via de bestaande
 * route (`/api/fire-settings`, `/api/withdrawal-strategy`, …) en zet daarnaast één
 * markering per stap in `profiles.plan_review_state` (own-row JSONB-pref).
 *
 * WAAROM EEN EIGEN MARKERING (en niet "is het veld gevuld?"): sinds TPR-05 schrijft
 * de onboarding het onttrekkingsprofiel en de verdeling-bij-toename niet meer stil
 * weg, maar een `pot_rules.surplus_group` op de DB-default is niet te onderscheiden
 * van een bewuste keuze. De markering zegt "de gebruiker heeft dit gezien en
 * bevestigd"; de profielstaat zegt of die bevestiging nog geldt (zie `progress.ts`).
 */

/** De vijf stappen, in de volgorde die de code-afhankelijkheden afdwingen. */
export const PLAN_REVIEW_STAPPEN = ['plan', 'uitgaven', 'inkomsten', 'woning', 'potten'] as const
export type PlanReviewStap = (typeof PLAN_REVIEW_STAPPEN)[number]

/**
 * Afronding van euro-bedragen in de effectmaat (trede 3): de overzichten en de live footer
 * ronden gelijk af, zodat "geen verschil" op beide plekken hetzelfde betekent.
 */
export const EFFECT_BEDRAG_AFRONDING = 1000

/** De query-param die de review op /toekomst opent (+ optioneel `stap`). */
export const PLAN_REVIEW_PARAM = 'planreview'
export const PLAN_REVIEW_STAP_PARAM = 'stap'
/**
 * De deeplink naar de review, vanaf elke route (⌘K, "Alle keuzes doorlopen").
 * Bewust in deze server-veilige module: een constante uit een `'use client'`-bestand
 * is in een server-component een client-referentie, geen string.
 */
export const PLAN_REVIEW_HREF = `/toekomst?${PLAN_REVIEW_PARAM}=open`

/**
 * De naam van de review zoals de gebruiker hem overal ziet — pane-titel, ⌘K, de
 * heropen-knop op /toekomst/voorkeuren en de Voorkeuren-kaart in review-stand.
 * Eén bron (besluit eigenaar 13 sep 2026), zodat de ingangen niet uit elkaar lopen.
 */
export const PLAN_REVIEW_NAAM = 'Je voorkeuren voor je plan instellen'

/** Stapnamen zoals kaart en pane ze tonen (client-veilig: geen kern-imports hier). */
export const PLAN_REVIEW_STAP_TITELS: Record<PlanReviewStap, string> = {
  plan: 'Je plan',
  uitgaven: 'Leven na stoppen',
  inkomsten: 'Wat er binnenkomt',
  woning: 'Je huis en ander vast bezit',
  potten: 'Hoe je potten werken',
}

/**
 * Laag 2 — "Voor wie wil" (TPR-15; besluit eigenaar 13 sep 2026: inline met één waarde, een
 * bereik later). De aannames onder het plan, op het afsluitscherm van de pane en daar ook in
 * te stellen. Ze horen niet bij een stap: opslaan zet geen markering.
 */
export const PLAN_REVIEW_LAAG2_ONDERDELEN = ['inflatie', 'bruto-rendement', 'box3', 'rendement-bezitting'] as const
export type PlanReviewLaag2Onderdeel = (typeof PLAN_REVIEW_LAAG2_ONDERDELEN)[number]

/**
 * Naam en korte uitleg per onderdeel. `Record<PlanReviewLaag2Onderdeel, …>`: een nieuw
 * onderdeel heeft pas geldige kopij (en een editor, `PLAN_REVIEW_LAAG2_EDITORS`) wanneer
 * het hier staat (meebeweeg-check, laag b).
 */
export const PLAN_REVIEW_LAAG2: Record<PlanReviewLaag2Onderdeel, { label: string; uitleg: string }> = {
  inflatie: {
    label: 'Inflatie',
    uitleg: 'Met hoeveel prijsstijging per jaar de app je bedragen laat meegroeien.',
  },
  'bruto-rendement': {
    label: 'Bruto rendement',
    uitleg: 'Het rendement voor bezittingen waar geen eigen rendement bij staat.',
  },
  box3: {
    label: 'Box 3-methode',
    uitleg:
      'Of de app Box 3 rekent met het forfaitaire stelsel of met je werkelijke rendement, en welk deel daarvan onbelast blijft.',
  },
  'rendement-bezitting': {
    label: 'Rendement per bezitting',
    uitleg: 'Met welk rendement elke eigen bezitting in je plan groeit.',
  },
}

export function isPlanReviewStap(value: unknown): value is PlanReviewStap {
  return typeof value === 'string' && (PLAN_REVIEW_STAPPEN as readonly string[]).includes(value)
}

/** Wie de markering zette. Alleen de review zelf schrijft 'm (bewust geen onboarding-bron). */
export type PlanReviewBron = 'review'

export interface PlanReviewMarkering {
  /** ISO-tijdstip van de bevestiging. */
  bevestigd_op: string
  bron: PlanReviewBron
}

/** De JSONB-map zoals opgeslagen: stap → markering. Afwezige sleutel = niet bevestigd. */
export type PlanReviewState = Partial<Record<PlanReviewStap, PlanReviewMarkering>>

/**
 * Tolerant lezen van de rauwe kolomwaarde: onbekende sleutels en misvormde
 * markeringen vallen weg (= niet bevestigd). Nooit een fout op een rare rij —
 * de review is optioneel en mag de pagina niet blokkeren.
 */
export function parsePlanReviewState(raw: unknown): PlanReviewState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: PlanReviewState = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isPlanReviewStap(key)) continue
    if (!value || typeof value !== 'object') continue
    const m = value as { bevestigd_op?: unknown; bron?: unknown }
    if (typeof m.bevestigd_op !== 'string' || Number.isNaN(Date.parse(m.bevestigd_op))) continue
    if (m.bron !== 'review') continue
    out[key] = { bevestigd_op: m.bevestigd_op, bron: 'review' }
  }
  return out
}

/** Status van één stap zoals de kaart en de pane 'm tonen. */
export type PlanReviewStapStatus = 'bevestigd' | 'open' | 'nvt'

/**
 * Waarom een stap (weer) open staat terwijl er wél een markering is — de
 * verouderingsregels van A10. `null` = gewoon nog niet bevestigd.
 */
export type PlanReviewOpenReden = 'aow_ontbreekt' | 'woning_zonder_strategie' | null

export interface PlanReviewStapVoortgang {
  stap: PlanReviewStap
  status: PlanReviewStapStatus
  reden: PlanReviewOpenReden
}

export interface PlanReviewProgress {
  stappen: PlanReviewStapVoortgang[]
  /** Aantal bevestigde stappen (n.v.t. telt niet mee). */
  bevestigd: number
  /** Aantal stappen dat meetelt (n.v.t. uitgesloten). */
  totaal: number
  /** De eerste stap die nog open staat; `null` als alles bevestigd is. */
  eersteOpen: PlanReviewStap | null
  /** `true` zodra geen enkele stap meer open is — de kaart wordt dan weer de gewone Voorkeuren-kaart. */
  voltooid: boolean
}

/**
 * De profielfeiten waaruit de voortgang wordt afgeleid. Server-side gebouwd uit
 * de Horizon-bundel (`buildPlanReviewFacts`), serialiseerbaar, zodat de pane
 * dezelfde afleiding client-side kan herhalen na een bevestiging.
 */
export interface PlanReviewFacts {
  /** Is er een actief `aow`-life-event? Zonder rekent de kern met €0 AOW (TPR-04). */
  hasAowEvent: boolean
  /** Actieve `eigen_huis`-bezitting aanwezig? */
  hasEigenHuis: boolean
  /** Actief niet-liquide bezit (eigen huis, vastgoed, auto, deelneming, …) aanwezig? */
  hasNietLiquideBezit: boolean
  /** Staat er een expliciete `housing_strategy_config` op het profiel? */
  housingConfigured: boolean
}
