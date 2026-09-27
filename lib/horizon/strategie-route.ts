/**
 * Waar de vier levensstrategieën (AOW, Pensioen, Huis, Werk) wonen: in katern Plan op
 * /toekomst, bij de levensgebeurtenissen (eigenaarsbesluit 27 sep 2026: "neem de
 * levensstrategieën op in het plan"). De deeplink is `/toekomst?rij=<key>#levensstrategieen`;
 * de rij-sleutel is gelijk aan de strategie-sleutel (`STRATEGIE_NAAR_RIJ` in
 * lib/toekomst/instellingen-rij.ts). De oude vorm `?strategie=<key>` blijft een alias.
 *
 * Oude links naar katern Instellingen (`/toekomst/instellingen?rij=aow`, `?strategie=pensioen`)
 * en de nog oudere subroutes vangt `next.config.ts` op de routing-laag op (redirect met
 * query). Eén home voor het pad, het anker en de sleutelvalidatie.
 */

import type { ManagedStrategy } from '@/lib/strategy-events'

/** De pagina waar de levensstrategieën staan: katern Plan. */
export const STRATEGIE_PAGINA = '/toekomst'

/** Anker van het blok Levensstrategieën op Plan. */
export const LEVENSSTRATEGIEEN_ANKER = 'levensstrategieen'

const STRATEGIE_KEYS: readonly ManagedStrategy[] = ['aow', 'pensioen', 'huis', 'werk']

/** Is dit een geldige levensstrategie-sleutel voor `?strategie=`? (`open` e.d. zijn dat niet.) */
export function isStrategieKey(value: unknown): value is ManagedStrategy {
  return typeof value === 'string' && (STRATEGIE_KEYS as readonly string[]).includes(value)
}

/** Deeplink die de editor van één levensstrategie opent (de rij op Plan). */
export function strategieHref(key: ManagedStrategy): string {
  return `${STRATEGIE_PAGINA}?rij=${key}#${LEVENSSTRATEGIEEN_ANKER}`
}
