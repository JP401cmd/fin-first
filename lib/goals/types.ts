// ── Goal Types ──────────────────────────────────────────────────────────
// Outcome-georiënteerde doelen die de gebruiker tijdens onboarding kiest.
// Vervangen de oude module-georiënteerde IntentId-keuze.

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
  /** Card-titel (bv. "Grip op je uitgaven") */
  label: string
  /** Korte tagline onder de label (bv. "Budgetteren en besparen") */
  tagline: string
  /** Eerste-persoon beschrijving (bv. "Ik wil weten waar mijn geld naartoe gaat...") */
  description: string
  /** Lucide icon naam */
  icon: string
  /** Emoji-fallback voor card-grids zonder lucide-render */
  emoji: string
  /** Eén doel mag de prominente "aanbevolen" plek krijgen op de keuze-pagina */
  primary?: boolean
  /** Modules die geactiveerd worden wanneer dit doel gekozen wordt */
  modulesPreset: ModuleId[]
}
