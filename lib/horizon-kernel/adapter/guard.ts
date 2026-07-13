/**
 * Horizon-kernel adapter — dubbeltelling-guard (FASE 3, snede 2).
 *
 * Eén uniform mechanisme dat bepaalt welke `life_events` al door een STRATEGIE of
 * AUTO-EXPANDER in de kern-invoer terechtkomen — en dus NIET nogmaals als handmatige
 * `Geb`-rij mogen worden geteld. `events.ts` routeert uitsluitend de `vrij`-partitie
 * naar `Geb`-rijen; de rest gaat via de param-blokken (AutoGebeurtenisParams /
 * WerkStrategieParams / woning-config uit snede 1).
 *
 * ## Wat telt als "beheerd" (loopt NIET via de vrije Geb-mapping)
 * - **De vier strategieën** (`isStrategyManagedEvent`, `lib/strategy-events.ts`):
 *   `aow` · `pension` · `werk` · `huis` (huis = virtueel event, id-prefix
 *   `housing-strategy:`; de woning loopt via de config uit snede 1).
 * - **De twee auto-expanders** (Auto-gebeurtenissen-tab): `children` → NIBUD-params,
 *   `inheritance` → erfenis-params. `isStrategyManagedEvent` kent deze bewust NIET
 *   (ze dragen geen "Beheerd via …"-badge in de UI), maar `events.ts` consumeert ze
 *   wél als domein-invoer — dus mogen ze evenmin als vrije Geb-rij dubbeltellen.
 * - **Slider-werk-flows** (`isSliderWorkEvent`, wat-als/scenariolaag): een
 *   `scenario_origin`-event `slider:income` (income_change), `slider:workdays`
 *   (part_time) of `slider:extra_inleg` (extra_inleg) draagt een PERMANENTE inkomens-
 *   delta. Die hoort NIET als doorlopende Geb-baat (die CF!H onvoorwaardelijk telt —
 *   óók ná FIRE = modellek), maar via het salaris-kanaal (`nettoJaarinkomen`), waar de
 *   kern-FIRE-gate dynamisch geldt. De partitie houdt ze dus óók uit `vrij`; `events.ts`
 *   sommeert hun delta apart. **Extra inleg is per 13-jul FIRE-gegate** (kaart "Doel lijn
 *   grafiek vragen"): het stelt voor de gebruiker extra werk-/spaarruimte voor die na de
 *   vrijheidsleeftijd — als je stopt met werken — vervalt, precies als income/workdays.
 *   De kósten-slider (`slider:savings` = lifestyle_adjustment) blijft BEWUST een vrije
 *   Geb-event: een permanente uitgavenwijziging loopt logisch door in de onttrekking.
 *
 * ## Verplichte eigenschap (plan-doc §9)
 * Met een strategie actief bevat de kern-input de afgeleide stroom precies ÉÉN keer,
 * en de `solveFire`-uitkomst is identiek mét/zónder de (visueel) herhaalde beheerde
 * events in de aangeboden lijst. Twee mechanismen borgen dat samen:
 *  1. `partitionEvents` houdt beheerde events uit de Geb-mapping (routering).
 *  2. `dedupeById` vangt een letterlijk herhaald event uit de visuele lijst
 *     (`/toekomst/gebeurtenissen` toont een beheerd event als badge-rij) af, zodat
 *     ook de expander het maar één keer ziet.
 *
 * App-zijde (mag app-types importeren); geen kern-afhankelijkheid. Pure functies.
 */

import { isStrategyManagedEvent, type ManagedStrategy } from '@/lib/strategy-events'

/** Minimale event-vorm die de guard nodig heeft (subset van `LifeEvent`). */
export interface GuardEvent {
  readonly id: string
  readonly event_type: string
  /**
   * Client-only scenario-herkomst (`WhatIfEvent extends LifeEvent`); bv. `slider:income`.
   * Afwezig op DB-events en op `LifeEvent` zelf — optioneel zodat `LifeEvent` toewijsbaar
   * blijft aan `GuardEvent` en de guard het runtime-veld tóch veilig kan lezen.
   */
  readonly scenario_origin?: string | null
}

