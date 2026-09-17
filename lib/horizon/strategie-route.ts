/**
 * Waar de vier levensstrategieën (AOW, Pensioen, Huis, Werk) wonen: op /toekomst/voorkeuren,
 * geopend via `?strategie=<key>`. Sinds 17 sep 2026 verhuisd van /toekomst/gebeurtenissen
 * (besluit eigenaar: verhuizen, geen dubbeling). Eén home voor het pad, de sleutelvalidatie
 * en de backwards-compat-redirect van de oude Gebeurtenissen-deeplink.
 */

import type { ManagedStrategy } from '@/lib/strategy-events'

export const STRATEGIE_PAGINA = '/toekomst/voorkeuren'

const STRATEGIE_KEYS: readonly ManagedStrategy[] = ['aow', 'pensioen', 'huis', 'werk']

/** Is dit een geldige levensstrategie-sleutel voor `?strategie=`? (`open` e.d. zijn dat niet.) */
export function isStrategieKey(value: unknown): value is ManagedStrategy {
  return typeof value === 'string' && (STRATEGIE_KEYS as readonly string[]).includes(value)
}

/** Deeplink die de editor van één levensstrategie opent. */
export function strategieHref(key: ManagedStrategy): string {
  return `${STRATEGIE_PAGINA}?strategie=${key}`
}

type SearchParams = Record<string, string | string[] | undefined>

function eerste(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

/**
 * Backwards-compat voor /toekomst/gebeurtenissen: draagt de URL een geldige
 * `?strategie=<aow|pensioen|huis|werk>`, dan hoort de bezoeker op Voorkeuren te landen —
 * met álle query-params behouden (spiegelt `resolveTabRedirect` op /toekomst).
 *
 * @returns het redirect-doel, of `null` wanneer de bezoeker op Gebeurtenissen blijft.
 */
export function resolveStrategieRedirect(sp: SearchParams): string | null {
  if (!isStrategieKey(eerste(sp.strategie))) return null
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(sp)) {
    if (value === undefined) continue
    if (Array.isArray(value)) for (const v of value) qs.append(key, v)
    else qs.append(key, value)
  }
  return `${STRATEGIE_PAGINA}?${qs.toString()}`
}
