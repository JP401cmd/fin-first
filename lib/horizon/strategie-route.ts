/**
 * Waar de vier levensstrategieën (AOW, Pensioen, Huis, Werk) wonen: in katern Instellingen
 * op /toekomst/instellingen, geopend via `?strategie=<key>` (ADR 0179: Voorkeuren en
 * Gebeurtenissen gingen daarin op). Eén home voor het pad en de sleutelvalidatie.
 *
 * De oude deeplinks /toekomst/voorkeuren?strategie=… en /toekomst/gebeurtenissen?strategie=…
 * vangt `next.config.ts` op (redirect met query); een eigen server-redirect is niet meer nodig.
 */

import type { ManagedStrategy } from '@/lib/strategy-events'

export const STRATEGIE_PAGINA = '/toekomst/instellingen'

const STRATEGIE_KEYS: readonly ManagedStrategy[] = ['aow', 'pensioen', 'huis', 'werk']

/** Is dit een geldige levensstrategie-sleutel voor `?strategie=`? (`open` e.d. zijn dat niet.) */
export function isStrategieKey(value: unknown): value is ManagedStrategy {
  return typeof value === 'string' && (STRATEGIE_KEYS as readonly string[]).includes(value)
}

/** Deeplink die de editor van één levensstrategie opent. */
export function strategieHref(key: ManagedStrategy): string {
  return `${STRATEGIE_PAGINA}?strategie=${key}`
}