/**
 * `scenario_origin`-waarden die een SLIDER-WERK-flow markeren: de inkomens-, werkdagen- en
 * extra-inleg-slider. Alledrie dragen een permanente inkomens-delta die via het salaris-kanaal
 * (FIRE-gegate) hoort te lopen i.p.v. als levenslange Geb-baat. BEWUST NIET erin:
 * `slider:savings` (kósten-delta, loopt door in de onttrekking).
 *
 * Let op — dit is de SLIDER-set: alleen `buildSliderEvent` (`lib/scenario-events.ts`) zet deze
 * origins. De beslishulp-runs dragen `beslishulp:*` (bewust GEEN slider-origin): daar hoort de
 * extra inleg juist als compoundende Geb-post te blijven, omdat die kaart uitsluitend het
 * opbouw-kruispunt (`fireAgeFromSim`) leest en niet de onttrekkingsfase.
 */
export const SLIDER_WORK_ORIGINS: ReadonlySet<string> = new Set([
  'slider:income',
  'slider:workdays',
  'slider:extra_inleg',
])

/**
 * True als dit event een slider-werk-flow is (inkomen-, werkdagen- of extra-inleg-slider).
 * Herkenning via `scenario_origin` (robuust; geen naam- of id-string-matching). Deze events
 * worden noch aan een strategie/expander, noch aan een vrije Geb-rij toegewezen — hun
 * inkomens-delta gaat via het salaris-kanaal (`buildEventInputs.salarisDeltaPerMaand`).
 */
export function isSliderWorkEvent(event: GuardEvent): boolean {
  return event.scenario_origin != null && SLIDER_WORK_ORIGINS.has(event.scenario_origin)
}

/**
 * De event-typen die via een AUTO-EXPANDER (niet via een badge-"strategie") in de
 * kern-invoer landen: `children` → NIBUD-kinderparams, `inheritance` → erfenis-params.
 * Bewust apart van `isStrategyManagedEvent` (dat alleen de vier UI-strategieën kent).
 */
export const AUTO_EXPANDER_EVENT_TYPES: ReadonlySet<string> = new Set(['children', 'inheritance'])

/** De expander/strategie die dit event beheert (superset van `ManagedStrategy`). */
export type ExpanderKind = ManagedStrategy | 'kinderen' | 'erfenis'

/**
 * Welke expander/strategie beheert dit event? `null` = vrij → handmatige Geb-rij.
 * Volgorde is bewust: `isStrategyManagedEvent` eerst, zodat een virtueel huis-event
 * (id-prefix, ongeacht `event_type`) altijd op 'huis' landt en nooit per ongeluk
 * door een type-match (aow/pension/…) wordt opgepikt.
 */
export function expanderFor(event: GuardEvent): ExpanderKind | null {
  const strategie = isStrategyManagedEvent(event)
  if (strategie !== null) return strategie
  if (event.event_type === 'children') return 'kinderen'
  if (event.event_type === 'inheritance') return 'erfenis'
  return null
}

/** True zodra het event via een strategie/expander telt (dus niet via de Geb-mapping). */
export function isExpanderManagedEvent(event: GuardEvent): boolean {
  return expanderFor(event) !== null
}

/** Het resultaat van `partitionEvents`: beheerd (via param-blokken) vs. vrij (Geb-rijen). */
export interface EventPartition<T extends GuardEvent> {
  /** Door een strategie/expander beheerd — loopt via AutoGebeurtenis/Werk/woning-config. */
  readonly strategieGestuurd: readonly T[]
  /** Vrij bewerkbaar — wordt door `events.ts` naar handmatige Geb-rijen gemapt. */
  readonly vrij: readonly T[]
}

/**
 * Splits de aangeboden events in {strategieGestuurd, vrij}. Voor de UI/beheer-
 * weergave (badges) én als guard: alléén `vrij` mag de Geb-mapping in. Dedupliceert
 * NIET (de UI wil de lijst tonen zoals aangeboden); de build-laag (`events.ts`)
 * dedupliceert vóór het mappen.
 */
export function partitionEvents<T extends GuardEvent>(events: readonly T[]): EventPartition<T> {
  const strategieGestuurd: T[] = []
  const vrij: T[] = []
  for (const ev of events) {
    if (isExpanderManagedEvent(ev)) strategieGestuurd.push(ev)
    else vrij.push(ev)
  }
  return { strategieGestuurd, vrij }
}

/**
 * Dedupliceer op event-id (stabiel; eerste voorkomen wint). Een visuele lijst kan een
 * beheerd event herhaald tonen; de dedup zorgt dat zo'n herhaling nooit dubbel
 * meetelt — dé kern van de byte-identiteit-eis (plan §9).
 */
export function dedupeById<T extends { id: string }>(events: readonly T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const ev of events) {
    if (seen.has(ev.id)) continue
    seen.add(ev.id)
    out.push(ev)
  }
  return out
}
