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
// Alleen een type: lib/home-screen.ts importeert deze module runtime, dus een
// runtime-import terug zou een cyclus zijn. `import type` wordt weggegomd.
import type { HomeScreen } from '@/lib/home-screen'

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

// ── Productkeuze (Krant 2A fase 2, ADR 0184) ───────────────────────────────

/**
 * De producten waartussen een account wisselt. De keuze is een PRODUCT, geen
 * modulelijst (keuze 2A van de eigenaar): de client stuurt `{ product }` naar
 * `PUT /api/modules` en de server kiest de preset. Een derde ingang (bv. de
 * Budget-ingang uit het GTM-plan) is hier later één regel.
 */
export const PRODUCTS = ['krant', 'geheel'] as const

export type Product = (typeof PRODUCTS)[number]

export interface ProductPreset {
  /** Wat in `profiles.active_modules` komt. */
  readonly modules: readonly ModuleId[]
  /** Wat in `profiles.home_screen` komt (persisteerbaar, niet per se kiesbaar). */
  readonly homeScreen: HomeScreen
}

/**
 * Preset per product — de énige plek die zegt welke modules en welk
 * homescherm bij een product horen.
 *
 * - krant  → alleen 'nieuws', home 'nieuws' (/nieuws). Opent de Krant; de
 *   productgrens zelf (routes, Fin, AI) is Krant 2B.
 * - geheel → alle modules in catalogusvolgorde, home 'overzicht' (de default).
 *
 * Bevroren kopieën: een consument die per ongeluk muteert, kan noch de preset
 * noch de gedeelde `ALL_MODULES`-instantie vervuilen. Pure data — edge-veilig,
 * net als de rest van deze module.
 */
export const PRODUCT_PRESETS: Readonly<Record<Product, ProductPreset>> = Object.freeze({
  krant: Object.freeze({ modules: Object.freeze<ModuleId[]>(['nieuws']), homeScreen: 'nieuws' }),
  geheel: Object.freeze({ modules: Object.freeze<ModuleId[]>([...ALL_MODULES]), homeScreen: 'overzicht' }),
})
