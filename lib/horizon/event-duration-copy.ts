/**
 * Looptijd-tekst van een levensgebeurtenis — één helper voor élk tijdas-oppervlak
 * (tijdstrip-tooltip, chart-tooltip, cluster-sheet, gebeurtenissenlijst, Duur-figuur).
 *
 * Aanleiding (Notion 3daf9e8d, 19 sep 2026): de rekenmotor kapt een "tot ik stop met
 * werken"-gebeurtenis af op het stopmoment van de run (ADR 0143), maar geen enkel
 * oppervlak noemde dat moment — de tijdstrip zei zelfs letterlijk "· 0 mnd".
 *
 * Consume, don't recompute: het stopmoment komt uit de REEDS GEDRAAIDE run
 * (`eventStopAgeFromSim`), nooit uit een eigen `target_age + n` of eigen bisectie.
 */

import type { LifeEvent } from './life-events-catalog'
import { isTotStopmoment } from './life-events-catalog'
import { formatStopAge } from './anker-copy'

/**
 * Het stopmoment van een run als fractionele leeftijd: het vaste anker
 * (`vastStopLeeftijd`) wint, anders het door de solver gevonden moment
 * (`fireAgeFractional`). NOOIT `fireAge` — dat is de afgeronde (ceil) leeftijd.
 * `null` ⇒ geen bereikbaar stopmoment binnen het plan (`unreachable_within_horizon`)
 * of geen run.
 */
export function eventStopAgeFromSim(
  sim: { vastStopLeeftijd?: number | null; fireAgeFractional?: number | null } | null | undefined,
): number | null {
  if (sim == null) return null
  const vast = sim.vastStopLeeftijd
  if (typeof vast === 'number' && Number.isFinite(vast)) return vast
  const solved = sim.fireAgeFractional
  return typeof solved === 'number' && Number.isFinite(solved) ? solved : null
}

/** Copy voor de drie looptijd-vormen; één plek zodat elk oppervlak hetzelfde zegt. */
export const EVENT_DURATION_COPY = {
  blijvend: 'blijvend',
  /** Zonder gedraaide run (geen doorrekening beschikbaar): het kale label. */
  totStopZonderRun: 'tot stopmoment',
  totStop: (stopAge: number) => `tot stopmoment (${formatStopAge(stopAge)})`,
  totStopOnbekend: 'tot stopmoment — nog geen stopmoment binnen je plan',
} as const

/**
 * Beschrijft hoe lang een maandbedrag van een gebeurtenis loopt:
 *  - tijdelijk (`duration_months > 0`)  → "24 mnd"
 *  - blijvend zonder stopkeuze          → "blijvend"
 *  - "tot ik stop met werken", bereikbaar → "tot stopmoment (58,5)"
 *  - "tot ik stop met werken", geen stopmoment in het plan → eerlijk label, géén
 *    leeftijd en geen stille terugval op de eindleeftijd (de motor laat de post dan
 *    tot de horizon lopen, maar de gebruiker koos "tot stop").
 *
 * `stopAge` = `eventStopAgeFromSim(run)`. Alleen zinvol voor events met een
 * maandbedrag; de aanroeper beslist of de regel getoond wordt.
 */
export function describeEventDuration(
  event: Pick<LifeEvent, 'metadata' | 'duration_months'>,
  stopAge: number | null | undefined,
  opts: { /** `false` ⇒ er is géén run gedraaid: kaal "tot stopmoment", geen onbereikbaar-label. */ hasRun?: boolean } = {},
): string {
  if (event.duration_months > 0) return `${event.duration_months} mnd`
  if (!isTotStopmoment(event)) return EVENT_DURATION_COPY.blijvend
  if (opts.hasRun === false) return EVENT_DURATION_COPY.totStopZonderRun
  return stopAge != null && Number.isFinite(stopAge)
    ? EVENT_DURATION_COPY.totStop(stopAge)
    : EVENT_DURATION_COPY.totStopOnbekend
}
