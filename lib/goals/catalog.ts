// ── Goal Catalog ────────────────────────────────────────────────────────
// Rest van de doel-stap die op 12 juni 2026 uit de onboarding is gehaald
// (commit d300045ca, "opschoonronde — onboarding 5 stappen"). Nieuwe
// gebruikers kiezen geen doel meer, en de eigenaar heeft dat inkortings-
// besluit op 6 september 2026 expliciet bevestigd (kaart UR3-28): de vraag
// komt niet terug, ook niet als afgeleid thuisscherm. Bouw hier dus niets
// terug zonder een nieuw eigenaarsbesluit.
//
// Wat hier bewust bleef staan is precies wat nog gelezen wordt:
//   • `GOAL_MODULE_PRESETS` — `app/api/onboarding/save-own-data` leidt hieruit
//     de te activeren modules af zodra een client alsnog doel-slugs meestuurt.
//   • `isGoalSlug` — type-guard op diezelfde invoer, gebruikt door de
//     onboarding-client en de concept-herstelroute (`draft-persistence.ts`).
//
// Beide paden kunnen alleen nog vuren voor een localStorage-concept van vóór
// juni 2026; ze staan er als vangnet, niet als levende functionaliteit.
//
// Opgeruimd bij UR3-28 (7 september 2026), alles zonder één consument:
// `getGoalFirstWinPath` (dood én wijzend naar de verdwenen routes /will,
// /core, /horizon), `GOAL_CATALOG`, `GOAL_LABELS`, `INTENT_TO_GOAL_FALLBACK`,
// `GOAL_SPEECH_TEXT`, `GOAL_DEFAULT_SPEECH`, `lib/goals/icons.tsx` en de
// presentatievelden op `GoalCatalogEntry` (label, tagline, description, icon,
// emoji, primary) — de hele schermtaal van een stap die niet meer bestaat.
// Staat in de git-historie als het ooit terug moet.

import type { GoalCatalogEntry, GoalSlug } from './types'

// ── Catalog Entries ─────────────────────────────────────────────────────
// Module-privé: buiten dit bestand wordt alleen nog de afgeleide
// preset-map en de type-guard gelezen.

const GOAL_CATALOG_ENTRIES: readonly GoalCatalogEntry[] = [
  { slug: 'bewust-leven', modulesPreset: ['budgetteren', 'inzicht_acties'] },
  { slug: 'grip-uitgaven', modulesPreset: ['budgetteren'] },
  { slug: 'vermogen-overzicht', modulesPreset: ['vermogensregistratie'] },
  { slug: 'noodfonds', modulesPreset: ['budgetteren', 'inzicht_acties'] },
  { slug: 'schulden-aflossen', modulesPreset: ['vermogensregistratie', 'inzicht_acties'] },
  {
    slug: 'eerder-stoppen',
    modulesPreset: ['vermogensregistratie', 'toekomstplannen', 'inzicht_acties'],
  },
] as const

const GOAL_SLUGS: readonly GoalSlug[] = GOAL_CATALOG_ENTRIES.map((e) => e.slug)

// ── Publieke oppervlak ──────────────────────────────────────────────────

/** Modulesets per doel — gebruikt door de save-onboarding-route */
export const GOAL_MODULE_PRESETS: Record<GoalSlug, GoalCatalogEntry['modulesPreset']> =
  Object.fromEntries(GOAL_CATALOG_ENTRIES.map((e) => [e.slug, e.modulesPreset])) as Record<
    GoalSlug,
    GoalCatalogEntry['modulesPreset']
  >

/** Type-guard voor onbekende strings (zoals een localStorage-veld) */
export function isGoalSlug(value: unknown): value is GoalSlug {
  return typeof value === 'string' && (GOAL_SLUGS as readonly string[]).includes(value)
}
