/**
 * "AOW ontbreekt"-melding op /toekomst — minimaliseren + kopij (pure).
 *
 * TPR-04 (eigenaarsbesluit 13 sep 2026): zonder actief AOW-event rekent de kern
 * bewust met €0 AOW — géén terugval op volledige opbouw — maar niet meer stil. De
 * adapter zet een notice met code `aow_ontbreekt` (`adapter/events.ts#mapAow`), die via
 * de convergentie-uitkomst en `useHorizonFireSim` op /toekomst landt als
 * minimaliseerbare melding (bestaand patroon: zusje van de tekort-lening-melding,
 * `lib/horizon/deficit-loan-minimize.ts`) plus een regel in de kassabon.
 *
 * NIVEAU: de tekort-melding slaat een PIEK op en escaleert op groei; deze melding
 * heeft geen maat — er is wel of geen AOW-event. Het opgeslagen "niveau" is daarom
 * een numerieke vlag (`AOW_MINIMIZED_FLAG` = 1). Numeriek en niet de stoplicht-enum,
 * omdat het PUT-pad per pref-only sleutel een numerieke narrower eist (pariteitstest
 * `lib/page-status/__tests__/minimize-key-allowlist.test.ts`): de JSONB-map draagt voor
 * /overzicht-routes strings, en die mogen hier nooit als vlag landen. Geen escalatie-
 * dimensie: eenmaal geminimaliseerd blijft de melding ingeklapt tot de gebruiker haar
 * zelf heropent — dezelfde semantiek als de informatieve vrijheidsbanner ('info').
 *
 * Pure module (géén 'use client', geen React/Supabase).
 */

import type { BannerDisplay } from '@/lib/page-status/display'

/**
 * Sleutel in de JSONB-map `profiles.status_banner_minimized`. Route-achtig in dezelfde
 * naamruimte als de /overzicht-routes en de tekort-lening-sleutel; GEEN /overzicht-route
 * (niet in `ROUTE_FAMILY`, geen server-berekende status — de melding komt uit de run).
 */
export const AOW_NOTICE_MINIMIZE_KEY = '/toekomst/aow-ontbreekt'

/** De enige geldige opgeslagen waarde: 1 = geminimaliseerd. */
export const AOW_MINIMIZED_FLAG = 1

/**
 * Smalt een onbekende jsonb-waarde tot de geminimaliseerd-vlag (1) of null. Strikt:
 * alleen het getal 1 telt — strings ('warn'/'bad'/'info'), NaN, 0 en negatieve
 * getallen zijn geen vlag.
 */
export function asAowMinimizedFlag(value: unknown): number | null {
  return value === AOW_MINIMIZED_FLAG ? AOW_MINIMIZED_FLAG : null
}

/**
 * Weergave van de AOW-melding.
 *
 * @param present Draagt de huidige run de `aow_ontbreekt`-notice (na view-gating)?
 * @param minimizedFlag De opgeslagen vlag (1) of null.
 * @returns `'none'` zonder notice · `'minimized'` bij een opgeslagen vlag · anders `'expanded'`.
 */
export function resolveAowNoticeDisplay(
  present: boolean,
  minimizedFlag: number | null,
): BannerDisplay | 'none' {
  if (!present) return 'none'
  return minimizedFlag === AOW_MINIMIZED_FLAG ? 'minimized' : 'expanded'
}

/**
 * Kopij van de melding — norm keuze · effect · waarom (eigenaarsnorm 13 sep 2026),
 * beschrijvend en niet aansporend. Eén home voor de melding boven de grafiek, de
 * kassabon-regel en de i-info; de deeplink opent de AOW-strategie-editor direct.
 */
export const AOW_ONTBREEKT_COPY = {
  kop: 'Geen AOW op je tijdas',
  /** Keuze: wat er (niet) staat. */
  keuze: 'Er staat geen actieve AOW-gebeurtenis op je tijdas, dus de projectie rekent met €0 AOW.',
  /** Effect: wat dat met de grafiek en het vrijheidsmoment doet. */
  effect:
    'Vanaf je AOW-leeftijd komt er in de grafiek geen AOW-inkomen bij; je vermogen draagt je uitgaven dan helemaal alleen, waardoor je vrijheidsmoment later uitvalt dan wanneer de AOW meetelt.',
  /** Waarom relevant. */
  waarom:
    'Voor de meeste huishoudens is de AOW de grootste vaste post na het stoppen — zonder AOW is het beeld voorzichtiger dan de werkelijkheid.',
  actieLabel: 'Naar je AOW-gebeurtenis',
  actieHref: '/toekomst/gebeurtenissen?strategie=aow',
  /** Kassabon-regel (label · waarde). */
  kassabonLabel: 'AOW-inkomen',
  kassabonWaarde: '€ 0 — geen AOW-gebeurtenis',
} as const
