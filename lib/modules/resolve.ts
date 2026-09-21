/**
 * Actieve modules van een profiel — de ÉNE lezing van `profiles.active_modules`.
 *
 * Krant 2A (fase 1, het leespad): tot nu toe negeerde de app-shell de kolom
 * (`const activeModules = [...ALL_MODULES]`) en las de AI-context hem met een
 * eigen `?? ALL_MODULES`. Elke lezer gaat voortaan via deze helper, zodat een
 * Krant-account (alleen 'nieuws') straks op elk oppervlak hetzelfde betekent.
 *
 * Bewust een PURE module: géén React, géén 'use client', géén Node-API's —
 * de edge-proxy (`lib/supabase/proxy.ts`) importeert hem via `lib/home-screen.ts`.
 *
 * Gedragsbehoud voor bestaande profielen (poort K1): productie kent op 21 sep
 * 2026 alleen `null` (3×) en de volledige set van zes (26×). Beide geven exact
 * `ALL_MODULES` terug, in catalogusvolgorde — de shell, de widgets en de AI
 * zien dus hetzelfde als vóór deze wijziging.
 */

import { MODULE_CATALOG, ALL_MODULES, type ModuleId } from '@/lib/module-registry'

/** Minimale profielvorm: alleen de kolom die deze helper leest. */
export interface ActiveModulesRow {
  active_modules?: unknown
}

/**
 * Vertaal de opgeslagen kolom naar de actieve moduleset.
 *
 * - `null`/`undefined`/geen array/geen rij → alle modules (kolom-default en de
 *   waarde die `onboarding/reset` achterlaat).
 * - Onbekende of niet-string waarden worden weggefilterd.
 * - Blijft er geen enkele bekende module over (ook `[]`) → alle modules.
 *   Fail-open is gedragsbehoud: `validateModules([])` is ongeldig, dus een lege
 *   set is nooit een bewuste keuze en mag de shell niet leegmaken.
 * - Uitvoer in catalogusvolgorde, zonder dubbelen — de volgorde in de DB is
 *   betekenisloos.
 *
 * Retourneert altijd een verse array (nooit de gedeelde `ALL_MODULES`-instantie),
 * zodat een consument die muteert de catalogus niet kan vervuilen.
 */
export function resolveActiveModules(
  row: ActiveModulesRow | null | undefined,
): ModuleId[] {
  const raw = row?.active_modules
  if (!Array.isArray(raw)) return [...ALL_MODULES]

  const stored = new Set(raw.filter((v): v is string => typeof v === 'string'))
  const resolved = MODULE_CATALOG.map((m) => m.id).filter((id) => stored.has(id))

  return resolved.length > 0 ? resolved : [...ALL_MODULES]
}

/**
 * Precies de Krant-set: alleen 'nieuws'. Verwacht een al opgeloste set
 * (uitvoer van `resolveActiveModules`), niet de ruwe kolom.
 */
export function isNewsOnly(modules: readonly ModuleId[]): boolean {
  return modules.length === 1 && modules[0] === 'nieuws'
}
