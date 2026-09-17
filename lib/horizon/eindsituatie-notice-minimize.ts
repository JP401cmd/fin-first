/**
 * Eindsituatie-melding op /toekomst — minimaliseren (pure).
 *
 * "Waarom blijft er aan het eind zoveel over?" (plan 17 sep 2026, onderdeel D). De
 * detector (`eindsituatie-duiding.ts`) en de copy (`eindsituatie-copy.ts`) leveren de
 * inhoud; deze module regelt alleen het onthouden van "Minimaliseren", zusje van de
 * AOW-melding (`aow-notice-minimize.ts`): zelfde PUT-pad, eigen pref-only sleutel.
 *
 * NIVEAU: geen escalatie-as — de melding is informatief (geen stoplichtstatus). Het
 * opgeslagen "niveau" is een numerieke vlag 1, omdat het PUT-pad per pref-only sleutel
 * een numerieke narrower eist (pariteitstest `lib/page-status/__tests__/
 * minimize-key-allowlist.test.ts`). Eenmaal geminimaliseerd blijft de melding ingeklapt
 * tot de gebruiker haar zelf heropent.
 *
 * Pure module (géén 'use client', geen React/Supabase).
 */

import type { BannerDisplay } from '@/lib/page-status/display'

/** Sleutel in `profiles.status_banner_minimized` — géén /overzicht-route. */
export const EINDSITUATIE_NOTICE_MINIMIZE_KEY = '/toekomst/eindsituatie'

/** De enige geldige opgeslagen waarde: 1 = geminimaliseerd. */
export const EINDSITUATIE_MINIMIZED_FLAG = 1

/** Smalt een onbekende jsonb-waarde tot de vlag (1) of null. Alleen het getal 1 telt. */
export function asEindsituatieMinimizedFlag(value: unknown): number | null {
  return value === EINDSITUATIE_MINIMIZED_FLAG ? EINDSITUATIE_MINIMIZED_FLAG : null
}

/** `'none'` zonder duiding · `'minimized'` bij een opgeslagen vlag · anders `'expanded'`. */
export function resolveEindsituatieNoticeDisplay(
  present: boolean,
  minimizedFlag: number | null,
): BannerDisplay | 'none' {
  if (!present) return 'none'
  return minimizedFlag === EINDSITUATIE_MINIMIZED_FLAG ? 'minimized' : 'expanded'
}
