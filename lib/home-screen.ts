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
 *  - `app/api/home-screen/route.ts` (zod-enum uit HOME_SCREEN_VALUES)
 *  - `lib/hooks/use-home-screen.tsx` (client-provider, geseed uit de layout)
 */

export const HOME_SCREEN_VALUES = ['overzicht', 'budget'] as const

export type HomeScreen = (typeof HOME_SCREEN_VALUES)[number]

export const DEFAULT_HOME_SCREEN: HomeScreen = 'overzicht'

/**
 * Route per keuze. 'budget' wijst naar de canonieke Budgetteren-pagina
 * (label "Budgetteren", OVERVIEW_APP_SUBROUTES in lib/nav-config.ts) — niet
 * naar de legacy /core/budgets-alias.
 */
export const HOME_SCREEN_HREFS: Record<HomeScreen, string> = {
  overzicht: '/overzicht',
  budget: '/overzicht/budget',
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
