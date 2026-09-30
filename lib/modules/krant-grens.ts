/**
 * De productgrens van de Krant (Krant 2B) — de ÉNE plek die zegt wat een
 * Krant-account mag zien en wat niet.
 *
 * Een Krant-account is een profiel waarvan `resolveActiveModules(profile)`
 * precies `['nieuws']` is (`isNewsOnly`). Zo'n account is een afgesloten
 * product: het bereikt alleen de Krant en zijn eigen accountpagina's, en krijgt
 * nergens Fin of AI (besluit B11). Alle consumenten — de layout-redirect, de
 * client-routewacht, de navigatie, de Fin-mount, de briefingmail en de AI-poort
 * — lezen deze module, zodat "Krant-account" op elk oppervlak hetzelfde betekent.
 *
 * GEDRAGSBEHOUD (harde eis): voor elk ander account — `null`, alle zes modules,
 * of welke subset ook maar niet precies `['nieuws']` — geven alle beslissingen
 * hier exact het oude gedrag terug (geen redirect, Fin gemount, briefing aan).
 *
 * Bewust een PURE module: géén React, géén Next-API's, géén Node-API's. De
 * edge-proxy, server-routes en client-componenten importeren hem allemaal.
 */

import type { ModuleId } from '@/lib/module-registry'
import {
  isNewsOnly,
  resolveActiveModules,
  type ActiveModulesRow,
} from '@/lib/modules/resolve'

/** Waar een Krant-account landt, en waar de grens hem naartoe stuurt. */
export const KRANT_HOME_HREF = '/nieuws'

/**
 * De Mijn-bestemming van een Krant-account. De /mijn-hub zelf ligt buiten de
 * grens (hij toont kaarten naar profiel, koppelingen, uiterlijk…), dus de
 * Mijn-ingang in de navigatie wijst hier direct naartoe.
 */
export const KRANT_MIJN_HREF = '/mijn/account'

/**
 * Request-header waarmee de proxy (`lib/supabase/proxy.ts`) het pad doorgeeft
 * aan de layout. Een server-layout kent zijn eigen pad niet; zonder deze header
 * kan hij de grens niet toetsen.
 */
export const PATHNAME_HEADER = 'x-tf-pathname'

/**
 * De routes binnen de grens. Elke entry is een PREFIX-grens: de route zelf en
 * alles eronder (`/nieuws`, `/nieuws/…`), nooit een woord dat er toevallig mee
 * begint (`/nieuwsbrief`, `/nieuwsX`).
 *
 * `/krant/meer` (2D) bestaat sinds R2, `/mijn/nieuwsprofiel` (2C) sinds 0.92.28.
 * `/mijn/notificaties` in plaats van het `/mijn/meldingen` van de kaart: die
 * route bestaat niet, de meldingsvoorkeuren staan op /mijn/notificaties.
 */
export const KRANT_ROUTES: readonly string[] = [
  '/nieuws',
  '/mijn/nieuwsprofiel',
  '/mijn/notificaties',
  '/mijn/account',
  '/krant/meer',
]

/**
 * Beheer is geen product: een superadmin met een Krant-testaccount mag /beheer
 * blijven bereiken, anders sluit een testende beheerder zichzelf buiten. De
 * /beheer-layout toetst de rol zelf nog een keer (`isSuperAdmin`).
 */
const BEHEER_PREFIX = '/beheer'

/** Strip query, hash en een afsluitende slash, zodat de prefixtoets robuust is. */
function normalizePath(pathname: string): string {
  let p = pathname.split('?')[0]!.split('#')[0]!
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p
}

function underPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/')
}

/** Ligt dit pad binnen de Krant-grens? */
export function isKrantRoute(pathname: string): boolean {
  if (!pathname) return false
  const path = normalizePath(pathname)
  return KRANT_ROUTES.some((prefix) => underPrefix(path, prefix))
}

/** Is dit (al opgeloste) moduleset een Krant-account? */
export function isKrantAccount(modules: readonly ModuleId[]): boolean {
  return isNewsOnly(modules)
}

/** Is deze profielrij een Krant-account? Leest de ruwe `active_modules`-kolom. */
export function isKrantProfile(row: ActiveModulesRow | null | undefined): boolean {
  return isNewsOnly(resolveActiveModules(row))
}

/**
 * Mag dit account dit pad zien? Voor elk niet-Krant-account altijd `true`.
 * Een Krant-account ziet alleen de grensroutes, en als superadmin ook /beheer.
 */
export function isRouteAllowed(
  pathname: string,
  modules: readonly ModuleId[],
  isSuperadmin: boolean,
): boolean {
  if (!isKrantAccount(modules)) return true
  if (isKrantRoute(pathname)) return true
  return isSuperadmin && underPrefix(normalizePath(pathname), BEHEER_PREFIX)
}

/**
 * De beslissing van de routegrens: waarheen moet dit verzoek, of `null` als het
 * mag blijven.
 *
 * - Geen Krant-account → altijd `null` (bestaande profielen merken niets).
 * - Krant-account, pad binnen de grens (of /beheer voor een superadmin) → `null`.
 *   Dat dekt /nieuws zelf: de grens stuurt nooit /nieuws naar /nieuws.
 * - Krant-account, pad onbekend (`null`/leeg: de proxy-header ontbrak) →
 *   fail-closed naar /nieuws. Geen lus: de proxy zet de header op élk verzoek
 *   dat hij matcht, óók op het vervolgverzoek naar /nieuws (bewaakt in
 *   `lib/supabase/proxy.pathname-header.test.ts`).
 * - Krant-account, pad buiten de grens → /nieuws.
 */
export function krantRedirect(
  pathname: string | null | undefined,
  modules: readonly ModuleId[],
  isSuperadmin: boolean,
): string | null {
  if (!isKrantAccount(modules)) return null
  if (!pathname) return KRANT_HOME_HREF
  return isRouteAllowed(pathname, modules, isSuperadmin) ? null : KRANT_HOME_HREF
}

/**
 * Wordt Fin (companion, chatpaneel, "Vraag Fin", de AI-keuze-interstitial)
 * gemount? Nee voor een Krant-account (besluit B11), ja voor al het andere.
 */
export function shouldMountFin(modules: readonly ModuleId[]): boolean {
  return !isKrantAccount(modules)
}

/**
 * Ontvangt dit profiel de wekelijkse briefing? Een Krant-account heeft geen
 * briefing: die gaat over zijn geld, en daar weet de Krant niets van.
 */
export function receivesBriefing(row: ActiveModulesRow | null | undefined): boolean {
  return !isKrantProfile(row)
}

/**
 * Krijgt dit profiel dagelijkse balans-snapshots (snapshots-cron)? Nee voor een
 * Krant-account (Krant 2C): een snapshot legt zijn vermogen en spaarquote vast,
 * en daar weet de Krant niets van — net als bij de briefing. Sinds 2C rondt een
 * Krant-account zijn onboarding af (`onboarding_completed = true`), waardoor de
 * cron hem anders zou meenemen.
 */
export function receivesSnapshots(row: ActiveModulesRow | null | undefined): boolean {
  return !isKrantProfile(row)
}

/** De weigertekst van de AI-poort (`checkTierGate`) bij een Krant-account. */
export const KRANT_GEEN_AI_MESSAGE = 'De Krant werkt zonder AI. Deze functie hoort bij het volledige TriFinity.'

/** De 403-tekst van de add-on-route (ADR 0157) bij een Krant-account. */
export const KRANT_GEEN_ADDON_MESSAGE =
  'Add-ons horen bij het volledige TriFinity. In de Krant zet je ze niet aan.'
