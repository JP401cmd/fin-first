/**
 * De FIRE-nastrevers-lat: gecureerde peer-FIRE-leeftijd per leeftijdscohort.
 *
 * Dit is een NORMATIEVE lat — "leeftijdsgenoten die vroeg willen stoppen" —
 * bewust een ándere grootheid dan de CBS-mediaan-peer van `./reference-peer.ts`:
 * die modelleert het typische NL-huishouden (en haalt FIRE daardoor pas laat of
 * niet), terwijl deze lat de maat is waartegen de gezondheids-pijler
 * `fire_progress` de KOERS van de gebruiker legt. Zelfde cohort-as
 * (`AGE_BANDS` uit ./cohort.ts) zodat er geen derde cohort-schema ontstaat.
 *
 * Waarden per eigenaar-akkoord 31 aug 2026 (voorstel met rekenvoorbeelden):
 * 25–34 → 55 · 35–44 → 58 · 45–54 → 62 · 55+ → 65. De band-grenzen volgen de
 * bestaande AGE_BANDS (25–35/35–45/…): alleen op de exacte randleeftijden
 * (35/45/55) wijkt dat een jaar af van de voorstels-notatie — bewust, om de
 * cohort-as van de benchmark te hergebruiken. tot25 erft de 25–35-lat.
 *
 * Geen gemeten statistiek — een gecureerde ambitie-lat. Zodra er voldoende
 * opt-in TriFinity-cohortdata bestaat kan dezelfde tabel gevoed worden door
 * echte peers zonder dat de score-formule wijzigt.
 */

import { ageToBand, type AgeBandKey } from './cohort'

export const FIRE_PEER_AGE_BY_BAND: Record<AgeBandKey, number> = {
  tot25: 55,
  '25-35': 55,
  '35-45': 58,
  '45-55': 62,
  '55-65': 65,
  '65-75': 65,
  '75plus': 65,
}

/**
 * Startleeftijd van de verwachtings-opbouwcurve (signaal B van de
 * fire_progress-pijler): vóór deze leeftijd wordt geen opbouw verwacht.
 */
export const FIRE_PEER_CURVE_START_AGE = 25

/**
 * Peer-FIRE-leeftijd voor een concrete leeftijd, via de bestaande cohort-as.
 * `Math.floor`: de AGE_BANDS-grenzen zijn gehele jaren (25..34, 35..44, …) —
 * een fractionele leeftijd (34,5) zou anders op géén band matchen en via de
 * `??`-terugval van ageToBand stil op de 75plus-lat belanden (review H2).
 */
export function firePeerAgeForAge(age: number): number {
  return FIRE_PEER_AGE_BY_BAND[ageToBand(Math.floor(age)).key]
}
