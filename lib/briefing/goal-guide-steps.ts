// ── Goal Guide Steps ────────────────────────────────────────────────────
// Default stappenplan per goal voor de goalGuide briefing-card op /will.
// Admin kan per stap label/href editen via app_settings key 'goal_guide_steps'.
//
// Type-shape `ModuleGuideStep` is hergebruikt zodat het bestaande
// briefing-card-render-pad ongewijzigd blijft. We voegen alleen een nieuwe
// index-laag toe (per `GoalSlug` ipv `ModuleId`).

import type { GoalSlug } from '@/lib/goals/types'
import type { ModuleGuideStep } from './module-guide-steps'

// ── Display Order ───────────────────────────────────────────────────────
// Volgorde voor admin-pagina + render-fallback.

export const GOAL_GUIDE_DISPLAY_ORDER: readonly GoalSlug[] = [
  'grip-uitgaven',
  'vermogen-overzicht',
  'noodfonds',
  'schulden-aflossen',
  'eerder-stoppen',
  'bewust-leven',
] as const

// ── Default Steps per Goal ─────────────────────────────────────────────

export const DEFAULT_GOAL_GUIDE_STEPS: Record<GoalSlug, ModuleGuideStep[]> = {
  'grip-uitgaven': [
    { key: 'gu_income', label: 'Voer je netto-inkomen in', href: '/mijn/profiel#income' },
    { key: 'gu_cash', label: 'Voeg je betaalrekening toe', href: '/overzicht/cashflow' },
    { key: 'gu_budgets', label: 'Stel 3 budgetten in', href: '/overzicht/cashflow/budget' },
    { key: 'gu_first_import', label: 'Importeer je eerste afschrift', href: '/mijn/koppelingen' },
    { key: 'gu_review_month', label: 'Bekijk je maand-overzicht', href: '/mijn/checkins' },
  ],
  'vermogen-overzicht': [
    { key: 'vo_first_asset', label: 'Voeg je eerste bezit toe', href: '/overzicht/bezittingen' },
    { key: 'vo_assets_3', label: 'Voeg 3 bezittingen toe', href: '/overzicht/bezittingen' },
    { key: 'vo_debts', label: 'Registreer je schulden (of bevestig: geen)', href: '/overzicht/schulden' },
    { key: 'vo_first_snapshot', label: 'Maak je eerste vermogenssnapshot', href: '/overzicht' },
    { key: 'vo_box3', label: 'Bekijk je Box 3 inzicht', href: '/overzicht/belasting/box3' },
  ],
  noodfonds: [
    { key: 'nf_expenses', label: 'Bevestig je geschatte maandlasten', href: '/mijn/profiel#expenses' },
    { key: 'nf_calc', label: 'Stel je doelbuffer in (3 of 6 maanden)', href: '/toekomst/doelen' },
    { key: 'nf_link_asset', label: 'Koppel je spaarrekening aan dit doel', href: '/toekomst/doelen' },
    { key: 'nf_monthly_save', label: 'Plan een maandelijkse storting', href: '/overzicht/cashflow/budget' },
    { key: 'nf_milestone_30', label: 'Eerste mijlpaal: 1 maand buffer', href: '/toekomst/doelen' },
  ],
  'schulden-aflossen': [
    { key: 'sa_register', label: 'Registreer al je schulden', href: '/overzicht/schulden' },
    { key: 'sa_priorities', label: 'Sorteer op rente (hoogste eerst)', href: '/overzicht/schulden' },
    { key: 'sa_payoff_goal', label: 'Stel een aflossingsdoel in', href: '/toekomst/doelen' },
    { key: 'sa_extra', label: 'Plan een extra maandelijkse aflossing', href: '/overzicht/schulden' },
    { key: 'sa_first_progress', label: 'Eerste aflossingsmoment vastleggen', href: '/overzicht/schulden' },
  ],
  'eerder-stoppen': [
    { key: 'es_assets', label: 'Vermogen registreren', href: '/overzicht/bezittingen' },
    { key: 'es_expenses', label: 'Maandlasten in beeld', href: '/overzicht/cashflow/budget' },
    { key: 'es_horizon', label: 'Vul rendement & inflatie in', href: '/toekomst/voorkeuren' },
    { key: 'es_fire_calc', label: 'Zie je FIRE-leeftijd', href: '/toekomst' },
    { key: 'es_scenario', label: 'Speel met scenario’s', href: '/toekomst/whatif' },
    { key: 'es_lifeevent', label: 'Voeg levensgebeurtenissen toe', href: '/toekomst/gebeurtenissen' },
  ],
  'bewust-leven': [
    { key: 'bl_intent', label: 'Definieer je waarom', href: '/mijn/profiel' },
    { key: 'bl_first_checkin', label: 'Doe je eerste maand-checkin', href: '/mijn/checkins' },
    { key: 'bl_pattern', label: 'Bekijk je beslissingspatronen', href: '/overzicht/tips' },
    { key: 'bl_inzicht', label: 'Lees een AI-voorstel', href: '/overzicht/tips' },
    { key: 'bl_completed_action', label: 'Voer minimaal 1 actie uit', href: '/overzicht/tips' },
  ],
}

// ── Getter (defaults + admin-overrides via app_settings) ───────────────

/**
 * Get goal-guide steps with optional override from app_settings.
 * Falls back to DEFAULT_GOAL_GUIDE_STEPS when no override is provided.
 *
 * @param overrides - Partial overrides from app_settings (key: 'goal_guide_steps').
 *   Pass the parsed JSON value, or undefined to use defaults.
 */
export function getGoalGuideSteps(
  overrides?: Partial<Record<GoalSlug, ModuleGuideStep[]>>,
): Record<GoalSlug, ModuleGuideStep[]> {
  if (!overrides) return DEFAULT_GOAL_GUIDE_STEPS

  return {
    ...DEFAULT_GOAL_GUIDE_STEPS,
    ...overrides,
  }
}

/**
 * Prefix die we gebruiken om goal-keys in module_guide_state JSONB op te
 * slaan zonder dat ze botsen met module-id's. De client-hook stuurt
 * `goal:${slug}` als moduleId naar /api/module-guide/progress, en de server
 * schrijft dat als JSONB-key.
 *
 * Reden om te prefixen ipv een aparte tabel: voorkomt schema-wijziging en
 * laat goal- en module-progress in dezelfde row leven (queries blijven
 * trivial).
 */
export const GOAL_PROGRESS_KEY_PREFIX = 'goal:' as const

/** Bouw de progress-key voor een goal-slug */
export function goalProgressKey(slug: GoalSlug): string {
  return `${GOAL_PROGRESS_KEY_PREFIX}${slug}`
}
