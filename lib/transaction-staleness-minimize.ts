/**
 * Minimaliseren van de "Gegevens verouderd"-melding op /overzicht (pure).
 *
 * Numerieke zustermodule van `lib/page-status/display.ts` en van
 * `lib/horizon/deficit-loan-minimize.ts`. Die eerste beslist expanded-vs-
 * minimized op een STOPLICHT-NIVEAU (warn/bad/info); deze melding heeft zo'n
 * niveau niet — haar ernst zit in het AANTAL MAANDEN ACHTERSTAND
 * (`TransactionFreshness.monthsBehind`). Daarom slaat ze dat getal op als
 * "niveau" en escaleert ze op groei ervan. Het `BannerDisplay`-contract en de
 * semantiek ("escalatie heropent altijd") zijn identiek en worden bewust
 * hergebruikt — geen tweede weergave-taal.
 *
 * ── WAAROM MINIMALISEERBAAR (B-015) ────────────────────────────────────────
 * De melding heeft een directe uitweg (importeren of koppelen), maar die uitweg
 * kán maanden op zich laten wachten — en zolang staat de melding bovenaan élk
 * bezoek van /overzicht. Precies het geval waarvoor de meldingen-conventie in
 * CLAUDE.md bestaat: inklappen tot een gekleurd punt naast de pagina-'i', met
 * automatische heropening zodra het erger wordt.
 *
 * ── ESCALATIE-DREMPEL: +2 MAANDEN, NIET +1 ─────────────────────────────────
 * De maat is DISCREET en KLOK-GEDREVEN: `monthsBehind` loopt vanzelf met één op
 * bij elke maandwissel, zónder dat er iets aan de data verandert. Dat maakt hem
 * wezenlijk anders dan de tekort-piek van /toekomst (die alleen beweegt bij een
 * echte planwijziging, vandaar dáár een relatieve 10%-drempel).
 *
 * Een drempel van +1 zou daarom per definitie ELKE MAAND heropenen — twaalf keer
 * per jaar dezelfde melding wegklikken. Dat is exact de val die
 * `transaction-staleness.ts` bij zijn eigen drempel benoemt: "een melding die
 * elke maand een paar dagen afgaat leert de gebruiker haar te negeren".
 *
 * We hergebruiken daarom `TX_STALE_AFTER_MONTHS` (= 2) als delta: dat is de
 * hoeveelheid stilte die deze module zélf "de moeite van het melden waard"
 * noemt. Nog eens zóveel stilte sinds je minimaliseerde is een echte
 * verslechtering en verdient de melding opnieuw; één maand extra is de gewone
 * voortgang van de kalender. Bewust afgeleid (geen los getal): het is dezelfde
 * grootheid, dus als de onset-drempel ooit verschuift, verschuift de
 * heropen-drempel mee.
 *
 * Krimp escaleert nooit: een JONGERE laatste boeking betekent dat er geïmporteerd
 * is — dan verdwijnt de melding vanzelf (of blijft ingeklapt).
 *
 * Pure module (géén 'use client', geen React/Supabase) zodat de matrix
 * rechtstreeks getest kan worden.
 */

import type { BannerDisplay } from '@/lib/page-status/display'
import { TX_STALE_AFTER_MONTHS } from '@/lib/transaction-staleness'

/**
 * Sleutel in de JSONB-map `profiles.status_banner_minimized`. Bewust een
 * route-achtige sleutel in dezelfde naamruimte als de /overzicht-routes, zodat
 * er één opslagplaats voor "geminimaliseerde meldingen" blijft. Deze sleutel is
 * GEEN /overzicht-route: hij staat niet in `ROUTE_FAMILY` en heeft geen
 * server-berekende status — de melding komt uit het maandaggregaat dat de
 * pagina toch al ophaalt.
 */
export const STALE_TX_NOTICE_MINIMIZE_KEY = '/overzicht/gegevens-verouderd'

/**
 * Heropen-delta in hele maanden. Zie de kop van dit bestand voor de motivering;
 * afgeleid van de onset-drempel omdat het dezelfde grootheid is.
 */
export const STALE_TX_ESCALATION_MONTHS = TX_STALE_AFTER_MONTHS

/** Bovengrens voor een opgeslagen maandaantal — honderd jaar achterstand. */
export const STALE_MINIMIZED_MONTHS_MAX = 1200

/**
 * Smalt een onbekende jsonb-waarde tot een geldig opgeslagen maandaantal (hele,
 * niet-negatieve maanden) of null. Strikt numeriek: dezelfde map draagt voor
 * /overzicht-routes strings ('warn'/'bad'/'info'), en die mogen hier nooit als
 * maandaantal landen.
 */
export function asStaleMinimizedMonths(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  // Bovengrens: zonder klem is `1e308` een geldige waarde, en daarna haalt
  // `monthsBehind` de escalatiedrempel nooit meer — de melding komt voor die
  // gebruiker nooit terug. Honderd jaar achterstand is ruim voorbij elke echte
  // administratie; alles daarboven is geen maandaantal maar rommel.
  if (value > STALE_MINIMIZED_MONTHS_MAX) return null
  return Math.round(value)
}

/**
 * Bepaalt de weergave van de "Gegevens verouderd"-melding.
 *
 * @param monthsBehind Het aantal maanden achterstand uit de HUIDIGE render
 *   (`TransactionFreshness.monthsBehind`), of null wanneer de data vers is /
 *   er geen historie is — de caller past de eigen versheids-gating al toe.
 * @param minimizedMonths Het maandaantal waarop de gebruiker eerder
 *   minimaliseerde, of null als hij nooit minimaliseerde.
 * @returns `'none'` zonder melding · `'minimized'` alléén wanneer er een
 *   opgeslagen maandaantal is én de achterstand niet materieel gegroeid is ·
 *   anders `'expanded'`.
 */
export function resolveStaleNoticeDisplay(
  monthsBehind: number | null,
  minimizedMonths: number | null,
): BannerDisplay | 'none' {
  if (monthsBehind == null || !Number.isFinite(monthsBehind)) return 'none'
  if (minimizedMonths == null) return 'expanded'
  // Een opgeslagen 0 heeft geen speciale tak nodig: minimaliseren kan alleen
  // terwijl de melding staat (monthsBehind >= TX_STALE_AFTER_MONTHS), dus een
  // 0 in de map is per definitie corrupt en valt hieronder vanzelf naar
  // 'expanded' — de veilige kant (tonen), net als een leesfout in readMinimizedMap.
  return monthsBehind >= minimizedMonths + STALE_TX_ESCALATION_MONTHS
    ? 'expanded'
    : 'minimized'
}
