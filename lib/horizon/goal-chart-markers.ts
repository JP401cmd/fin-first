/**
 * Doel-markers op de tijdas — pure omzetting van `goals` (kalender-streefdatum)
 * naar `ChartEventOverlay`-items op de leeftijd-as (bevinding M36).
 *
 * ## Waarom deze module bestaat
 * De tijdas-grafiek plotte tot nu toe uitsluitend `life_events` (die dragen al
 * een `target_age`) en natuurlijke mijlpalen. Financiële doelen (`goals`) dragen
 * een KALENDERDATUM (`target_date`) en hadden daarom nooit marker-code — een
 * gebruiker zag zijn verse doel wél op /overzicht en op de Doelen-navkaart,
 * maar niet op het scherm dat over de toekomst gaat.
 *
 * ## Wat hier NIET gebeurt
 * **Consume, don't recompute.** Deze module raakt de doel-voortgang niet aan:
 * `computeGoalProgress` (`lib/goal-data.ts`) blijft de enige bron voor
 * percentage, `onTrack` en `eta`. Hier gaat het uitsluitend over de X-AS-PLAATSING
 * (datum → leeftijd) en de marker-vorm. Er wordt geen bedrag herrekend en geen
 * status afgeleid.
 *
 * ## Uitsluitingen
 * - **Lab-parameterdoelen** (`GOAL_TYPE_META[type].viaLab` — vandaag `fire_age`
 *   en `expected_return`) krijgen GEEN marker: die zijn al zichtbaar via het
 *   doelblok / de DoelVastlegSheet op dezelfde pagina. Bewust op de `viaLab`-vlag
 *   en niet op een overgetikte type-lijst, zodat een nieuw lab-type vanzelf
 *   meeloopt.
 * - **Doelen zonder `target_date`** krijgen geen marker (geen plek op een
 *   tijdas). Dat is een bekende grens, geen defect.
 * - **Afgeronde doelen** (`is_completed`) horen niet op de vooruitblik. De
 *   `/toekomst`-bundel levert ze al niet aan (`splitActiveGoals`); de filter
 *   staat hier als vangnet voor andere aanroepers.
 *
 * ## Verstreken streefdatums
 * Een doel met een streefdatum in het verleden ligt vóór de linkerrand van de
 * grafiek (die begint op de huidige leeftijd) en zou dus weggefilterd worden —
 * precies de onzichtbaarheid die M36 meldt. We klemmen zo'n marker daarom op
 * `currentAge` ("staat nog open, deadline is voorbij") en geven 'm de
 * stoplicht-rode semantiek plus een expliciete `detail`-regel. Rood is hier
 * SEMANTIEK (verstreken), geen module-accent — het volgt de accentkeuze dus niet.
 */

import { ageAtDate } from '@/lib/horizon/fire-format'
import { GOAL_TYPE_ICONS, GOAL_TYPE_META, type GoalType } from '@/lib/goal-data'
import type { ChartEventOverlay } from '@/lib/chart-event-overlay'

/** Id-prefix van een doel-marker. Klik-routing herkent 'm hieraan. */
export const GOAL_MARKER_ID_PREFIX = 'goal-'

/** Hoort dit marker-id bij een doel? */
export function isGoalMarkerId(id: string): boolean {
  return id.startsWith(GOAL_MARKER_ID_PREFIX)
}

/**
 * De velden die een doel-marker nodig heeft. Bewust een `Pick`-achtige vorm en
 * niet de volledige `Goal`, zodat elke bundel (fin-data-loader, dashboard) 'm
 * kan voeden zonder extra kolommen op te halen.
 */
export type GoalMarkerInput = {
  id: string
  name: string
  goal_type: GoalType
  target_date: string | null
  is_completed?: boolean
}

