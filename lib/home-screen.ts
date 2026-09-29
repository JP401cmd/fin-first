/**
 * Homescherm-keuze — waar de app voor je opent.
 *
 * Eén profiel-brede voorkeur (profiles.home_screen) die bepaalt waar een
 * "ga naar hoofdscherm"-navigatie landt: het Overzicht (default, huidig
 * gedrag) of de Budgetteren-pagina. De menu-indeling verandert NIET mee —
 * alleen plekken die semantisch "home" betekenen (login-landing, /dashboard,
 * PWA-start, top-bar ←, long-press op de waffle) volgen deze keuze.
 *
 * SINGLE SOURCE OF TRUTH voor de waarden en de bijbehorende routes. Consumers:
 *  - `lib/supabase/proxy.ts` (edge middleware) — daarom is dit bewust een PURE
 *    module: géén React, géén 'use client', géén Node-API's.
 *  - `app/api/home-screen/route.ts` (zod-enum uit HOME_SCREEN_PICKABLE)
 *  - `app/api/modules/route.ts` (schrijft 'nieuws' bij de productkeuze Krant)
 *  - `lib/hooks/use-home-screen.tsx` (client-provider, geseed uit de layout)
 *  - `components/mijn/home-screen-picker.tsx` (toont alleen PICKABLE)
 *  - `lib/beheer/gebruik-analyse/schema.ts` (fail-closed zod op de verdeling)
 *
 * TWEE LIJSTEN (Krant 2A fase 2, ADR 0184):
 *  - `HOME_SCREEN_VALUES` — alles wat de kolom mag bevatten (spiegel van de
 *    CHECK `profiles_home_screen_check`, migratie 20261006120000). Gebruik
 *    deze voor LEZEN en valideren van opgeslagen waarden.
 *  - `HOME_SCREEN_PICKABLE` — wat een gebruiker zelf mag kiezen. 'nieuws' zit
 *    daar bewust niet in: die zet alleen de server bij de productkeuze Krant.
 *    Gebruik deze voor elk schrijfpad vanuit de client en elke keuzelijst.
 */

import {
  isNewsOnly,
  resolveActiveModules,
  type ActiveModulesRow,
} from '@/lib/modules/resolve'

/** Alle persisteerbare waarden — spiegel van de CHECK op profiles.home_screen. */
export const HOME_SCREEN_VALUES = ['overzicht', 'budget', 'nieuws'] as const

export type HomeScreen = (typeof HOME_SCREEN_VALUES)[number]

/**
 * De waarden die een gebruiker zelf kiest (picker, ⌘K, PUT /api/home-screen).
 * 'nieuws' ontbreekt bewust: een Geheel-gebruiker kan de Krant niet als
 * startscherm kiezen — de Krant is een product (PUT /api/modules), geen scherm.
 */
export const HOME_SCREEN_PICKABLE = ['overzicht', 'budget'] as const satisfies readonly HomeScreen[]

export type PickableHomeScreen = (typeof HOME_SCREEN_PICKABLE)[number]

export const DEFAULT_HOME_SCREEN: HomeScreen = 'overzicht'

/**
 * Route per waarde. 'budget' wijst naar de canonieke Budgetteren-pagina
 * (label "Budgetteren", OVERVIEW_APP_SUBROUTES in lib/nav-config.ts) — niet
 * naar de legacy /core/budgets-alias. 'nieuws' is de Krant-home, dezelfde
 * route als `NEWS_ONLY_HOME_HREF`.
 */
export const HOME_SCREEN_HREFS: Record<HomeScreen, string> = {
  overzicht: '/overzicht',
  budget: '/overzicht/budget',
  nieuws: '/nieuws',
}

export function isHomeScreen(value: unknown): value is HomeScreen {
  return (
    typeof value === 'string' &&
    (HOME_SCREEN_VALUES as readonly string[]).includes(value)
  )
}

/**
 * Vertaal een (mogelijk onbekende/ontbrekende) opgeslagen waarde naar de
 * home-route. Onbekend of afwezig → de default-route: een profielrij van vóór
 * de migratie of een corrupt gegeven mag nooit de navigatie breken.
 */
export function homeHrefFor(value: unknown): string {
  return isHomeScreen(value)
    ? HOME_SCREEN_HREFS[value]
    : HOME_SCREEN_HREFS[DEFAULT_HOME_SCREEN]
}

/** Home van een account met alleen de module 'nieuws' (de Krant). */
export const NEWS_ONLY_HOME_HREF = HOME_SCREEN_HREFS.nieuws

/**
 * Home-route uit de profielrij: de productgrens wint van de voorkeur.
 *
 * Een account met alleen 'nieuws' (via `resolveActiveModules`) landt op
 * /nieuws, ongeacht een (mogelijk stale) `home_screen`. Elk ander account volgt
 * zijn homescherm-keuze via `homeHrefFor`. Vervangt `getHomePath` uit
 * `lib/module-registry.ts` (Krant 2A). Leest beide kolommen uit één rij, zodat
 * de proxy geen extra query nodig heeft.
 */
export function resolveHomeHref(
  row: (ActiveModulesRow & { home_screen?: unknown }) | null | undefined,
): string {
  if (isNewsOnly(resolveActiveModules(row))) return NEWS_ONLY_HOME_HREF
  return homeHrefFor(row?.home_screen)
}
