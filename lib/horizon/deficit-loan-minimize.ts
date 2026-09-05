/**
 * Minimaliseren van de tekort-lening-melding op /toekomst (pure).
 *
 * Numerieke zustermodule van `lib/page-status/display.ts`. Die module beslist
 * expanded-vs-minimized op een STOPLICHT-NIVEAU (warn/bad/info); de
 * tekort-lening-melding heeft zo'n niveau niet — haar ernst zit in de PIEK van
 * de lening. Daarom slaat deze melding de piek (afgerond, nominaal) op als
 * "niveau" en escaleert ze op groei van dat bedrag. Het `BannerDisplay`-contract
 * en de semantiek ("escalatie heropent altijd") zijn identiek en worden bewust
 * hergebruikt — geen tweede weergave-taal.
 *
 * ESCALATIE-DREMPEL — 10% boven de opgeslagen piek. Motivering:
 *  - Relatief (niet absoluut) omdat een tekort-piek van €5.000 en één van
 *    €300.000 allebei kunnen voorkomen; één vaste euro-drempel zou bij de eerste
 *    bij elke herberekening heropenen en bij de tweede nooit.
 *  - 10% ligt ruim boven de ruis van een herberekening (rendement-/inflatie-
 *    afronding, een gewijzigde maandinleg) maar onder een échte planwijziging
 *    (andere woonstrategie, andere stopleeftijd) — precies de gevallen waarin de
 *    gebruiker de melding opnieuw moet zien.
 *  - Krimp escaleert nooit: een kleinere piek is geen verslechtering.
 *
 * Pure module (géén 'use client', geen React/Supabase) zodat de matrix
 * rechtstreeks getest kan worden.
 */

import type { BannerDisplay } from '@/lib/page-status/display'

/**
 * Sleutel in de JSONB-map `profiles.status_banner_minimized`. Bewust een
 * route-achtige sleutel in dezelfde naamruimte als de /overzicht-routes, zodat
 * er één opslagplaats voor "geminimaliseerde meldingen" blijft. Deze sleutel is
 * GEEN /overzicht-route: hij staat niet in `ROUTE_FAMILY` en heeft geen
 * server-berekende status — de melding komt uit de al geladen horizon-run.
 */
export const DEFICIT_NOTICE_MINIMIZE_KEY = '/toekomst/tekort-lening'

/** Heropen-drempel: de melding klapt weer uit boven 110% van de opgeslagen piek. */
export const DEFICIT_ESCALATION_FACTOR = 1.1

/** Bovengrens voor een opgeslagen piek — duizend miljard euro tekort. */
export const DEFICIT_MINIMIZED_PEAK_MAX = 1e12

/**
 * Smalt een onbekende jsonb-waarde tot een geldige opgeslagen piek (hele euro's,
 * niet-negatief) of null. Strikt numeriek: de map draagt voor /overzicht-routes
 * strings ('warn'/'bad'/'info'), en die mogen hier nooit als bedrag landen.
 */
export function asDeficitMinimizedPeak(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  // Bovengrens, zelfde reden als bij de stale-melding: een absurd hoge piek is
  // een eindig getal, wordt opgeslagen, en zet escalatie daarna voorgoed uit.
  if (value > DEFICIT_MINIMIZED_PEAK_MAX) return null
  return Math.round(value)
}

/**
 * Bepaalt de weergave van de tekort-lening-melding.
 *
 * @param currentPeak De piek uit de HUIDIGE run (`DeficitLoanNotice.peak`), of
 *   null wanneer er geen (zichtbare) tekort-lening is.
 * @param minimizedPeak De piek waarop de gebruiker eerder minimaliseerde, of
 *   null als hij nooit minimaliseerde.
 * @returns `'none'` zonder melding · `'minimized'` alléén wanneer er een
 *   opgeslagen piek is én de huidige piek niet materieel groter is · anders
 *   `'expanded'`.
 */
export function resolveDeficitNoticeDisplay(
  currentPeak: number | null,
  minimizedPeak: number | null,
): BannerDisplay | 'none' {
  if (currentPeak == null || !Number.isFinite(currentPeak)) return 'none'
  if (minimizedPeak == null) return 'expanded'
  // Een opgeslagen piek van 0 (of lager) is geen zinnige ondergrens — dan zou
  // élke piek escaleren én tegelijk elke drempel nul zijn. Toon de melding.
  if (minimizedPeak <= 0) return 'expanded'
  return currentPeak > minimizedPeak * DEFICIT_ESCALATION_FACTOR
    ? 'expanded'
    : 'minimized'
}
