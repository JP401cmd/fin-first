// ── Goal Types ──────────────────────────────────────────────────────────
// Doelen die de gebruiker tijdens onboarding kón kiezen. Die stap is op
// 12 juni 2026 verwijderd en komt niet terug (eigenaarsbesluit UR3-28,
// 6 september 2026); wat rest is de vertaling van een doel-slug uit een
// oud localStorage-concept naar de modules die het activeert. Zie de
// toelichting bovenaan `catalog.ts`.

import type { ModuleId } from '@/lib/module-registry'

export type GoalSlug =
  | 'grip-uitgaven'
  | 'vermogen-overzicht'
  | 'noodfonds'
  | 'schulden-aflossen'
  | 'eerder-stoppen'
  | 'bewust-leven'

export interface GoalCatalogEntry {
  slug: GoalSlug
  /** Modules die geactiveerd worden wanneer dit doel wordt meegestuurd */
  modulesPreset: ModuleId[]
}