export type BuildGoalChartMarkersOptions = {
  /** ISO-geboortedatum uit `effectiveInput.dateOfBirth`. Zonder → geen markers. */
  dateOfBirth: string | null | undefined
  /** Huidige leeftijd (linkerrand van de grafiek); klem-vloer voor verstreken doelen. */
  currentAge: number | null | undefined
  /** Kleur voor een doel binnen zijn streefdatum (module-token, zie horizon-client). */
  color: string
  /** Kleur voor een verstreken streefdatum (stoplicht-rood, geen module-accent). */
  overdueColor: string
  /** Injecteerbaar "nu" voor tests. Default: `new Date()`. */
  now?: Date
}

const NL_DATE = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/**
 * Exacte leeftijd op een datum, inclusief de fractie binnen het lopende
 * levensjaar. Bouwt op `ageAtDate` (hele jaren) en verdeelt de rest over het
 * werkelijke aantal dagen tussen twee verjaardagen — zo staat er nergens een
 * tweede jaarlengte-constante en klopt een schrikkeljaar vanzelf.
 *
 * @returns de fractionele leeftijd, of `null` bij een onbruikbare datum.
 */
export function fractionalAgeAt(dobIso: string, at: Date): number | null {
  const birth = new Date(dobIso)
  if (Number.isNaN(birth.getTime()) || Number.isNaN(at.getTime())) return null

  const whole = ageAtDate(dobIso, at)
  const lastBirthday = new Date(birth)
  lastBirthday.setFullYear(birth.getFullYear() + whole)
  const nextBirthday = new Date(birth)
  nextBirthday.setFullYear(birth.getFullYear() + whole + 1)

  const span = nextBirthday.getTime() - lastBirthday.getTime()
  if (span <= 0) return whole
  const frac = (at.getTime() - lastBirthday.getTime()) / span
  return whole + Math.min(1, Math.max(0, frac))
}

/**
 * Zet doelen met een streefdatum om in marker-aanvragen voor de chart-overlay.
 *
 * De volgorde van de invoer blijft behouden (de bundel levert parameter-doelen
 * eerst); de stapel-positionering gebeurt verderop in `positionChartEvents`.
 */
export function buildGoalChartMarkers(
  goals: readonly GoalMarkerInput[],
  options: BuildGoalChartMarkersOptions,
): ChartEventOverlay[] {
  const { dateOfBirth, currentAge, color, overdueColor } = options
  if (!dateOfBirth) return []

  const now = options.now ?? new Date()
  const out: ChartEventOverlay[] = []

  for (const goal of goals) {
    if (goal.is_completed) continue
    if (!goal.target_date) continue
    // Lab-parameterdoelen zijn al zichtbaar via het doelblok → geen dubbele marker.
    if (GOAL_TYPE_META[goal.goal_type]?.viaLab) continue

    const target = new Date(goal.target_date)
    if (Number.isNaN(target.getTime())) continue

    const exactAge = fractionalAgeAt(dateOfBirth, target)
    if (exactAge == null || !Number.isFinite(exactAge)) continue

    const overdue = target.getTime() < now.getTime()
    // Verstreken doelen zouden links buiten beeld vallen: klem ze op "nu".
    const age = overdue && currentAge != null ? Math.max(currentAge, exactAge) : exactAge

    out.push({
      id: `${GOAL_MARKER_ID_PREFIX}${goal.id}`,
      label: goal.name,
      age,
      // Een doel is een vooruitzicht, geen kostenpost → boven de lijn. Bij
      // lijn-verankering collabeert `side` sowieso naar 'above'.
      side: 'above',
      color: overdue ? overdueColor : color,
      // Bewust het TYPE-icoon en niet `goal.icon`: de marker-laag zoekt op in de
      // gedeelde EVENT_ICONS-catalogus en valt anders terug op 'Calendar' — dan
      // ziet een doel eruit als een levensgebeurtenis.
      icon: GOAL_TYPE_ICONS[goal.goal_type] ?? 'Target',
      detail: overdue
        ? `Streefdatum verstreken · ${NL_DATE.format(target)}`
        : `Streefdatum · ${NL_DATE.format(target)}`,
      kind: 'goal',
      // Geen sourceId: doelen zijn niet sleepbaar op de tijdas (de streefdatum
      // wijzig je op /toekomst/doelen, waar ook de voortgang wordt herrekend).
      readOnly: true,
    })
  }

  return out
}
